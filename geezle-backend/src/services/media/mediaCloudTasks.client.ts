/**
 * Phase 3B.4.1 — Cloud Tasks client for media processing enqueue.
 *
 * Uses the Cloud Tasks REST API + google-auth-library (already a dependency).
 * Fully injectable for unit tests — never creates real cloud resources from tests.
 *
 * Does not run media processors. API process remains free of ffmpeg/Sharp load paths.
 */

import { GoogleAuth } from 'google-auth-library';
import type { MediaJobKind } from './mediaProcessingQueue';

export type MediaCloudTaskPayload = {
  fileId: string;
  kind: MediaJobKind;
  processingVersion: number;
  enqueuedAt: string;
};

export type MediaCloudTasksConfig = {
  projectId: string;
  location: string;
  videoQueue: string;
  imageQueue: string;
  workerUrl: string;
  oidcServiceAccountEmail: string;
  oidcAudience: string;
  /** Optional override for API base (tests). Default: https://cloudtasks.googleapis.com/v2 */
  apiBaseUrl?: string;
};

export type CreateTaskResult =
  | { ok: true; taskName?: string; alreadyExists?: boolean }
  | { ok: false; errorCode: string; message: string };

export type MediaCloudTasksClient = {
  createMediaTask: (payload: MediaCloudTaskPayload) => Promise<CreateTaskResult>;
};

export type AccessTokenProvider = () => Promise<string>;
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ status: number; ok: boolean; text: () => Promise<string> }>;

const truthy = (v: string | undefined) =>
  ['1', 'true', 'yes', 'on'].includes(String(v || '').trim().toLowerCase());

/** Sanitize task id segment for Cloud Tasks name rules: [A-Za-z0-9_-]{1,500} */
export const sanitizeTaskIdSegment = (value: string): string =>
  String(value || '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 120);

export const buildMediaTaskId = (
  kind: MediaJobKind,
  fileId: string,
  processingVersion: number
): string => {
  const k = kind === 'video_metadata' ? 'video' : 'image';
  const id = sanitizeTaskIdSegment(fileId);
  const ver = Math.max(0, Number(processingVersion) || 0);
  // Deterministic → natural dedupe on ALREADY_EXISTS for same file+version.
  return `media-${k}-${id}-v${ver}`.slice(0, 500);
};

export const resolveMediaCloudTasksConfig = (
  env: NodeJS.ProcessEnv = process.env
): MediaCloudTasksConfig | null => {
  const projectId = String(
    env.MEDIA_TASKS_PROJECT || env.GOOGLE_CLOUD_PROJECT || env.GCP_PROJECT || ''
  ).trim();
  const location = String(env.MEDIA_TASKS_LOCATION || 'asia-southeast1').trim() || 'asia-southeast1';
  const videoQueue = String(env.MEDIA_TASKS_QUEUE_VIDEO || 'media-video').trim() || 'media-video';
  const imageQueue = String(env.MEDIA_TASKS_QUEUE_IMAGE || 'media-image').trim() || 'media-image';
  const workerUrl = String(env.MEDIA_WORKER_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const oidcServiceAccountEmail = String(env.MEDIA_TASKS_SERVICE_ACCOUNT || '').trim();
  const oidcAudience = String(env.MEDIA_TASKS_OIDC_AUDIENCE || workerUrl || '').trim() || workerUrl;

  if (!projectId || !workerUrl || !oidcServiceAccountEmail) {
    return null;
  }

  return {
    projectId,
    location,
    videoQueue,
    imageQueue,
    workerUrl,
    oidcServiceAccountEmail,
    oidcAudience
  };
};

export const isMediaCloudTasksConfigured = (env: NodeJS.ProcessEnv = process.env): boolean =>
  resolveMediaCloudTasksConfig(env) != null;

const queueForKind = (config: MediaCloudTasksConfig, kind: MediaJobKind): string =>
  kind === 'video_metadata' ? config.videoQueue : config.imageQueue;

const defaultTokenProvider = (): AccessTokenProvider => {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-tasks']
  });
  return async () => {
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token =
      typeof tokenResponse === 'string'
        ? tokenResponse
        : tokenResponse?.token || '';
    if (!token) {
      throw new Error('CLOUD_TASKS_TOKEN_UNAVAILABLE');
    }
    return token;
  };
};

const defaultFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, init);
  return {
    status: res.status,
    ok: res.ok,
    text: () => res.text()
  };
};

export type CreateMediaCloudTasksClientOptions = {
  config?: MediaCloudTasksConfig | null;
  getAccessToken?: AccessTokenProvider;
  fetchImpl?: FetchLike;
  /** When true, skip real config requirement (tests inject config). */
  allowMissingConfig?: boolean;
};

/**
 * Build a Cloud Tasks client. Returns null when required env is incomplete
 * (unless config is injected).
 */
export const createMediaCloudTasksClient = (
  options: CreateMediaCloudTasksClientOptions = {}
): MediaCloudTasksClient | null => {
  const config = options.config === undefined ? resolveMediaCloudTasksConfig() : options.config;
  if (!config) {
    return null;
  }

  const getAccessToken = options.getAccessToken || defaultTokenProvider();
  const fetchImpl = options.fetchImpl || defaultFetch;
  const apiBase = (config.apiBaseUrl || 'https://cloudtasks.googleapis.com/v2').replace(/\/+$/, '');

  const createMediaTask = async (payload: MediaCloudTaskPayload): Promise<CreateTaskResult> => {
    const fileId = String(payload.fileId || '').trim();
    const kind: MediaJobKind =
      payload.kind === 'video_metadata' ? 'video_metadata' : 'image_variants';
    if (!fileId) {
      return { ok: false, errorCode: 'MISSING_FILE_ID', message: 'fileId required' };
    }

    const queueId = queueForKind(config, kind);
    const parent = `projects/${config.projectId}/locations/${config.location}/queues/${queueId}`;
    const taskId = buildMediaTaskId(kind, fileId, payload.processingVersion);
    const taskName = `${parent}/tasks/${taskId}`;
    const url = `${apiBase}/${parent}/tasks`;

    const bodyPayload: MediaCloudTaskPayload = {
      fileId,
      kind,
      processingVersion: Math.max(0, Number(payload.processingVersion) || 0),
      enqueuedAt: payload.enqueuedAt || new Date().toISOString()
    };

    const httpBody = {
      task: {
        name: taskName,
        httpRequest: {
          httpMethod: 'POST',
          url: `${config.workerUrl}/internal/media/jobs`,
          headers: {
            'Content-Type': 'application/json'
          },
          body: Buffer.from(JSON.stringify(bodyPayload), 'utf8').toString('base64'),
          oidcToken: {
            serviceAccountEmail: config.oidcServiceAccountEmail,
            audience: config.oidcAudience
          }
        }
      }
    };

    try {
      const token = await getAccessToken();
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(httpBody)
      });

      if (res.status === 200 || res.status === 201) {
        return { ok: true, taskName };
      }

      const text = await res.text().catch(() => '');
      // ALREADY_EXISTS → treat as successful dedupe (idempotent enqueue).
      if (
        res.status === 409 ||
        /ALREADY_EXISTS/i.test(text) ||
        /already exists/i.test(text)
      ) {
        return { ok: true, taskName, alreadyExists: true };
      }

      return {
        ok: false,
        errorCode: `HTTP_${res.status}`,
        message: text.slice(0, 300) || `Cloud Tasks create failed (${res.status})`
      };
    } catch (error: any) {
      return {
        ok: false,
        errorCode: 'CLOUD_TASKS_REQUEST_FAILED',
        message: String(error?.message || error).slice(0, 300)
      };
    }
  };

  return { createMediaTask };
};

/** Test-only: force missing config checks without reading process.env */
export const __isTruthyEnv = truthy;
