
import React, { useState, useEffect } from 'react';
import { MediaItem } from '../../types';
import { FileService } from '../../services/files';
import { CMSService } from '../../services/cms';
import { useNotification } from '../../context/NotificationContext';
import { Upload, Eye, Trash2 } from 'lucide-react';

const UploadedFilesTab = () => {
    const [files, setFiles] = useState<MediaItem[]>([]);
    const { showNotification } = useNotification();

    useEffect(() => {
        // Fetch all files using the centralized FileService which accesses localStorage
        FileService.getFiles('admin').then(uploadedFiles => {
             // Map UploadedFile to MediaItem structure if needed, or just use as is
             const mediaItems: MediaItem[] = uploadedFiles.map(f => ({
                 id: f.id,
                 name: f.name,
                 url: f.url,
                 type: f.type,
                 size: f.size,
                 createdAt: f.createdAt
             }));
             setFiles(mediaItems);
        });
    }, []);

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            // Upload using CMSService wrapper (which now uses FileService) or directly
            CMSService.uploadMedia(e.target.files[0]).then(newItem => {
                setFiles(prev => [newItem, ...prev]);
                showNotification('success', 'File Uploaded', 'New media added to library.');
            });
        }
    };

    const handleDelete = async (id: string) => {
        if(confirm('Delete this file?')) {
            await FileService.deleteFile(id);
            setFiles(p => p.filter(f => f.id !== id));
            showNotification('success', 'Deleted', 'File removed from storage.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
                <h3 className="font-bold text-gray-900">File Manager</h3>
                <label className="bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 flex items-center text-sm font-medium">
                    <Upload className="w-4 h-4 mr-2" /> Upload File
                    <input type="file" className="hidden" onChange={handleUpload} />
                </label>
            </div>
            
            {files.length === 0 ? (
                <div className="text-center p-12 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <Upload className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No files uploaded yet.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {files.map(file => (
                        <div key={file.id} className="group relative aspect-square bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                            {file.type === 'image' ? (
                                <img src={file.url} className="w-full h-full object-cover" alt={file.name} />
                            ) : (
                                <div className="flex items-center justify-center h-full text-gray-400 font-bold uppercase text-xs p-2 text-center break-words">{file.name}</div>
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                                <p className="text-white text-xs truncate mb-2">{file.name}</p>
                                <div className="flex justify-between">
                                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="p-1 bg-white rounded text-blue-600 hover:bg-blue-50"><Eye className="w-3 h-3" /></a>
                                    <button className="p-1 bg-white rounded text-red-600 hover:bg-red-50" onClick={() => handleDelete(file.id)}><Trash2 className="w-3 h-3" /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default UploadedFilesTab;
