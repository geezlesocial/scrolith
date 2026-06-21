
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CommunityService } from '../services/community';
import { ForumThread, CommunityComment } from '../types';
import { ArrowLeft, User, Calendar, Tag, ShieldCheck, MoreHorizontal, AlertCircle } from 'lucide-react';
import InteractionBar from '../components/InteractionBar';
import CommentSystem from '../components/CommentSystem';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';

const ThreadDetail = () => {
    const { id } = useParams<{ id: string }>();
    const { user } = useUser();
    const { showNotification } = useNotification();
    
    const [thread, setThread] = useState<ForumThread | null>(null);
    const [comments, setComments] = useState<CommunityComment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [id]);

    const loadData = async () => {
        if (!id) return;
        setLoading(true);
        try {
            const t = await CommunityService.getThreadById(id);
            if (t) {
                setThread(t);
                const c = await CommunityService.getComments(id);
                setComments(c);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-12 text-center text-gray-500">Loading discussion...</div>;
    if (!thread) return <div className="p-12 text-center text-gray-500">Thread not found.</div>;

    return (
        <div className="max-w-4xl mx-auto pb-12">
            <Link to="/community/forum" className="flex items-center text-gray-500 hover:text-indigo-600 mb-6 transition-colors">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Forum
            </Link>

            {/* Main Thread Content */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
                <div className="p-6 md:p-8">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-100 uppercase tracking-wide">
                                {thread.categoryName}
                            </span>
                            <span className="text-gray-400 text-sm flex items-center">
                                <Calendar className="w-3.5 h-3.5 mr-1" /> {new Date(thread.createdAt).toLocaleDateString()}
                            </span>
                        </div>
                        {thread.isPinned && (
                            <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded font-bold flex items-center">
                                <ShieldCheck className="w-3 h-3 mr-1" /> Pinned
                            </span>
                        )}
                    </div>

                    <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-6 leading-tight">{thread.title}</h1>

                    <div className="flex items-center mb-8 pb-8 border-b border-gray-100">
                        <img src={thread.userAvatar} className="w-10 h-10 rounded-full mr-3 border-2 border-white shadow-sm" />
                        <div>
                            <div className="font-bold text-gray-900 text-sm">{thread.userName}</div>
                            <div className="text-xs text-gray-500">Original Poster</div>
                        </div>
                        <div className="ml-auto">
                            <button className="text-gray-400 hover:text-gray-600"><MoreHorizontal className="w-5 h-5" /></button>
                        </div>
                    </div>

                    <div className="prose prose-indigo max-w-none text-gray-800 leading-relaxed mb-6" dangerouslySetInnerHTML={{ __html: thread.content }} />

                    <div className="flex flex-wrap gap-2 mb-6">
                        {thread.tags.map(tag => (
                            <span key={tag} className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded flex items-center">
                                <Tag className="w-3 h-3 mr-1" /> {tag}
                            </span>
                        ))}
                    </div>

                    <InteractionBar 
                        type="thread" 
                        id={thread.id} 
                        initialCounts={thread.interactions} 
                        initialState={thread.userState} 
                    />
                </div>
            </div>

            {/* Comments Section */}
            {thread.status === 'locked' ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center text-yellow-800">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-600" />
                    <h3 className="font-bold">This thread is locked</h3>
                    <p className="text-sm">Comments have been disabled by a moderator.</p>
                </div>
            ) : (
                <CommentSystem 
                    threadId={thread.id} 
                    comments={comments} 
                    onRefresh={loadData} 
                />
            )}
        </div>
    );
};

export default ThreadDetail;
