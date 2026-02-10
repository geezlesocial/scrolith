
import { UploadedFile } from '../types';

const FILES_KEY = 'scrolith_files';

export const FileService = {
    getFiles: async (userId: string): Promise<UploadedFile[]> => {
        try {
            const stored = localStorage.getItem(FILES_KEY);
            const allFiles: UploadedFile[] = stored ? JSON.parse(stored) : [];
            return allFiles.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } catch { return []; }
    },

    uploadFile: async (userId: string, file: File, category: UploadedFile['category'], role?: string): Promise<UploadedFile> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target?.result as string;
                
                img.onload = () => {
                    // Compress Image
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // Max dimension 800px to save space
                    const MAX_WIDTH = 800;
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx?.drawImage(img, 0, 0, width, height);
                    
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7); // 70% quality JPG

                    const newFile: UploadedFile = {
                        id: Math.random().toString(36).substr(2, 9),
                        userId,
                        ownerRole: role,
                        name: file.name,
                        type: 'image', // simplified for this compressor
                        size: Math.round((dataUrl.length * 3) / 4), // Approx size
                        url: dataUrl,
                        category,
                        createdAt: new Date().toISOString()
                    };

                    try {
                        const stored = localStorage.getItem(FILES_KEY);
                        const allFiles: UploadedFile[] = stored ? JSON.parse(stored) : [];
                        
                        // Storage Limit Guard: Keep only last 20 files to prevent quota exceed in demo
                        if (allFiles.length > 20) allFiles.pop();
                        
                        allFiles.unshift(newFile);
                        localStorage.setItem(FILES_KEY, JSON.stringify(allFiles));
                        resolve(newFile);
                    } catch (e) {
                        console.error("Storage failed", e);
                        reject(new Error("Storage limit reached. Please delete old files."));
                    }
                };

                img.onerror = () => {
                    // Fallback for non-images
                    const newFile: UploadedFile = {
                        id: Math.random().toString(36).substr(2, 9),
                        userId,
                        ownerRole: role,
                        name: file.name,
                        type: 'document',
                        size: file.size,
                        url: reader.result as string,
                        category,
                        createdAt: new Date().toISOString()
                    };
                    // Save logic duplicated for fallback (omitted for brevity in logic flow, but effectively same save block)
                    try {
                         const stored = localStorage.getItem(FILES_KEY);
                         const allFiles: UploadedFile[] = stored ? JSON.parse(stored) : [];
                         if (allFiles.length > 20) allFiles.pop();
                         allFiles.unshift(newFile);
                         localStorage.setItem(FILES_KEY, JSON.stringify(allFiles));
                         resolve(newFile);
                    } catch (e) { reject(e); }
                };
            };
            
            reader.onerror = error => reject(error);
        });
    },

    deleteFile: async (id: string, adminId?: string): Promise<void> => {
        const stored = localStorage.getItem(FILES_KEY);
        if (stored) {
            const allFiles: UploadedFile[] = JSON.parse(stored);
            const filtered = allFiles.filter(f => f.id !== id);
            localStorage.setItem(FILES_KEY, JSON.stringify(filtered));
        }
    }
};
