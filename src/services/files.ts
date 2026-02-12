import api from './api';
import { UploadedFile } from '../types';

type VisibilityOption = 'public' | 'private';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

interface ApiError {
  success: false;
  error: string;
  code?: string;
}

const FILE_LIST_TIMEOUT_MS = Number(import.meta.env.VITE_FILES_LIST_TIMEOUT_MS ?? 30000);
const FILE_UPLOAD_TIMEOUT_BASE_MS = Number(import.meta.env.VITE_FILE_UPLOAD_TIMEOUT_BASE_MS ?? 45000);
const FILE_UPLOAD_TIMEOUT_PER_MB_MS = Number(import.meta.env.VITE_FILE_UPLOAD_TIMEOUT_PER_MB_MS ?? 12000);
const FILE_UPLOAD_TIMEOUT_MAX_MS = Number(import.meta.env.VITE_FILE_UPLOAD_TIMEOUT_MAX_MS ?? 300000);
const FILE_LIST_RETRY_ATTEMPTS = Number(import.meta.env.VITE_FILES_LIST_RETRY_ATTEMPTS ?? 2);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTimeoutError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === 'ECONNABORTED' || message.includes('timeout');
};

const handleApiResponse = <T>(response: any): T => {
  if (response?.data?.success === false) {
    throw new Error(response.data.error || 'API request failed');
  }
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined && response.data.success !== false) return response.data as T;
  return response as T;
};

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const determineMediaType = (rawType?: string, mimeType?: string): UploadedFile['type'] => {
  const normalized = (rawType || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  if (normalized === 'image' || mime.startsWith('image/')) return 'image';
  if (normalized === 'video' || mime.startsWith('video/')) return 'video';
  return 'document';
};

const normalizeVisibility = (value?: string): VisibilityOption | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return normalized === 'private' ? 'private' : 'public';
};

const normalizeUploadedFile = (payload: any): UploadedFile => {
  if (!payload) {
    throw new Error('File payload is empty');
  }

  const mime = payload.mime_type || payload.mimeType || '';
  const mediaType = determineMediaType(payload.type, mime);
  const ownerId = payload.user_id || payload.owner_id || payload.ownerId || '';
  const ownerRole = payload.owner_role || payload.ownerRole || undefined;
  const visibility = normalizeVisibility(payload.visibility);
  const createdAt = payload.uploadedAt || payload.created_at || payload.createdAt || new Date().toISOString();
  const fileSize = payload.size ?? 0;
  const thumbnailUrl = payload.thumbnail_url || payload.thumbnailUrl || null;
  const storageProvider = payload.storage_provider || payload.storageProvider || 'local';
  const width = payload.width !== undefined && payload.width !== null ? Number(payload.width) : null;
  const height = payload.height !== undefined && payload.height !== null ? Number(payload.height) : null;
  const duration = payload.duration !== undefined && payload.duration !== null ? Number(payload.duration) : null;

  return {
    id: payload.id,
    fileId: payload.id,
    user_id: ownerId,
    owner_id: ownerId,
    ownerId,
    owner_role: ownerRole,
    ownerRole,
    name: payload.name || payload.original_name || payload.filename || 'file',
    type: mediaType,
    size: typeof fileSize === 'bigint' ? Number(fileSize) : Number(fileSize ?? 0),
    url: payload.url || '',
    category: payload.category || (mediaType === 'document' ? 'document' : 'portfolio'),
    created_at: createdAt,
    storage_key: payload.storage_key || payload.storageKey,
    storageKey: payload.storage_key || payload.storageKey,
    storage_provider: storageProvider,
    storageProvider,
    visibility,
    mime_type: mime || undefined,
    mimeType: mime || undefined,
    thumbnail_url: thumbnailUrl,
    thumbnailUrl,
    width,
    height,
    duration,
    usedIn: payload.usedIn || []
  };
};

const normalizeCollection = (files: any[]): UploadedFile[] => {
  if (!Array.isArray(files)) return [];
  return files.map((file) => {
    try {
      return normalizeUploadedFile(file);
    } catch (error) {
      console.warn('Failed to normalize uploaded file:', error);
      return null;
    }
  }).filter((item): item is UploadedFile => Boolean(item));
};

type GetFilesOptions =
  | string
  | {
      role?: string;
      visibility?: VisibilityOption;
      type?: 'image' | 'video' | 'document' | 'pdf' | 'other';
      search?: string;
      page?: number;
      limit?: number;
      includeUsage?: boolean;
      includeDisk?: boolean;
    };

type UploadFileOptions =
  | string
  | {
      role?: string;
      visibility?: VisibilityOption;
      userId?: string;
      user_id?: string;
      onProgress?: (percent: number, event: ProgressEvent) => void;
    };

export const FileService = {
  // Supports legacy call signatures:
  // - getFiles(options?: GetFilesOptions)
  // - getFiles(ownerId: string, options?: GetFilesOptions)
  getFiles: async (
    ownerOrOptions?: string | GetFilesOptions,
    maybeOptions?: GetFilesOptions
  ): Promise<{ files: UploadedFile[]; pagination?: any }> => {
    const params: Record<string, string | number> = {};
    const options = maybeOptions ?? (typeof ownerOrOptions === 'object' ? ownerOrOptions : undefined);
    const ownerId = typeof ownerOrOptions === 'string' && maybeOptions ? ownerOrOptions : undefined;

    // If ownerId is provided, include it as role (legacy callers passed user id as first arg)
    if (ownerId) params.role = ownerId;

    if (typeof options === 'string') {
      params.role = options;
    } else if (options) {
      if (options.role) params.role = options.role;
      if (options.visibility) params.visibility = options.visibility;
      if (options.type) params.type = options.type;
      if (options.search) params.search = options.search;
      if (options.page) params.page = options.page;
      if (options.limit) params.limit = options.limit;
      if (typeof options.includeUsage === 'boolean') params.includeUsage = options.includeUsage ? 'true' : 'false';
      if (typeof options.includeDisk === 'boolean') params.includeDisk = options.includeDisk ? 'true' : 'false';
    }
    let response: any = null;
    let lastError: any = null;
    const attempts = Math.max(1, FILE_LIST_RETRY_ATTEMPTS);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        response = await api.get<ApiResponse<UploadedFile[] | { files: UploadedFile[]; pagination: any }>>('/files', {
          params,
          timeout: FILE_LIST_TIMEOUT_MS
        });
        lastError = null;
        break;
      } catch (error: any) {
        lastError = error;
        if (!isTimeoutError(error) || attempt === attempts - 1) break;
        await wait(300 * (attempt + 1));
      }
    }

    if (lastError) throw lastError;

    const data = handleApiResponse<UploadedFile[] | { files: UploadedFile[]; pagination: any }>(response);
    
    // Handle both array and paginated response formats
    if (Array.isArray(data)) {
      return { files: normalizeCollection(data) };
    }
    
    if (data && typeof data === 'object' && 'files' in data) {
      return {
        files: normalizeCollection(data.files || []),
        pagination: data.pagination
      };
    }
    
    return { files: [] };
  },

  // Supports legacy signature: uploadFile(ownerId?, file, category, options?)
  uploadFile: async (...args: any[]): Promise<UploadedFile> => {
    // Normalize arguments
    let file: File;
    let category: UploadedFile['category'];
    let options: UploadFileOptions | undefined;

    if (args.length === 4) {
      // (ownerId, file, category, options)
      /* ownerId = args[0] */
      file = args[1];
      category = args[2];
      options = args[3];
    } else {
      // (file, category, options?)
      file = args[0];
      category = args[1];
      options = args[2];
    }

    const formData = new FormData();
    formData.append('file', file);
    if (file.name) formData.append('name', file.name);
    if (category) formData.append('category', category);

    if (typeof options === 'string') {
      formData.append('role', options);
    } else if (options) {
      if (options.role) formData.append('role', options.role);
      if (options.visibility) formData.append('visibility', options.visibility.toUpperCase());
      if (options.userId) formData.append('userId', options.userId);
      if (options.user_id) formData.append('user_id', options.user_id);
    }

    const onProgress =
      typeof options === 'object' && options
        ? options.onProgress
        : undefined;
    const sizeMb = Math.max(1, Math.ceil((Number(file?.size || 0) || 0) / (1024 * 1024)));
    const uploadTimeout = Math.min(
      FILE_UPLOAD_TIMEOUT_MAX_MS,
      Math.max(FILE_UPLOAD_TIMEOUT_BASE_MS, FILE_UPLOAD_TIMEOUT_BASE_MS + sizeMb * FILE_UPLOAD_TIMEOUT_PER_MB_MS)
    );

    const response = await api.post<ApiResponse<UploadedFile>>('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: uploadTimeout,
      onUploadProgress: onProgress
        ? (event) => {
            const total = event.total ?? 0;
            const percent = total ? Math.round((event.loaded / total) * 100) : 0;
            onProgress(percent, event);
          }
        : undefined
    });
    const data = handleApiResponse(response);
    return normalizeUploadedFile(data);
  },

  // deleteFile supports legacy (id, ownerId?) signature but ownerId is ignored server-side
  deleteFile: async (id: string, _ownerId?: string): Promise<void> => {
    const response = await api.delete<ApiResponse<void>>(`/files/${id}`);
    handleApiResponse(response);
  }
};
