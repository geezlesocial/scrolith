import React from 'react';
import { Link as LinkIcon, Copy, Mail, Facebook, Twitter, Linkedin } from 'lucide-react';
import MobileDialog from './mobile/MobileDialog';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  description?: string;
  onShare?: () => void;
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, url, title, description, onShare }) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      if (onShare) onShare();
    } catch (err) {
      console.error('Failed to copy URL:', err);
    }
  };

  const shareOptions = [
    { name: 'Copy Link', icon: Copy, action: handleCopy },
    { name: 'Email', icon: Mail, action: () => window.open(`mailto:?subject=${encodeURIComponent(title || '')}&body=${encodeURIComponent(description || '')}%20${url}`) },
    { name: 'Facebook', icon: Facebook, action: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`) },
    { name: 'Twitter', icon: Twitter, action: () => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title || '')}`) },
    { name: 'LinkedIn', icon: Linkedin, action: () => window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&title=${encodeURIComponent(title || '')}`) }
  ];

  if (!isOpen) return null;

  return (
    <MobileDialog open={isOpen} onClose={onClose} size="sm" title="Share this">
        <div className="flex items-center p-3 bg-gray-50 rounded-lg mb-4">
          <LinkIcon className="w-4 h-4 text-gray-500 mr-2" />
          <span className="text-sm text-gray-700 truncate">{url}</span>
          <button 
            onClick={handleCopy}
            className="ml-auto text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            Copy
          </button>
        </div>
        
        <div className="grid grid-cols-3 gap-3">
          {shareOptions.map((option, index) => {
            const Icon = option.icon;
            return (
              <button
                key={index}
                onClick={() => {
                  option.action();
                  if (onShare) onShare();
                }}
                className="flex flex-col items-center p-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Icon className="w-6 h-6 text-gray-700 mb-1" />
                <span className="text-xs text-gray-600">{option.name}</span>
              </button>
            );
          })}
        </div>
    </MobileDialog>
  );
};

export default ShareModal;
