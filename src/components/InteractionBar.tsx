
import React, { useState } from 'react';
import { Heart, MessageCircle, Repeat, Share2, Loader2 } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { CommunityService } from '../services/community';
import { useNotification } from '../context/NotificationContext';
import { InteractionCounts, InteractionState } from '../types';
import ShareModal from './ShareModal';

interface Props {
    type: 'thread' | 'comment' | 'post';
    id: string;
    initialCounts?: InteractionCounts;
    initialState?: InteractionState;
}

const InteractionBar: React.FC<Props> = ({ type, id, initialCounts, initialState }) => {
    const { user } = useUser();
    const { showNotification } = useNotification();
    
    const [counts, setCounts] = useState<InteractionCounts>(initialCounts || { likes: 0, comments: 0, reposts: 0, shares: 0 });
    const [state, setState] = useState<InteractionState>(initialState || { liked: false, reposted: false });
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Guard check for guest
    const checkAuth = () => {
        if (!user) {
            // Trigger global login modal via event or alert
            if(confirm("Log in to interact with the Scrolith Community. Go to login?")) {
                window.location.href = "/auth/login";
            }
            return false;
        }
        return true;
    };

    const handleLike = async () => {
        if (!checkAuth()) return;
        
        // Optimistic UI
        const newLiked = !state.liked;
        setState(prev => ({ ...prev, liked: newLiked }));
        setCounts(prev => ({ ...prev, likes: prev.likes + (newLiked ? 1 : -1) }));

        try {
            await CommunityService.toggleLike(id, type); // Service needs to implement this mock
        } catch (e) {
            // Revert on error
            setState(prev => ({ ...prev, liked: !newLiked }));
            setCounts(prev => ({ ...prev, likes: prev.likes + (newLiked ? -1 : 1) }));
        }
    };

    const handleRepost = async () => {
        if (!checkAuth()) return;
        
        if(state.reposted) return; // Prevent double repost for now
        
        if(!confirm("Repost this to your feed?")) return;

        setState(prev => ({ ...prev, reposted: true }));
        setCounts(prev => ({ ...prev, reposts: prev.reposts + 1 }));
        
        await CommunityService.repost(id, type);
        showNotification('success', 'Reposted', 'Shared to your profile.');
    };

    const handleShareClick = () => {
        if (!checkAuth()) return;
        setIsShareModalOpen(true);
    };

    const handleShareComplete = () => {
        setCounts(prev => ({ ...prev, shares: prev.shares + 1 }));
        setIsShareModalOpen(false);
    };

    return (
        <div className="flex items-center justify-between text-gray-500 text-sm mt-3 pt-3 border-t border-gray-100">
            <button 
                onClick={handleLike}
                className={`flex items-center space-x-1 hover:text-red-500 transition ${state.liked ? 'text-red-500' : ''}`}
            >
                <Heart className={`w-4 h-4 ${state.liked ? 'fill-current' : ''}`} />
                <span>{counts.likes}</span>
            </button>

            <button className="flex items-center space-x-1 hover:text-blue-500 transition">
                <MessageCircle className="w-4 h-4" />
                <span>{counts.comments}</span>
            </button>

            <button 
                onClick={handleRepost}
                className={`flex items-center space-x-1 hover:text-green-500 transition ${state.reposted ? 'text-green-600' : ''}`}
            >
                <Repeat className="w-4 h-4" />
                <span>{counts.reposts}</span>
            </button>

            <button 
                onClick={handleShareClick}
                className="flex items-center space-x-1 hover:text-indigo-500 transition"
            >
                <Share2 className="w-4 h-4" />
                <span>{counts.shares}</span>
            </button>

            <ShareModal 
                isOpen={isShareModalOpen} 
                onClose={() => setIsShareModalOpen(false)} 
                url={window.location.href} // Simplified
                onShare={handleShareComplete}
            />
        </div>
    );
};

export default InteractionBar;
