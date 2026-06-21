
import React, { useState, useEffect } from 'react';
import { CommunityService } from '../services/community';
import { AdService } from '../services/ads';
import { ForumThread, UserRole, AdCampaign } from '../types';
import { MessageSquare, Plus, Filter, ThumbsUp, Eye, MessageCircle, AlertCircle, Loader2, Search, Share2, MoreVertical, Lock, Pin, Trash2, Flag } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useUser } from '../context/UserContext';
import RichTextEditor from '../components/RichTextEditor';
import InteractionBar from '../components/InteractionBar';
import AdCard from '../components/AdCard';
import { Link } from 'react-router-dom';

const Forum = () => {
    const { user } = useUser();
    const [threads, setThreads] = useState<ForumThread[]>([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const { showNotification } = useNotification();
    const [ads, setAds] = useState<AdCampaign[]>([]);
    
    // New Thread State
    const [newTitle, setNewTitle] = useState('');
    const [newContent, setNewContent] = useState('');
    const [isPosting, setIsPosting] = useState(false);

    // Admin & Permission Check
    const isAdmin = user?.role === UserRole.ADMIN;
    const canModerate = isAdmin || user?.role === UserRole.MODERATOR;

    useEffect(() => {
        const loadData = async () => {
            const [tData, aData] = await Promise.all([
                CommunityService.getThreads(),
                AdService.getAds(user?.role)
            ]);
            setThreads(tData);
            setAds(aData);
        };
        loadData();
    }, [user]);

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            // Trigger login
            if(confirm("Log in to post?")) window.location.href = "/auth/login";
            return;
        }

        if (!newTitle || !newContent) return;

        setIsPosting(true);
        try {
            // 1. AI Moderation Check
            if (!isAdmin) { // Admins bypass AI
                const check = await CommunityService.moderateContent(newTitle + " " + newContent);
                if (!check.safe) {
                    showNotification('alert', 'Content Flagged', check.reason || 'Safety violation detected.');
                    setIsPosting(false);
                    return;
                }
            }

            // 2. Create
            await CommunityService.createThread({ title: newTitle, content: newContent });
            showNotification('success', 'Posted', 'Discussion started successfully.');
            setIsCreateModalOpen(false);
            setNewTitle('');
            setNewContent('');
            const data = await CommunityService.getThreads(); // Refresh
            setThreads(data);
        } catch (err) {
            showNotification('alert', 'Error', 'Failed to post.');
        } finally {
            setIsPosting(false);
        }
    };

    const handleAdminAction = async (action: 'delete' | 'lock' | 'pin', threadId: string) => {
        if (!canModerate) return;
        try {
            if (action === 'delete') {
                if(confirm("Are you sure? This action cannot be undone.")) {
                    await CommunityService.deleteThread(threadId);
                    showNotification('success', 'Deleted', 'Thread removed.');
                }
            } else if (action === 'lock') {
                const isLocked = await CommunityService.toggleThreadLock(threadId);
                showNotification('info', isLocked ? 'Locked' : 'Unlocked', `Thread ${isLocked ? 'locked' : 'unlocked'}.`);
            } else if (action === 'pin') {
                const isPinned = await CommunityService.toggleThreadPin(threadId);
                showNotification('info', isPinned ? 'Pinned' : 'Unpinned', `Thread ${isPinned ? 'pinned' : 'unpinned'}.`);
            }
            const data = await CommunityService.getThreads();
            setThreads(data);
        } catch (e) {
            showNotification('alert', 'Error', 'Action failed.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Community Forum</h1>
                    <p className="text-sm text-gray-500">Ask questions, share knowledge, and connect.</p>
                </div>
                <button 
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium flex items-center hover:bg-indigo-700 transition shadow-sm"
                >
                    <Plus className="w-4 h-4 mr-2" /> Start Discussion
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                <div className="flex gap-2">
                    {['All', 'General', 'Tech', 'Design', 'Marketing', 'Support'].map(cat => (
                        <button key={cat} className="px-4 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition whitespace-nowrap">
                            {cat}
                        </button>
                    ))}
                </div>
                <div className="flex-1"></div>
                <div className="relative hidden md:block">
                     <Search className="absolute left-3 top-2 w-4 h-4 text-gray-400" />
                     <input className="pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-indigo-300 outline-none w-48" placeholder="Search forum..." />
                </div>
            </div>

            {/* Threads List */}
            <div className="space-y-4">
                {threads.map((thread, index) => (
                    <React.Fragment key={thread.id}>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:border-indigo-200 transition-colors group relative">
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 flex flex-col items-center space-y-1 w-12 text-center bg-gray-50 p-2 rounded-lg border border-gray-100">
                                    <div className="text-gray-400">
                                        <ThumbsUp className="w-5 h-5" />
                                    </div>
                                    <span className="text-sm font-bold text-gray-700">{thread.upvotes}</span>
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                            {thread.categoryName}
                                        </span>
                                        {thread.isPinned && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-bold border border-yellow-200 flex items-center"><Pin className="w-3 h-3 mr-1"/> Pinned</span>}
                                        {thread.status === 'locked' && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold border border-red-200 flex items-center"><Lock className="w-3 h-3 mr-1"/> Locked</span>}
                                        <span className="text-xs text-gray-400 ml-auto md:ml-0">• Posted by {thread.userName}</span>
                                    </div>
                                    <Link to={`/community/thread/${thread.id}`} className="block">
                                        <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-indigo-600 transition truncate pr-8">
                                            {thread.title}
                                        </h3>
                                        <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                                            {thread.content.replace(/<[^>]*>?/gm, '')}
                                        </p>
                                    </Link>
                                    
                                    <InteractionBar 
                                        type="thread" 
                                        id={thread.id} 
                                        initialCounts={thread.interactions}
                                        initialState={thread.userState}
                                    />
                                </div>
                            </div>

                            {/* Admin / Mod Controls */}
                            {canModerate && (
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="flex gap-1 bg-white border border-gray-200 shadow-sm rounded-lg p-1">
                                        <button onClick={() => handleAdminAction('pin', thread.id)} className={`p-1.5 rounded hover:bg-gray-100 ${thread.isPinned ? 'text-yellow-600' : 'text-gray-400'}`} title="Pin"><Pin className="w-4 h-4" /></button>
                                        <button onClick={() => handleAdminAction('lock', thread.id)} className={`p-1.5 rounded hover:bg-gray-100 ${thread.status === 'locked' ? 'text-red-600' : 'text-gray-400'}`} title="Lock"><Lock className="w-4 h-4" /></button>
                                        <button onClick={() => handleAdminAction('delete', thread.id)} className="p-1.5 rounded hover:bg-red-50 text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            )}
                        </div>
                        {/* Feed Ad */}
                        {ads.length > 0 && (index + 1) % 5 === 0 && (
                            <AdCard ad={ads[Math.floor(Math.random() * ads.length)]} />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-6 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900">Start a Discussion</h3>
                            <button onClick={() => setIsCreateModalOpen(false)} className="text-gray-400 hover:text-gray-600"><AlertCircle className="w-5 h-5 rotate-45" /></button>
                        </div>
                        <form onSubmit={handleCreatePost} className="space-y-4 flex-1 overflow-y-auto pr-2">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                                <input 
                                    className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
                                    placeholder="What's on your mind?"
                                    value={newTitle}
                                    onChange={e => setNewTitle(e.target.value)}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                                <RichTextEditor 
                                    value={newContent} 
                                    onChange={setNewContent} 
                                    placeholder="Share your thoughts..." 
                                    height="300px"
                                />
                            </div>
                            <div className="bg-yellow-50 p-3 rounded-lg text-xs text-yellow-800 flex items-start border border-yellow-100">
                                <AlertCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                                <p><strong>Safety Warning:</strong> Do not share sensitive personal information such as passwords, private keys, bank details, or government IDs. AtMyWorks admins will never request this information.</p>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">Cancel</button>
                                <button 
                                    type="submit" 
                                    disabled={isPosting}
                                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 flex items-center disabled:opacity-70 transition-colors shadow-sm"
                                >
                                    {isPosting ? <Loader2 className="w-4 h-4 animate-spin mr-2"/> : null}
                                    Post Thread
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Forum;
