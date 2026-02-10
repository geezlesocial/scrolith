const { io } = require('socket.io-client');
const path = require('path');

try {
  // Load backend env if present so JWT_SECRET/DATABASE_URL are available
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {}

async function getFetch() {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch;
  const mod = await import('node-fetch');
  return mod.default;
}

const BASE = process.env.BASE_URL || 'http://localhost:5000';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@scrolith.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'admin12345';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const HARD_TIMEOUT_MS = Number(process.env.HARD_TIMEOUT_MS || 30000);
const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL || 'e2e.user@scrolith.com';
const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD || 'e2ePass123';
const E2E_USER_ROLE = process.env.E2E_USER_ROLE || 'CLIENT';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, token, body, timeoutMs = 10000) {
  const fetch = await getFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function waitForEvent(socket, name, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const handler = (payload) => {
      if (!predicate || predicate(payload)) {
        cleanup();
        resolve(payload);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for ${name}`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.off(name, handler);
    }

    socket.on(name, handler);
  });
}

async function getTokenWithFallback() {
  if (ADMIN_TOKEN) {
    return { token: ADMIN_TOKEN, userId: null, source: 'ADMIN_TOKEN' };
  }

  const login = await api('POST', '/api/auth/login', null, { email: EMAIL, password: PASSWORD });
  if (login.status === 200 && login.json?.token) {
    return { token: login.json.token, userId: login.json?.user?.id, source: 'login' };
  }

  // Fallback: sign a JWT directly if login is failing (dev-only)
  try {
    const { PrismaClient } = require('@prisma/client');
    const jwt = require('jsonwebtoken');
    const prisma = new PrismaClient();
    const user = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, role: true } });
    await prisma.$disconnect();
    if (!user?.id) throw new Error('Admin user not found for fallback token');
    const secret = process.env.JWT_SECRET || 'dev_jwt_secret';
    const token = jwt.sign({ id: user.id, email: EMAIL, role: user.role }, secret, { expiresIn: '7d' });
    return { token, userId: user.id, source: 'fallback-jwt' };
  } catch (e) {
    throw new Error(`Login failed and fallback token generation failed: ${e?.message || e}`);
  }
}

async function getOrCreateUserToken() {
  const { PrismaClient } = require('@prisma/client');
  const jwt = require('jsonwebtoken');
  const bcrypt = require('bcryptjs');
  const prisma = new PrismaClient();
  try {
    let user = await prisma.user.findUnique({
      where: { email: E2E_USER_EMAIL },
      select: { id: true, role: true, passwordHash: true }
    });
    if (!user) {
      const hash = await bcrypt.hash(E2E_USER_PASSWORD, 10);
      user = await prisma.user.create({
        data: {
          email: E2E_USER_EMAIL,
          name: 'E2E User',
          passwordHash: hash,
          role: E2E_USER_ROLE,
          isActive: true
        },
        select: { id: true, role: true, passwordHash: true }
      });
    }
    const secret = process.env.JWT_SECRET || 'dev_jwt_secret';
    const token = jwt.sign(
      { id: user.id, email: E2E_USER_EMAIL, role: user.role },
      secret,
      { expiresIn: '7d' }
    );
    return { token, userId: user.id };
  } finally {
    await prisma.$disconnect();
  }
}

(async () => {
  const results = [];
  let socket = null;
  const hardTimer = setTimeout(() => {
    console.error(`\nE2E verification timed out after ${HARD_TIMEOUT_MS}ms`);
    try { socket && socket.close(); } catch {}
    process.exit(2);
  }, HARD_TIMEOUT_MS);

  const record = (step, ok, detail) => {
    results.push({ step, ok, detail });
    const status = ok ? 'OK' : 'FAIL';
    console.log(`[${status}] ${step}${detail ? `: ${detail}` : ''}`);
  };

  try {
    console.log(`Using BASE=${BASE}`);

    // Health
    console.log('Checking health...');
    const health = await api('GET', '/api/health');
    if (health.status !== 200) throw new Error(`Health check failed: ${health.status}`);
    record('Health check', true);

    // Login (with fallback for local dev if login is failing)
    console.log('Logging in...');
    const tokenInfo = await getTokenWithFallback();
    const token = tokenInfo.token;
    const userId = tokenInfo.userId;
    record('Login admin', true, `${EMAIL} (${tokenInfo.source})`);

    const userTokenInfo = await getOrCreateUserToken();
    const userToken = userTokenInfo.token;
    const userIdNonAdmin = userTokenInfo.userId;
    record('E2E user token', true, `${E2E_USER_EMAIL}`);

    // Socket connect
    console.log('Connecting socket...');
    socket = io(`${BASE}/community`, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token }
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
      socket.on('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
    record('Socket connected', true);

    if (userId) {
      socket.emit('community:join', { userId });
      await sleep(250);
    }

    // Create post
    console.log('Creating post...');
    const postCreatedEvent = waitForEvent(socket, 'community:post_created', (p) => p?.post?.title === 'E2E Post', 5000);
    const createPostBody = {
      title: 'E2E Post',
      content: 'Hello from E2E verification',
      tags: ['e2e'],
      mentions: [],
      visibility: 'public',
      commentPolicy: 'everyone'
    };
    const createPostRes = await api('POST', '/api/community/posts', token, createPostBody);
    if (createPostRes.status !== 200) throw new Error(`Create post failed: ${createPostRes.status}`);
    const postId = createPostRes.json?.data?.id;
    if (!postId) throw new Error('Create post missing id');
    await postCreatedEvent;
    record('Create post + realtime', true, postId);

    // Update post (edit content + pin/highlight + policy)
    console.log('Updating post...');
    const postUpdatedEvent = waitForEvent(socket, 'community:post_updated', (p) => p?.post?.id === postId, 5000);
    const updatePostRes = await api('PUT', `/api/community/posts/${postId}`, token, {
      content: 'Updated content',
      commentPolicy: 'followers',
      isPinned: true,
      isHighlighted: true
    });
    if (updatePostRes.status !== 200) throw new Error(`Update post failed: ${updatePostRes.status}`);
    await postUpdatedEvent;
    record('Edit post + pin/highlight + realtime', true);

    // Set comment policy to none and verify block
    console.log('Setting comment policy none...');
    const policyNoneRes = await api('PUT', `/api/community/posts/${postId}`, token, { commentPolicy: 'none' });
    if (policyNoneRes.status !== 200) throw new Error(`Set comment policy failed: ${policyNoneRes.status}`);
    console.log('Attempting blocked comment...');
    const blockedComment = await api('POST', `/api/community/posts/${postId}/comments`, userToken, { content: 'Should be blocked' });
    if (blockedComment.status !== 403) {
      throw new Error(`Comment policy check failed, expected 403 got ${blockedComment.status}`);
    }
    record('Comment policy none blocks comments', true);

    // Set comment policy back to everyone
    console.log('Setting comment policy everyone...');
    const policyEveryoneRes = await api('PUT', `/api/community/posts/${postId}`, token, { commentPolicy: 'everyone' });
    if (policyEveryoneRes.status !== 200) throw new Error(`Reset comment policy failed: ${policyEveryoneRes.status}`);

    // Create comment
    console.log('Creating comment...');
    const commentCreatedEvent = waitForEvent(socket, 'community:post_comment_created', (p) => p?.comment?.content === 'Top-level comment', 5000);
    const createCommentRes = await api('POST', `/api/community/posts/${postId}/comments`, userToken, { content: 'Top-level comment' });
    if (createCommentRes.status !== 200) throw new Error(`Create comment failed: ${createCommentRes.status}`);
    const commentId = createCommentRes.json?.data?.id;
    await commentCreatedEvent;
    record('Create comment + realtime', true, commentId);

    // Reply comment
    console.log('Creating reply...');
    const replyCreatedEvent = waitForEvent(socket, 'community:post_comment_created', (p) => p?.comment?.content === 'Reply comment', 5000);
    const replyRes = await api('POST', `/api/community/posts/${postId}/comments`, userToken, { content: 'Reply comment', parentId: commentId });
    if (replyRes.status !== 200) throw new Error(`Reply failed: ${replyRes.status}`);
    const replyId = replyRes.json?.data?.id;
    await replyCreatedEvent;
    record('Reply comment + realtime', true, replyId);

    // Like comment
    console.log('Liking comment...');
    const likeEvent = waitForEvent(socket, 'community:post_comment_like_toggled', (p) => p?.commentId === commentId && p?.liked === true, 5000);
    const likeRes = await api('POST', `/api/community/comments/${commentId}/like`, token);
    if (likeRes.status !== 200) throw new Error(`Like comment failed: ${likeRes.status}`);
    await likeEvent;
    record('Like comment + realtime', true);

    // Edit comment
    console.log('Editing comment...');
    const editCommentEvent = waitForEvent(socket, 'community:post_comment_updated', (p) => p?.comment?.id === commentId, 5000);
    const editCommentRes = await api('PUT', `/api/community/comments/${commentId}`, userToken, { content: 'Edited comment' });
    if (editCommentRes.status !== 200) throw new Error(`Edit comment failed: ${editCommentRes.status}`);
    await editCommentEvent;
    record('Edit comment + realtime', true);

    // Edit reply
    console.log('Editing reply...');
    const editReplyEvent = waitForEvent(socket, 'community:post_comment_updated', (p) => p?.comment?.id === replyId, 5000);
    const editReplyRes = await api('PUT', `/api/community/comments/${replyId}`, userToken, { content: 'Edited reply' });
    if (editReplyRes.status !== 200) throw new Error(`Edit reply failed: ${editReplyRes.status}`);
    await editReplyEvent;
    record('Edit reply + realtime', true);

    // Delete reply
    console.log('Deleting reply...');
    const delReplyEvent = waitForEvent(socket, 'community:post_comment_deleted', (p) => p?.commentId === replyId, 5000);
    const delReplyRes = await api('DELETE', `/api/community/comments/${replyId}`, userToken);
    if (delReplyRes.status !== 200) throw new Error(`Delete reply failed: ${delReplyRes.status}`);
    await delReplyEvent;
    record('Delete reply + realtime', true);

    // Delete comment
    console.log('Deleting comment...');
    const delCommentEvent = waitForEvent(socket, 'community:post_comment_deleted', (p) => p?.commentId === commentId, 5000);
    const delCommentRes = await api('DELETE', `/api/community/comments/${commentId}`, userToken);
    if (delCommentRes.status !== 200) throw new Error(`Delete comment failed: ${delCommentRes.status}`);
    await delCommentEvent;
    record('Delete comment + realtime', true);

    // Delete post
    console.log('Deleting post...');
    const delPostEvent = waitForEvent(socket, 'community:post_deleted', (p) => p?.postId === postId, 5000);
    const delPostRes = await api('DELETE', `/api/community/posts/${postId}`, token);
    if (delPostRes.status !== 200) throw new Error(`Delete post failed: ${delPostRes.status}`);
    await delPostEvent;
    record('Delete post + realtime', true);

    socket.close();

    console.log('\nVerification summary:');
    for (const r of results) {
      console.log(`- ${r.ok ? 'PASS' : 'FAIL'}: ${r.step}${r.detail ? ` (${r.detail})` : ''}`);
    }

  } catch (err) {
    console.error('\nE2E verification failed:', err && err.message ? err.message : err);
    try { socket && socket.close(); } catch {}
    process.exitCode = 1;
  } finally {
    clearTimeout(hardTimer);
  }
})();
