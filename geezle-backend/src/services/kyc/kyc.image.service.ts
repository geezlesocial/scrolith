/**
 * Safe image normalization for KYC: strip EXIF/GPS, re-encode, bound pixels.
 * No biometric analysis.
 */
import sharp from 'sharp';
import { assertImagePixelBounds, KycValidationError } from './kyc.validation.service';

export type NormalizedKycImage = {
  buffer: Buffer;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
  metadataStripped: true;
};

const TARGET_MIME: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp'
};

/**
 * Decode with sharp limits, strip metadata, normalize orientation, re-encode.
 * Discards unsafe original by returning only the clean buffer.
 */
export const normalizeKycImage = async (
  input: Buffer,
  sourceMime: string
): Promise<NormalizedKycImage> => {
  const target = TARGET_MIME[sourceMime];
  if (!target) {
    throw new KycValidationError('Image format cannot be normalized', 'UNSUPPORTED_IMAGE');
  }

  try {
    let pipeline = sharp(input, {
      failOn: 'error',
      limitInputPixels: 40_000_000,
      sequentialRead: true
    }).rotate(); // apply orientation then drop EXIF

    const meta = await pipeline.metadata();
    assertImagePixelBounds(meta.width, meta.height);

    // Re-create pipeline after metadata read
    pipeline = sharp(input, {
      failOn: 'error',
      limitInputPixels: 40_000_000,
      sequentialRead: true
    })
      .rotate()
      .withMetadata({ orientation: undefined }); // strip profiles/EXIF

    let output: Buffer;
    let contentType: NormalizedKycImage['contentType'] = target;

    if (target === 'image/png') {
      output = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      contentType = 'image/png';
    } else if (target === 'image/webp') {
      output = await pipeline.webp({ quality: 88 }).toBuffer();
      contentType = 'image/webp';
    } else {
      output = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      contentType = 'image/jpeg';
    }

    const outMeta = await sharp(output).metadata();
    assertImagePixelBounds(outMeta.width, outMeta.height);

    return {
      buffer: output,
      contentType,
      width: Number(outMeta.width || 0),
      height: Number(outMeta.height || 0),
      metadataStripped: true
    };
  } catch (error: any) {
    if (error instanceof KycValidationError) throw error;
    // Client-corrupt content — controlled 400, never raw sharp stack to client
    throw new KycValidationError(
      'File content is invalid or corrupted',
      'INVALID_FILE_CONTENT',
      400
    );
  }
};
