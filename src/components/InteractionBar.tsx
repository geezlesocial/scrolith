import React, { useEffect, useState } from 'react';
import { Heart, MessageCircle, Repeat, Share2, Loader2, Zap, Eye, Smile } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { CommunityService } from '../services/community';
import { useNotification } from '../context/NotificationContext';
import { InteractionCounts, InteractionState } from '../types';
import ShareModal from './ShareModal';
import SendGcoinModal from './SendGcoinModal';

interface Props {
    type: 'thread' | 'comment' | 'post';
    id: string;
    initialCounts?: InteractionCounts;
    initialState?: InteractionState;
}

const InteractionBar: React.FC<Props> = ({ type, id, initialCounts, initialState }) => {
    const { user } = useUser();
    const { showNotification } = useNotification();
    
    const [counts, setCounts] = useState<InteractionCounts>(
        initialCounts || { likes: 0, comments: 0, reposts: 0, shares: 0, views: 0, reactions: 0 }
    );
    const [state, setState] = useState<InteractionState>(initialState || { liked: false, reposted: false });
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [isSendModalOpen, setIsSendModalOpen] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (initialCounts) setCounts(initialCounts);
    }, [initialCounts?.likes, initialCounts?.comments, initialCounts?.reposts, initialCounts?.shares, initialCounts?.views, initialCounts?.reactions]);

    useEffect(() => {
        if (initialState) setState(initialState);
    }, [initialState?.liked, initialState?.reposted]);

    // Guard check for guest
    const checkAuth = () => {
        if (!user) {
            if (confirm("Log in to interact with the Scrolith Community. Go to login?")) {
                window.location.href = "/auth/login";
            }
            return false;
        }
        return true;
    };

    const handleLike = async () => {
        if (!checkAuth()) return;
        
        // Add small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 150));
        
        // Optimistic UI update
        const newLiked = !state.liked;
        setState(prev => ({ ...prev, liked: newLiked }));
        setCounts(prev => ({ ...prev, likes: prev.likes + (newLiked ? 1 : -1) }));

        setIsProcessing(true);
        try {
            if (type === 'post') {
                if (newLiked) await CommunityService.postLike(id);
                else await CommunityService.postUnlike(id);
            } else {
                await CommunityService.toggleLike(id, type);
            }
        } catch (e) {
            console.error('Like toggle failed:', e);
            // Revert on error
            setState(prev => ({ ...prev, liked: !newLiked }));
            setCounts(prev => ({ ...prev, likes: prev.likes + (newLiked ? -1 : 1) }));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRepost = async () => {
        if (!checkAuth()) return;
        
        if (state.reposted) return;
        
        if (!confirm("Repost this to your feed?")) return;

        setState(prev => ({ ...prev, reposted: true }));
        setCounts(prev => ({ ...prev, reposts: prev.reposts + 1 }));
        
        setIsProcessing(true);
        try {
            const success = type === 'post'
                ? await CommunityService.postRepost(id)
                : await CommunityService.repost(id, type);
            if (success) {
                showNotification('success', 'Reposted', 'Shared to your profile.');
            } else {
                // Revert on failure
                setState(prev => ({ ...prev, reposted: false }));
                setCounts(prev => ({ ...prev, reposts: prev.reposts - 1 }));
            }
        } catch (e) {
            console.error('Repost failed:', e);
            // Revert on error
            setState(prev => ({ ...prev, reposted: false }));
            setCounts(prev => ({ ...prev, reposts: prev.reposts - 1 }));
        } finally {
            setIsProcessing(false);
        }
    };

    const handleShareClick = () => {
        if (!checkAuth()) return;
        setIsShareModalOpen(true);
    };

    const handleShareComplete = () => {
        setCounts(prev => ({ ...prev, shares: prev.shares + 1 }));
        setIsShareModalOpen(false);
        if (type === 'post') {
            CommunityService.postShare(id).catch((e) => console.error('Share event failed:', e));
        }
    };

    return (
        <div className="flex items-center justify-between text-gray-500 text-sm mt-3 pt-3 border-t border-gray-100">
            <button 
                onClick={handleLike}
                disabled={isProcessing}
                className={`flex items-center space-x-1 hover:text-red-500 transition ${state.liked ? 'text-red-500' : ''} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {isProcessing && type === 'like' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Heart className={`w-4 h-4 ${state.liked ? 'fill-current' : ''}`} />
                )}
                <span>{counts.likes}</span>
            </button>

            <button 
                className="flex items-center space-x-1 hover:text-blue-500 transition"
                onClick={() => {
                    if (checkAuth()) {
                        // Navigate to comments section
                        window.location.href = `#${type}-${id}-comments`;
                    }
                }}
            >
                <MessageCircle className="w-4 h-4" />
                <span>{counts.comments}</span>
            </button>

            <button 
                onClick={handleRepost}
                disabled={isProcessing}
                className={`flex items-center space-x-1 hover:text-green-500 transition ${state.reposted ? 'text-green-600' : ''} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {isProcessing && type === 'repost' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <Repeat className="w-4 h-4" />
                )}
                <span>{counts.reposts}</span>
            </button>

            <button 
                onClick={handleShareClick}
                disabled={isProcessing}
                className="flex items-center space-x-1 hover:text-indigo-500 transition"
            >
                <Share2 className="w-4 h-4" />
                <span>{counts.shares}</span>
            </button>

            <span className="flex items-center space-x-1 text-slate-500">
                <Eye className="w-4 h-4" />
                <span>{counts.views ?? 0}</span>
            </span>

            <span className="flex items-center space-x-1 text-slate-500">
                <Smile className="w-4 h-4" />
                <span>{counts.reactions ?? 0}</span>
            </span>

            <button
                onClick={() => {
                    if (!checkAuth()) return;
                    setIsSendModalOpen(true);
                }}
                className="flex items-center space-x-1 hover:text-yellow-500 transition"
            >
                <Zap className="w-4 h-4" />
                <span className="text-xs">Dash</span>
            </button>

            <ShareModal 
                isOpen={isShareModalOpen} 
                onClose={() => setIsShareModalOpen(false)} 
                url={window.location.href}
                title={document.title}
                onShare={handleShareComplete}
            />

            <SendGcoinModal isOpen={isSendModalOpen} onClose={() => setIsSendModalOpen(false)} donatePostId={type === 'post' ? id : undefined} />
        </div>
    );
};

export default InteractionBar;

