import { Storage } from '@google-cloud/storage';

// Native Google Cloud Storage client using Application Default Credentials (ADC).
// This avoids the project_id requirement in Firebase Admin SDK when running on Cloud Run.
const storage = new Storage();
const bucketName = process.env.STORAGE_BUCKET || 'scrolith-prod-uploads';
const bucket = storage.bucket(bucketName);

export const ResumeGcsService = {
  /**
   * Upload a buffer to GCS.
   */
  async uploadBuffer(params: {
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }) {
    const file = bucket.file(params.fileName);
    await file.save(params.buffer, {
      resumable: false,
      validation: false,
      metadata: {
        contentType: params.contentType || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable'
      }
    });
    return {
      bucket: bucketName,
      fileName: params.fileName
    };
  },

  /**
   * Download a file from GCS as a Buffer.
   */
  async downloadBuffer(fileName: string): Promise<Buffer> {
    const [buffer] = await bucket.file(fileName).download();
    return buffer;
  },

  /**
   * Create a readable stream for a file in GCS.
   */
  createReadStream(fileName: string) {
    return bucket.file(fileName).createReadStream();
  },

  /**
   * Delete a file from GCS.
   */
  async delete(fileName: string) {
    await bucket.file(fileName).delete({ ignoreNotFound: true });
  },

  /**
   * Check if a file exists in GCS.
   */
  async exists(fileName: string): Promise<boolean> {
    const [exists] = await bucket.file(fileName).exists();
    return exists;
  },

  /**
   * Check if GCS storage is configured (STORAGE_DRIVER is set to gcs/google_cloud_storage).
   */
  isConfigured(): boolean {
    const driver = String(process.env.STORAGE_DRIVER || process.env.UPLOAD_DRIVER || '').toLowerCase();
    return ['gcs', 'google_cloud_storage', 'firebase_storage', 'firebase'].includes(driver) && Boolean(bucketName);
  }
};
