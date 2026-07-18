/**
 * Phase 20.2.6R — intelligent download manager for messaging media.
 */

import api from '../api';
import {
  getAttachmentCacheKey,
  getAttachmentContentId,
  type NormalizedMessageAttachment
} from '../messagingMedia';
import {
  checksumBlob,
  getDiskCacheBlob,
  putDiskCacheBlob
} from './mediaDiskCache';
import {
  incrementMessagingCounter,
  recordMessagingMetric,
  startMessagingTimer
} from './messagingTelemetry';
import { getDeviceMediaConditions } from './deviceMediaConditions';

export type DownloadPriority = 'critical' | 'high' | 'normal' | 'low';

export type DownloadJob = {
  id: string;
  cacheKey: string;
  contentId?: string;
  url?: string;
  priority: DownloadPriority;
  conversationId?: string;
  kind?: string;
  attempts: number;
  state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  errorMessage?: string;
  resolve?: (blob: Blob) => void;
  reject?: (error: Error) => void;
};

const PRIORITY_ORDER: Record<DownloadPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3
};

const queue: DownloadJob[] = [];
const active = new Map<string, AbortController>();
let pumping = false;

const adaptiveParallelism = () => {
  const c = getDeviceMediaConditions();
  if (!c.online) return 0;
  if (c.saveData || c.metered) return 1;
  if (c.effectiveType === '2g' || c.effectiveType === 'slow-2g') return 1;
  if (c.lowMemory || c.lowBattery) return 2;
  return 3;
};

const sortQueue = () => {
  queue.sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return a.attempts - b.attempts;
  });
};

export const enqueueMediaDownload = (params: {
  attachment: NormalizedMessageAttachment;
  priority?: DownloadPriority;
  conversationId?: string;
}): Promise<Blob> => {
  const cacheKey = getAttachmentCacheKey(params.attachment);
  if (!cacheKey) {
    return Promise.reject(new Error('No cache key for download'));
  }

  // Coalesce identical downloads.
  const existing = queue.find((job) => job.cacheKey === cacheKey && job.state !== 'failed' && job.state !== 'cancelled');
  if (existing && existing.resolve) {
    return new Promise((resolve, reject) => {
      const prevResolve = existing.resolve!;
      const prevReject = existing.reject!;
      existing.resolve = (blob) => {
        prevResolve(blob);
        resolve(blob);
      };
      existing.reject = (error) => {
        prevReject(error);
        reject(error);
      };
      if (PRIORITY_ORDER[params.priority || 'normal'] < PRIORITY_ORDER[existing.priority]) {
        existing.priority = params.priority || 'normal';
        sortQueue();
      }
    });
  }

  return new Promise(async (resolve, reject) => {
    // Disk cache first.
    const cached = await getDiskCacheBlob(cacheKey);
    if (cached?.blob) {
      resolve(cached.blob);
      return;
    }

    const job: DownloadJob = {
      id: `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      cacheKey,
      contentId: getAttachmentContentId(params.attachment) || undefined,
      url: params.attachment.url || undefined,
      priority: params.priority || 'normal',
      conversationId: params.conversationId,
      kind: params.attachment.type,
      attempts: 0,
      state: 'queued',
      progress: 0,
      resolve,
      reject
    };
    queue.push(job);
    sortQueue();
    void pumpDownloads();
  });
};

export const cancelMediaDownload = (cacheKey: string) => {
  const key = String(cacheKey || '');
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (queue[i].cacheKey === key && queue[i].state === 'queued') {
      queue[i].state = 'cancelled';
      queue[i].reject?.(new Error('cancelled'));
      queue.splice(i, 1);
    }
  }
  const controller = active.get(key);
  if (controller) controller.abort();
};

const fetchBlob = async (job: DownloadJob, signal: AbortSignal): Promise<Blob> => {
  if (job.contentId) {
    // Prefer Range when resuming partial — first version does full GET with timeout.
    const response = await api.get(`/files/content/${encodeURIComponent(job.contentId)}`, {
      responseType: 'blob',
      signal,
      timeout: 120_000,
      // Axios allows onDownloadProgress
      onDownloadProgress: (event: any) => {
        const total = Number(event?.total || 0);
        if (total > 0) {
          job.progress = Math.round((Number(event.loaded || 0) / total) * 100);
        }
      }
    } as any);
    const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
    return blob;
  }
  if (job.url) {
    const response = await fetch(job.url, { credentials: 'include', signal });
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    // Streaming: if body supports getReader, we still resolve full blob for cache compatibility.
    return response.blob();
  }
  throw new Error('No download source');
};

const runJob = async (job: DownloadJob) => {
  const controller = new AbortController();
  active.set(job.cacheKey, controller);
  job.state = 'running';
  job.attempts += 1;
  const stop = startMessagingTimer('media_download_ms');

  try {
    const blob = await fetchBlob(job, controller.signal);
    if (blob.size === 0) throw new Error('Empty download');
    const checksum = await checksumBlob(blob);
    await putDiskCacheBlob(job.cacheKey, blob, {
      conversationId: job.conversationId,
      kind: (job.kind as any) || 'generic',
      mimeType: blob.type,
      checksum
    });
    stop({ export: true });
    job.state = 'completed';
    job.progress = 100;
    job.resolve?.(blob);
  } catch (error: any) {
    if (String(error?.name || '') === 'AbortError' || String(error?.message || '').includes('abort')) {
      job.state = 'cancelled';
      job.reject?.(new Error('cancelled'));
      return;
    }
    incrementMessagingCounter('download_retry');
    recordMessagingMetric('download_retry', 1);
    if (job.attempts < 4 && getDeviceMediaConditions().online) {
      job.state = 'queued';
      job.errorMessage = String(error?.message || 'download failed');
      sortQueue();
      await new Promise((r) => setTimeout(r, 400 * job.attempts));
    } else {
      job.state = 'failed';
      job.errorMessage = String(error?.message || 'download failed');
      job.reject?.(error instanceof Error ? error : new Error(String(error)));
    }
  } finally {
    active.delete(job.cacheKey);
  }
};

export const pumpDownloads = async () => {
  if (pumping) return;
  pumping = true;
  try {
    while (true) {
      const limit = adaptiveParallelism();
      if (limit <= 0) break;
      while (active.size < limit) {
        const next = queue.find((job) => job.state === 'queued');
        if (!next) break;
        // Remove from queue head conceptually
        next.state = 'running';
        void runJob(next).finally(() => {
          const idx = queue.indexOf(next);
          if (idx >= 0 && (next.state === 'completed' || next.state === 'failed' || next.state === 'cancelled')) {
            queue.splice(idx, 1);
          }
          void pumpDownloads();
        });
      }
      break;
    }
  } finally {
    pumping = false;
  }
};

export const getDownloadQueueSnapshot = () =>
  queue.map((job) => ({
    id: job.id,
    cacheKey: job.cacheKey,
    priority: job.priority,
    state: job.state,
    progress: job.progress,
    attempts: job.attempts
  }));
