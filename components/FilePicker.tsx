
import React, { useState, useEffect } from 'react';
import { Upload, X, Check, Image as ImageIcon, FileText, Video, Loader2 } from 'lucide-react';
import { FileService } from '../services/files';
import { UploadedFile } from '../types';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';

interface FilePickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (file: UploadedFile) => void;
    acceptedTypes?: string; // e.g. "image/*" or ".pdf,.doc"
    title?: string;
}

const FilePicker: React.FC<FilePickerProps> = ({ isOpen, onClose, onSelect, acceptedTypes, title = "Select File" }) => {
    const { user } = useUser();
    const { showNotification } = useNotification();
    const [files, setFiles] = useState<UploadedFile[]>([]);
    const [activeTab, setActiveTab] = useState<'library' | 'upload'>('library');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    useEffect(() => {
        if (isOpen && user) {
            loadLibrary();
        }
    }, [isOpen, user]);

    const loadLibrary = async () => {
        if (!user) return;
        const userFiles = await FileService.getFiles(user.id);
        setFiles(userFiles);
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && user) {
            setIsUploading(true);
            setUploadProgress(10); 
            
            try {
                // Simulate network
                const interval = setInterval(() => {
                    setUploadProgress(prev => Math.min(prev + 10, 90));
                }, 100);

                // Detect Type
                const file = e.target.files[0];
                let category: UploadedFile['category'] = 'document';
                if (file.type.startsWith('image/')) category = 'portfolio';
                if (file.type.startsWith('video/')) category = 'portfolio'; 

                const newFile = await FileService.uploadFile(user.id, file, category);
                
                clearInterval(interval);
                setUploadProgress(100);
                
                setFiles(prev => [newFile, ...prev]);
                setActiveTab('library');
                showNotification('success', 'Upload Complete', 'File added to your library.');
            } catch (error) {
                showNotification('alert', 'Error', 'Upload failed.');
            } finally {
                setIsUploading(false);
                setUploadProgress(0);
            }
        }
    };

    const getIcon = (type: string) => {
        if (type.startsWith('image/')) return <ImageIcon className="w-8 h-8 text-purple-500" />;
        if (type.startsWith('video/')) return <Video className="w-8 h-8 text-red-500" />;
        return <FileText className="w-8 h-8 text-blue-500" />;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[80vh] overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-900">{title}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200">
                    <button 
                        onClick={() => setActiveTab('library')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'library' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        My Files
                    </button>
                    <button 
                        onClick={() => setActiveTab('upload')}
                        className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'upload' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-600 hover:bg-gray-50'}`}
                    >
                        Upload New
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                    {activeTab === 'library' ? (
                        files.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <p>No files found.</p>
                                <button onClick={() => setActiveTab('upload')} className="text-blue-600 hover:underline mt-2">Upload your first file</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {files.map(file => (
                                    <div 
                                        key={file.id} 
                                        onClick={() => { onSelect(file); onClose(); }}
                                        className="group bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-blue-500 hover:shadow-md transition-all relative"
                                    >
                                        <div className="aspect-square bg-gray-100 rounded flex items-center justify-center mb-2 overflow-hidden relative">
                                            {file.type.startsWith('image/') ? (
                                                <img src={file.url} className="w-full h-full object-cover" alt={file.name} />
                                            ) : file.type.startsWith('video/') ? (
                                                <div className="flex flex-col items-center justify-center w-full h-full bg-black">
                                                    <Video className="w-8 h-8 text-white mb-1" />
                                                    <span className="text-[8px] text-gray-400">VIDEO PREVIEW</span>
                                                </div>
                                            ) : (
                                                getIcon(file.type)
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-700 truncate font-medium">{file.name}</p>
                                        <p className="text--[10px] text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>
                                        
                                        <div className="absolute inset-0 bg-blue-600/10 border-2 border-blue-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full font-bold shadow-sm">Select</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl bg-white p-8">
                            {isUploading ? (
                                <div className="text-center">
                                    <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                                    <p className="text-gray-600 font-medium">Uploading...</p>
                                    <div className="w-48 h-2 bg-gray-100 rounded-full mt-3 overflow-hidden">
                                        <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <Upload className="w-12 h-12 text-gray-400 mb-4" />
                                    <h4 className="text-lg font-bold text-gray-900 mb-2">Upload File</h4>
                                    <p className="text-sm text-gray-500 mb-6 text-center max-w-xs">
                                        Click to browse or drag and drop. <br/> Supported: {acceptedTypes || 'All files'} (Max 250MB)
                                    </p>
                                    <label className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold cursor-pointer hover:bg-blue-700 transition shadow-sm">
                                        Browse Device
                                        <input 
                                            type="file" 
                                            className="hidden" 
                                            accept={acceptedTypes}
                                            onChange={handleUpload}
                                        />
                                    </label>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default FilePicker;
