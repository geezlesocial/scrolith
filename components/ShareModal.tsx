
import React from 'react';
import { X, Link as LinkIcon, Facebook, Twitter, Linkedin, MessageCircleMore } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    url: string;
    onShare: () => void;
}

const ShareModal: React.FC<Props> = ({ isOpen, onClose, url, onShare }) => {
    const { showNotification } = useNotification();

    if (!isOpen) return null;

    const copyLink = async () => {
        await navigator.clipboard.writeText(url);
        showNotification('success', 'Copied', 'Link copied to clipboard');
        onShare();
    };

    const openPopup = (targetUrl: string) => {
        const popup = window.open(targetUrl, '_blank', 'noopener,noreferrer,width=720,height=640');
        if (!popup) {
            throw new Error('Popup blocked');
        }
    };

    const shareSocial = (platform: 'facebook' | 'x' | 'linkedin' | 'whatsapp') => {
        const encodedUrl = encodeURIComponent(url);
        const encodedText = encodeURIComponent(url);
        const targetUrl =
            platform === 'facebook'
                ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
                : platform === 'x'
                    ? `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`
                    : platform === 'linkedin'
                        ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
                        : `https://wa.me/?text=${encodedText}`;

        try {
            openPopup(targetUrl);
            showNotification('success', 'Shared', `Shared to ${platform === 'x' ? 'X' : platform === 'linkedin' ? 'LinkedIn' : platform === 'whatsapp' ? 'WhatsApp' : 'Facebook'}`);
            onShare();
        } catch (error) {
            console.warn(`Sharing to ${platform} failed`, error);
            showNotification('error', 'Share failed', 'Unable to open the social sharing target.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl w-full max-w-sm p-6 shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
                <h3 className="text-lg font-bold text-gray-900 mb-4">Share to...</h3>
                
                <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
                     <button onClick={() => shareSocial('linkedin')} className="flex flex-col items-center gap-2 group">
                         <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 group-hover:scale-110 transition"><Linkedin className="w-6 h-6"/></div>
                         <span className="text-xs text-gray-600">LinkedIn</span>
                     </button>
                     <button onClick={() => shareSocial('x')} className="flex flex-col items-center gap-2 group">
                         <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center text-sky-600 group-hover:scale-110 transition"><Twitter className="w-6 h-6"/></div>
                         <span className="text-xs text-gray-600">X</span>
                     </button>
                     <button onClick={() => shareSocial('facebook')} className="flex flex-col items-center gap-2 group">
                         <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-800 group-hover:scale-110 transition"><Facebook className="w-6 h-6"/></div>
                         <span className="text-xs text-gray-600">Facebook</span>
                     </button>
                     <button onClick={() => shareSocial('whatsapp')} className="flex flex-col items-center gap-2 group">
                         <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-600 group-hover:scale-110 transition"><MessageCircleMore className="w-6 h-6"/></div>
                         <span className="text-xs text-gray-600">WhatsApp</span>
                     </button>
                </div>

                <div className="flex items-center bg-gray-50 rounded-lg p-2 border border-gray-200">
                    <span className="text-xs text-gray-500 truncate flex-1 px-2">{url}</span>
                    <button onClick={copyLink} className="bg-white border shadow-sm px-3 py-1.5 rounded text-xs font-bold hover:bg-gray-50 flex items-center">
                        <LinkIcon className="w-3 h-3 mr-1" /> Copy
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ShareModal;
