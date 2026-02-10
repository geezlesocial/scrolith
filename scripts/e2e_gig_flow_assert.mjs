import axios from 'axios';
import { chromium } from 'playwright';
import { io } from 'socket.io-client';

const FRONTEND = process.env.E2E_FRONTEND || 'http://127.0.0.1:3000';
const BACKEND = process.env.E2E_BACKEND || 'http://127.0.0.1:5000';

const now = Date.now();
const sellerCreds = {
  email: `e2e.seller.${now}@local.test`,
  name: `E2E Seller ${now}`,
  password: 'Passw0rd123!',
  role: 'FREELANCER'
};
const buyerCreds = {
  email: `e2e.buyer.${now}@local.test`,
  name: `E2E Buyer ${now}`,
  password: 'Passw0rd123!',
  role: 'EMPLOYER'
};

const http = axios.create({ baseURL: BACKEND, timeout: 20000 });

function seedAuth(context, token, user) {
  return context.addInitScript(({ tokenValue, userValue }) => {
    try {
      localStorage.setItem('token', tokenValue);
      localStorage.setItem('user', JSON.stringify(userValue));
      document.cookie = `Scrolith_token=${encodeURIComponent(tokenValue)}; path=/; SameSite=Lax`;
    } catch {}
  }, { tokenValue: token, userValue: user });
}

async function registerOrLogin(creds) {
  try {
    const reg = await http.post('/api/auth/register', creds);
    if (reg?.data?.token && reg?.data?.user) {
      return { token: reg.data.token, user: reg.data.user, mode: 'registered' };
    }
  } catch (error) {
    const status = error?.response?.status;
    if (status !== 409) {
      throw error;
    }
  }

  const login = await http.post('/api/auth/login', {
    email: creds.email,
    password: creds.password
  });

  if (!login?.data?.token || !login?.data?.user) {
    throw new Error(`Login failed for ${creds.email}`);
  }

  return { token: login.data.token, user: login.data.user, mode: 'logged-in' };
}

async function createGig(token) {
  const payload = {
    title: `E2E Gig ${Date.now()}`,
    description: 'E2E realtime gig assertion',
    category: 'Programming',
    subcategory: 'Web Development',
    price: { type: 'fixed', amount: 99 },
    packages: [
      {
        name: 'Basic',
        description: 'Basic package',
        deliveryDays: 3,
        revisions: 1,
        price: 99,
        features: ['Feature A']
      }
    ],
    images: [],
    tags: ['e2e', 'realtime']
  };

  const res = await http.post('/api/gigs', payload, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const gig = res?.data?.data;
  if (!gig?.id) {
    throw new Error('Gig creation failed: missing gig id');
  }

  return gig;
}

async function waitForMessageOnSellerPage(page, msg, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const visibleCount = await page.locator(`text=${msg}`).count();
    if (visibleCount > 0) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function run() {
  console.log('[e2e] Checking backend health...');
  const health = await http.get('/api/health');
  console.log('[e2e] Backend health:', health.data?.status || 'unknown');

  console.log('[e2e] Creating/login test users...');
  const seller = await registerOrLogin(sellerCreds);
  const buyer = await registerOrLogin(buyerCreds);
  console.log('[e2e] Seller:', seller.user.id, seller.mode);
  console.log('[e2e] Buyer:', buyer.user.id, buyer.mode);

  console.log('[e2e] Creating gig as seller...');
  const gig = await createGig(seller.token);
  console.log('[e2e] Gig created:', gig.id);

  const uniqueMessage = `E2E gig chat ${Date.now()}`;

  let observerCount = 0;
  const observerPayloads = [];
  const observerSocket = io(`${BACKEND}/community`, {
    path: '/socket.io',
    transports: ['websocket'],
    query: {
      userId: seller.user.id,
      role: (seller.user.role || 'freelancer').toString().toLowerCase(),
      token: seller.token
    }
  });
  let observerSocketId = null;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Observer socket connect timeout')), 10000);
    observerSocket.on('connect', () => {
      clearTimeout(timer);
      observerSocketId = observerSocket.id || null;
      observerSocket.emit('community:join', { userId: seller.user.id });
      resolve(true);
    });
    observerSocket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  observerSocket.on('messages:new', (payload) => {
    if (payload?.text === uniqueMessage) {
      observerCount += 1;
      observerPayloads.push({
        conversationId: payload.conversationId || payload.conversation_id,
        senderId: payload.senderId || payload.sender_id,
        text: payload.text,
        at: new Date().toISOString()
      });
    }
  });

  const browser = await chromium.launch({ headless: true });
  const sellerCtx = await browser.newContext();
  const buyerCtx = await browser.newContext();

  await seedAuth(sellerCtx, seller.token, seller.user);
  await seedAuth(buyerCtx, buyer.token, buyer.user);

  const sellerPage = await sellerCtx.newPage();
  const buyerPage = await buyerCtx.newPage();

  console.log('[e2e] Opening seller session /messages...');
  await sellerPage.goto(`${FRONTEND}/messages`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sellerPage.waitForTimeout(2000);

  console.log('[e2e] Opening buyer session gig detail...');
  await buyerPage.goto(`${FRONTEND}/gigs/${gig.id}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await buyerPage.waitForTimeout(2500);

  const floatingChatButton = buyerPage.locator('button').filter({ hasText: 'Message' }).filter({ hasText: seller.user.name }).first();
  const floatingExists = await floatingChatButton.count();
  if (!floatingExists) {
    throw new Error('Floating gig chat launcher not found on gig detail');
  }

  console.log('[e2e] Opening gig chat bar...');
  await floatingChatButton.click();

  const textarea = buyerPage.locator('textarea[placeholder="Write a message..."]');
  await textarea.waitFor({ state: 'visible', timeout: 12000 });
  await textarea.fill(uniqueMessage);

  const sendButton = buyerPage.getByRole('button', { name: 'Send message' });
  await sendButton.click();
  console.log('[e2e] Message sent from buyer chat bar:', uniqueMessage);

  const seenOnSellerUi = await waitForMessageOnSellerPage(sellerPage, uniqueMessage, 30000);

  await buyerPage.waitForTimeout(3500);

  const result = {
    gigId: gig.id,
    message: uniqueMessage,
    sellerId: seller.user.id,
    buyerId: buyer.user.id,
    sellerUiReceived: seenOnSellerUi,
    observerSocketId,
    observerDeliveryCount: observerCount,
    observerPayloads
  };

  console.log('[e2e] RESULT', JSON.stringify(result, null, 2));

  observerSocket.disconnect();
  await sellerCtx.close();
  await buyerCtx.close();
  await browser.close();

  if (!seenOnSellerUi) {
    throw new Error('Realtime assertion failed: message did not appear in seller session UI');
  }
  if (observerCount < 1) {
    throw new Error('Realtime assertion failed: observer socket did not receive messages:new');
  }
}

run().catch((error) => {
  console.error('[e2e] FAILED', error?.message || error);
  process.exitCode = 1;
});
