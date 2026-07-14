/**
 * Upload-path enqueue facade.
 *
 * Depends only on MediaProcessingQueue (+ pure policy helpers).
 * Does NOT import Sharp or the heavy processors — safe when processing is disabled.
 *
 * Cloud Tasks can replace the queue implementation inside getMediaProcessingQueue()
 * without changing filesController or this call site.
 */
import prisma from '../../utils/prismaClient';
import { isEligibleImageMime } from './mediaImagePolicy';
import { isEligibleVideoMime } from './mediaVideoProbe.service';
import {
  getMediaProcessingMode,
  getMediaProcessingQueue,
  isMediaImageProcessingEnabled,
  isMediaVideoProcessingEnabled,
  registerImageProcessingHandler,
  registerVideoProcessingHandler
} from './mediaProcessingQueue';

let imageHandlerReady = false;
let videoHandlerReady = false;

/**
 * Lazily wire inline_async image handler only when that mode is active.
 * Avoids loading Sharp in production when MEDIA_IMAGE_PROCESSING_ENABLED=false.
 */
const ensureImageHandlerIfNeeded = () => {
  if (imageHandlerReady) return;
  if (!isMediaImageProcessingEnabled()) return;
  // Dynamic require keeps Sharp off the default upload path.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { processImageFile } = require('./mediaProcessing.service') as typeof import('./mediaProcessing.service');
  registerImageProcessingHandler(async (fileId: string) => {
    await processImageFile(fileId);
  });
  imageHandlerReady = true;
};

const ensureVideoHandlerIfNeeded = () => {
  if (videoHandlerReady) return;
  if (!isMediaVideoProcessingEnabled()) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { processVideoMetadata } =
    require('./mediaVideoProcessing.service') as typeof import('./mediaVideoProcessing.service');
  registerVideoProcessingHandler(async (fileId: string) => {
    await processVideoMetadata(fileId);
  });
  videoHandlerReady = true;
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
      // Only mark SKIPPED for clear non-images when image path is invoked with image intent;
      // videos are handled by the video enqueue path.
      if (isEligibleVideoMime(opts?.mimeType)) {
        return;
      }
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

    ensureImageHandlerIfNeeded();

    const row = await prisma.file
      .findUnique({
        where: { id },
        select: { processingVersion: true }
      })
      .catch(() => null);

    const queue = getMediaProcessingQueue();
    await queue.enqueueImageProcessing(id, row?.processingVersion || 0);
    console.info('[media-processing] queued', {
      kind: 'image_variants',
      fileIdPrefix: id.slice(0, 8),
      mode: getMediaProcessingMode()
    });
  } catch (error: any) {
    console.error('[media-processing] enqueue failed (upload unaffected)', {
      kind: 'image_variants',
      fileIdPrefix: String(fileId || '').slice(0, 8),
      error: String(error?.message || error)
    });
  }
};

/**
 * Enqueue video metadata extraction after File row creation.
 * Never throws to the upload path. Disabled by default.
 */
export const enqueueVideoProcessingSafe = async (
  fileId: string,
  opts?: { mimeType?: string | null }
) => {
  try {
    const id = String(fileId || '').trim();
    if (!id) return;

    if (!isEligibleVideoMime(opts?.mimeType)) {
      return;
    }

    // When video processing is disabled, leave status PENDING so a future worker can pick up.
    if (!isMediaVideoProcessingEnabled()) {
      console.info('[media-video] skipped_enqueue_disabled', {
        fileIdPrefix: id.slice(0, 8),
        mode: getMediaProcessingMode()
      });
      return;
    }

    ensureVideoHandlerIfNeeded();

    const row = await prisma.file
      .findUnique({
        where: { id },
        select: { processingVersion: true }
      })
      .catch(() => null);

    const queue = getMediaProcessingQueue();
    await queue.enqueue({
      fileId: id,
      kind: 'video_metadata',
      processingVersion: row?.processingVersion || 0
    });
    console.info('[media-video] queued', {
      kind: 'video_metadata',
      fileIdPrefix: id.slice(0, 8),
      mode: getMediaProcessingMode()
    });
  } catch (error: any) {
    console.error('[media-video] enqueue failed (upload unaffected)', {
      kind: 'video_metadata',
      fileIdPrefix: String(fileId || '').slice(0, 8),
      error: String(error?.message || error)
    });
  }
};

/**
 * Convenience: enqueue the appropriate processors for an uploaded file.
 * Safe for both images and videos; never fails the upload.
 */
export const enqueueMediaProcessingSafe = async (
  fileId: string,
  opts?: { category?: string | null; mimeType?: string | null }
) => {
  await enqueueImageProcessingSafe(fileId, opts);
  await enqueueVideoProcessingSafe(fileId, opts);
};
