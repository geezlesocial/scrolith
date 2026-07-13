/**
 * Upload-path enqueue facade.
 *
 * Depends only on MediaProcessingQueue (+ pure policy helpers).
 * Does NOT import Sharp or the heavy processor — safe when processing is disabled.
 *
 * Cloud Tasks can replace the queue implementation inside getMediaProcessingQueue()
 * without changing filesController or this call site.
 */
import prisma from '../../utils/prismaClient';
import { isEligibleImageMime } from './mediaImagePolicy';
import {
  getMediaProcessingMode,
  getMediaProcessingQueue,
  registerImageProcessingHandler
} from './mediaProcessingQueue';

let inlineHandlerReady = false;

/**
 * Lazily wire inline_async handler only when that mode is active.
 * Avoids loading Sharp in production when MEDIA_IMAGE_PROCESSING_ENABLED=false.
 */
const ensureInlineHandlerIfNeeded = () => {
  if (inlineHandlerReady) return;
  if (getMediaProcessingMode() !== 'inline_async') return;
  // Dynamic require keeps Sharp off the default upload path.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { processImageFile } = require('./mediaProcessing.service') as typeof import('./mediaProcessing.service');
  registerImageProcessingHandler(async (fileId: string) => {
    await processImageFile(fileId);
  });
  inlineHandlerReady = true;
};

/**
 * Enqueue image processing after File row creation.
 * Never throws to the upload path.
 */
export const enqueueImageProcessingSafe = async (
  fileId: string,
  opts?: { category?: string | null; mimeType?: string | null }
) => {
  try {
    const id = String(fileId || '').trim();
    if (!id) return;

    if (!isEligibleImageMime(opts?.mimeType)) {
      await prisma.file
        .update({
          where: { id },
          data: {
            processingStatus: 'SKIPPED',
            processingErrorCode: 'NOT_IMAGE',
            processingCompletedAt: new Date()
          }
        })
        .catch(() => undefined);
      return;
    }

    ensureInlineHandlerIfNeeded();

    const row = await prisma.file
      .findUnique({
        where: { id },
        select: { processingVersion: true }
      })
      .catch(() => null);

    const queue = getMediaProcessingQueue();
    await queue.enqueueImageProcessing(id, row?.processingVersion || 0);
    console.info('[media-processing] queued', {
      fileIdPrefix: id.slice(0, 8),
      mode: getMediaProcessingMode()
    });
  } catch (error: any) {
    console.error('[media-processing] enqueue failed (upload unaffected)', {
      fileIdPrefix: String(fileId || '').slice(0, 8),
      error: String(error?.message || error)
    });
  }
};
