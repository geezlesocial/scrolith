import React, { useEffect, useState } from 'react';
import { Heart, MessageCircle, Repeat, Loader2, Coins, Send, Eye } from 'lucide-react';
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

    const buttonBase =
        'group relative inline-flex aspect-square min-h-[64px] flex-1 items-center justify-center rounded-[28px] border border-slate-200/60 bg-white/90 px-2 py-2 text-slate-600 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-sm';
    const iconWrap =
        'inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition group-hover:bg-slate-900 group-hover:text-white';
    const badgeBase =
        'absolute -right-2 -top-2 inline-flex min-w-5 items-center justify-center rounded-full border border-white px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm';
    const viewCount = Math.max(0, Number(counts.views || 0));

    return (
        <div className="mt-3 space-y-2">
            <div className="flex items-center justify-end">
                <div
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm"
                    title={`${viewCount.toLocaleString()} views`}
                    aria-label={`${viewCount.toLocaleString()} views`}
                >
                    <Eye className="h-3.5 w-3.5" />
                    <span>{viewCount.toLocaleString()} views</span>
                </div>
            </div>
            <div className="grid grid-cols-5 gap-2 rounded-[32px] border border-slate-200/80 bg-slate-50/75 p-2 shadow-sm">
            <button 
                onClick={handleLike}
                disabled={isProcessing}
                aria-label={`Like ${counts.likes}`}
                title={`Like ${counts.likes}`}
                className={`${buttonBase} ${state.liked ? 'border-rose-200 bg-rose-50/70 text-rose-600 hover:bg-rose-50' : ''} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <span className="relative inline-flex items-center justify-center">
                    <span className={`${iconWrap} ${state.liked ? 'bg-rose-100 text-rose-600' : ''}`}>
                        {isProcessing && type === 'like' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Heart className={`h-4 w-4 ${state.liked ? 'fill-current' : ''}`} />
                        )}
                    </span>
                    <span className={`${badgeBase} bg-slate-900`}>
                        {counts.likes}
                    </span>
                </span>
            </button>

            <button 
                aria-label={`Comment ${counts.comments}`}
                title={`Comment ${counts.comments}`}
                className={buttonBase}
                onClick={() => {
                    if (checkAuth()) {
                        // Navigate to comments section
                        window.location.href = `#${type}-${id}-comments`;
                    }
                }}
            >
                <span className="relative inline-flex items-center justify-center">
                    <span className={iconWrap}>
                        <MessageCircle className="h-4 w-4" />
                    </span>
                    <span className={`${badgeBase} bg-slate-900`}>
                        {counts.comments}
                    </span>
                </span>
            </button>

            <button 
                onClick={handleRepost}
                disabled={isProcessing}
                aria-label={`Repost ${counts.reposts}`}
                title={`Repost ${counts.reposts}`}
                className={`${buttonBase} ${state.reposted ? 'border-emerald-200 bg-emerald-50/70 text-emerald-600 hover:bg-emerald-50' : ''} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                <span className="relative inline-flex items-center justify-center">
                    <span className={`${iconWrap} ${state.reposted ? 'bg-emerald-100 text-emerald-600' : ''}`}>
                        {isProcessing && type === 'repost' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Repeat className="h-4 w-4" />
                        )}
                    </span>
                    <span className={`${badgeBase} bg-slate-900`}>
                        {counts.reposts}
                    </span>
                </span>
            </button>

            <button 
                onClick={handleShareClick}
                disabled={isProcessing}
                aria-label={`Send ${counts.shares}`}
                title={`Send ${counts.shares}`}
                className={buttonBase}
            >
                <span className="relative inline-flex items-center justify-center">
                    <span className={iconWrap}>
                        <Send className="h-4 w-4" />
                    </span>
                    <span className={`${badgeBase} bg-slate-900`}>
                        {counts.shares}
                    </span>
                </span>
            </button>

            <button
                onClick={() => {
                    if (!checkAuth()) return;
                    setIsSendModalOpen(true);
                }}
                aria-label={`Donate Dashcoin ${counts.reactions ?? 0}`}
                title={`Donate Dashcoin ${counts.reactions ?? 0}`}
                className={buttonBase}
            >
                <span className="relative inline-flex items-center justify-center">
                    <span className={`${iconWrap} text-amber-600 group-hover:text-white`}>
                        <Coins className="h-4 w-4" />
                    </span>
                    <span className={`${badgeBase} bg-emerald-600`}>
                        {counts.reactions ?? 0}
                    </span>
                </span>
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
        </div>
    );
};

export default InteractionBar;

