/**
 * Phase 3B.4.1 — Cloud Tasks client + queue adapter unit tests.
 */

jest.mock('../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    file: {
      findUnique: jest.fn(),
      update: jest.fn()
    }
  }
}));

import prisma from '../utils/prismaClient';
import {
  buildMediaTaskId,
  createMediaCloudTasksClient,
  resolveMediaCloudTasksConfig,
  sanitizeTaskIdSegment,
  type MediaCloudTaskPayload
} from '../services/media/mediaCloudTasks.client';
import {
  __resetMediaProcessingQueueForTests,
  getMediaProcessingMode,
  getMediaProcessingQueue,
  getRawMediaProcessingMode,
  isInlineAsyncExecutionMode,
  isMediaImageProcessingEnabled,
  isMediaVideoExecutionAllowed,
  isMediaVideoProcessingEnabled,
  isMediaWorkerService,
  setMediaCloudTasksClientForTests
} from '../services/media/mediaProcessingQueue';
import {
  enqueueMediaProcessingSafe,
  enqueueVideoProcessingSafe
} from '../services/media/mediaProcessing.enqueue';

const mockPrisma = prisma as unknown as {
  file: { findUnique: jest.Mock; update: jest.Mock };
};

describe('mediaCloudTasks.client', () => {
  const baseConfig = {
    projectId: 'proj-1',
    location: 'asia-southeast1',
    videoQueue: 'media-video',
    imageQueue: 'media-image',
    workerUrl: 'https://worker.example.run.app',
    oidcServiceAccountEmail: 'tasks-sa@proj-1.iam.gserviceaccount.com',
    oidcAudience: 'https://worker.example.run.app',
    apiBaseUrl: 'https://tasks.test.local/v2'
  };

  test('sanitizeTaskIdSegment strips invalid characters', () => {
    expect(sanitizeTaskIdSegment('abc/def.ghi')).toBe('abc_def_ghi');
  });

  test('buildMediaTaskId is deterministic', () => {
    expect(buildMediaTaskId('video_metadata', 'file123', 2)).toBe(
      'media-video-file123-v2'
    );
    expect(buildMediaTaskId('image_variants', 'file123', 0)).toBe(
      'media-image-file123-v0'
    );
  });

  test('resolveMediaCloudTasksConfig returns null when incomplete', () => {
    expect(
      resolveMediaCloudTasksConfig({
        MEDIA_TASKS_PROJECT: 'p'
        // missing worker + SA
      } as any)
    ).toBeNull();
  });

  test('resolveMediaCloudTasksConfig maps env', () => {
    const cfg = resolveMediaCloudTasksConfig({
      MEDIA_TASKS_PROJECT: 'scrolith-500821',
      MEDIA_TASKS_LOCATION: 'asia-southeast1',
      MEDIA_WORKER_URL: 'https://worker.example.run.app/',
      MEDIA_TASKS_SERVICE_ACCOUNT: 'sa@x.iam.gserviceaccount.com'
    } as any);
    expect(cfg).toMatchObject({
      projectId: 'scrolith-500821',
      workerUrl: 'https://worker.example.run.app',
      oidcServiceAccountEmail: 'sa@x.iam.gserviceaccount.com',
      oidcAudience: 'https://worker.example.run.app'
    });
  });

  test('createMediaTask posts OIDC HTTP task and base64 body', async () => {
    const fetchImpl = jest.fn(async () => ({
      status: 200,
      ok: true,
      text: async () => '{}'
    }));
    const client = createMediaCloudTasksClient({
      config: baseConfig,
      getAccessToken: async () => 'tok-abc',
      fetchImpl
    });
    expect(client).not.toBeNull();

    const payload: MediaCloudTaskPayload = {
      fileId: 'cuidfile1',
      kind: 'video_metadata',
      processingVersion: 3,
      enqueuedAt: '2026-01-01T00:00:00.000Z'
    };
    const result = await client!.createMediaTask(payload);
    expect(result.ok).toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0] as unknown as [
      string,
      { method: string; headers: Record<string, string>; body: string }
    ];
    const url = call[0];
    const init = call[1];
    expect(url).toContain(
      '/projects/proj-1/locations/asia-southeast1/queues/media-video/tasks'
    );
    expect(init.headers.Authorization).toBe('Bearer tok-abc');
    const body = JSON.parse(init.body);
    expect(body.task.name).toContain('media-video-cuidfile1-v3');
    expect(body.task.httpRequest.url).toBe(
      'https://worker.example.run.app/internal/media/jobs'
    );
    expect(body.task.httpRequest.oidcToken).toEqual({
      serviceAccountEmail: 'tasks-sa@proj-1.iam.gserviceaccount.com',
      audience: 'https://worker.example.run.app'
    });
    const decoded = JSON.parse(
      Buffer.from(body.task.httpRequest.body, 'base64').toString('utf8')
    );
    expect(decoded).toMatchObject({
      fileId: 'cuidfile1',
      kind: 'video_metadata',
      processingVersion: 3
    });
  });

  test('ALREADY_EXISTS is treated as success', async () => {
    const client = createMediaCloudTasksClient({
      config: baseConfig,
      getAccessToken: async () => 'tok',
      fetchImpl: async () => ({
        status: 409,
        ok: false,
        text: async () => JSON.stringify({ error: { status: 'ALREADY_EXISTS' } })
      })
    });
    const result = await client!.createMediaTask({
      fileId: 'f1',
      kind: 'video_metadata',
      processingVersion: 0,
      enqueuedAt: new Date().toISOString()
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.alreadyExists).toBe(true);
    }
  });

  test('HTTP error returns ok:false', async () => {
    const client = createMediaCloudTasksClient({
      config: baseConfig,
      getAccessToken: async () => 'tok',
      fetchImpl: async () => ({
        status: 403,
        ok: false,
        text: async () => 'permission denied'
      })
    });
    const result = await client!.createMediaTask({
      fileId: 'f1',
      kind: 'video_metadata',
      processingVersion: 0,
      enqueuedAt: new Date().toISOString()
    });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errorCode).toBe('HTTP_403');
    }
  });

  test('createMediaCloudTasksClient returns null without config', () => {
    const client = createMediaCloudTasksClient({ config: null });
    expect(client).toBeNull();
  });
});

describe('mediaProcessingQueue cloud_tasks mode', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    __resetMediaProcessingQueueForTests();
    process.env.MEDIA_PROCESSING_MODE = 'disabled';
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'false';
    process.env.MEDIA_IMAGE_PROCESSING_ENABLED = 'false';
    delete process.env.MEDIA_WORKER_SERVICE;
  });

  afterEach(() => {
    __resetMediaProcessingQueueForTests();
    process.env.MEDIA_PROCESSING_MODE = prev.MEDIA_PROCESSING_MODE;
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = prev.MEDIA_VIDEO_PROCESSING_ENABLED;
    process.env.MEDIA_IMAGE_PROCESSING_ENABLED = prev.MEDIA_IMAGE_PROCESSING_ENABLED;
    if (prev.MEDIA_WORKER_SERVICE === undefined) {
      delete process.env.MEDIA_WORKER_SERVICE;
    } else {
      process.env.MEDIA_WORKER_SERVICE = prev.MEDIA_WORKER_SERVICE;
    }
  });

  test('default mode remains disabled', () => {
    delete process.env.MEDIA_PROCESSING_MODE;
    expect(getRawMediaProcessingMode()).toBe('disabled');
    expect(getMediaProcessingMode()).toBe('disabled');
    expect(isMediaVideoProcessingEnabled()).toBe(false);
    expect(isMediaImageProcessingEnabled()).toBe(false);
    expect(isMediaVideoExecutionAllowed()).toBe(false);
  });

  test('cloud_tasks + video flag enables enqueue but not API execution', () => {
    process.env.MEDIA_PROCESSING_MODE = 'cloud_tasks';
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    expect(getMediaProcessingMode()).toBe('cloud_tasks');
    expect(isMediaVideoProcessingEnabled()).toBe(true);
    expect(isMediaVideoExecutionAllowed()).toBe(false);
    expect(isInlineAsyncExecutionMode()).toBe(false);
  });

  test('worker service allows video execution when flag on', () => {
    process.env.MEDIA_PROCESSING_MODE = 'disabled';
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_WORKER_SERVICE = 'true';
    expect(isMediaWorkerService()).toBe(true);
    expect(isMediaVideoExecutionAllowed()).toBe(true);
    // Enqueue still off when mode disabled
    expect(isMediaVideoProcessingEnabled()).toBe(false);
  });

  test('cloud_tasks queue creates task via injected client', async () => {
    process.env.MEDIA_PROCESSING_MODE = 'cloud_tasks';
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    const createMediaTask = jest.fn(async () => ({ ok: true as const, taskName: 't1' }));
    setMediaCloudTasksClientForTests({ createMediaTask });

    const queue = getMediaProcessingQueue();
    await queue.enqueueVideoProcessing('file-abc', 1);

    expect(createMediaTask).toHaveBeenCalledTimes(1);
    expect(createMediaTask).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'file-abc',
        kind: 'video_metadata',
        processingVersion: 1
      })
    );
  });

  test('cloud_tasks queue no-ops when video flag off', async () => {
    process.env.MEDIA_PROCESSING_MODE = 'cloud_tasks';
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'false';
    const createMediaTask = jest.fn(async () => ({ ok: true as const }));
    setMediaCloudTasksClientForTests({ createMediaTask });

    await getMediaProcessingQueue().enqueueVideoProcessing('file-abc', 0);
    expect(createMediaTask).not.toHaveBeenCalled();
  });

  test('cloud_tasks missing client logs and does not throw', async () => {
    process.env.MEDIA_PROCESSING_MODE = 'cloud_tasks';
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    setMediaCloudTasksClientForTests(null);

    await expect(
      getMediaProcessingQueue().enqueue({
        fileId: 'x',
        kind: 'video_metadata',
        processingVersion: 0
      })
    ).resolves.toBeUndefined();
  });

  test('enqueueVideoProcessingSafe uses cloud_tasks without loading inline handlers', async () => {
    process.env.MEDIA_PROCESSING_MODE = 'cloud_tasks';
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    mockPrisma.file.findUnique.mockResolvedValue({ processingVersion: 4 });
    const createMediaTask = jest.fn(async () => ({ ok: true as const, alreadyExists: false }));
    setMediaCloudTasksClientForTests({ createMediaTask });

    await enqueueVideoProcessingSafe('vid-1', { mimeType: 'video/mp4' });
    expect(createMediaTask).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'vid-1',
        kind: 'video_metadata',
        processingVersion: 4
      })
    );
  });

  test('enqueueMediaProcessingSafe remains safe when disabled', async () => {
    process.env.MEDIA_PROCESSING_MODE = 'disabled';
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'false';
    const createMediaTask = jest.fn();
    setMediaCloudTasksClientForTests({ createMediaTask });

    await expect(
      enqueueMediaProcessingSafe('f', { mimeType: 'video/mp4' })
    ).resolves.toBeUndefined();
    expect(createMediaTask).not.toHaveBeenCalled();
  });

  test('inline_async still selected when mode raw is inline_async', () => {
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    expect(getMediaProcessingMode()).toBe('inline_async');
    expect(isMediaVideoExecutionAllowed()).toBe(true);
    expect(isMediaVideoProcessingEnabled()).toBe(true);
  });
});
