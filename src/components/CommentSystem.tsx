
import React, { useState } from 'react';
import { CommunityComment } from '../types';
import { useUser } from '../context/UserContext';
import { CommunityService } from '../services/community';
import { useNotification } from '../context/NotificationContext';
import { MessageCircle, Heart, Share2, CornerDownRight, MoreVertical, Flag, Send } from 'lucide-react';
import RichTextEditor from './RichTextEditor';

interface CommentSystemProps {
    threadId: string;
    comments: CommunityComment[];
    onRefresh: () => void;
}

const CommentSystem: React.FC<CommentSystemProps> = ({ threadId, comments, onRefresh }) => {
    const { user } = useUser();
    const { showNotification } = useNotification();
    const [newComment, setNewComment] = useState('');
    const [isPosting, setIsPosting] = useState(false);

    const handleSubmit = async () => {
        if (!user) {
            if(confirm("Log in to comment?")) window.location.href = "/auth/login";
            return;
        }
        if (!newComment.trim()) return;

        setIsPosting(true);
        try {
            await CommunityService.postComment(threadId, newComment, user);
            setNewComment('');
            showNotification('success', 'Posted', 'Your comment is live.');
            onRefresh();
        } catch (e) {
            showNotification('alert', 'Error', 'Failed to post comment.');
        } finally {
            setIsPosting(false);
        }
    };

    return (
        <div className="mt-8">
            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                <MessageCircle className="w-5 h-5 mr-2 text-indigo-600" />
                Comments ({comments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0)})
            </h3>

            {/* Main Input */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-8">
                <div className="flex gap-4">
                    <img src={user?.avatar || "https://ui-avatars.com/api/?name=Guest"} className="w-10 h-10 rounded-full" />
                    <div className="flex-1">
                        <RichTextEditor 
                            value={newComment} 
                            onChange={setNewComment} 
                            placeholder="Join the discussion... (Type @ to mention)" 
                            height="100px"
                            showToolbar={false}
                        />
                        <div className="flex justify-end mt-2">
                            <button 
                                onClick={handleSubmit} 
                                disabled={isPosting || !newComment.trim()}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                            >
                                {isPosting ? 'Posting...' : <><Send className="w-4 h-4 mr-2" /> Post Comment</>}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tree */}
            <div className="space-y-6">
                {comments.map(comment => (
                    <CommentNode key={comment.id} comment={comment} threadId={threadId} onRefresh={onRefresh} depth={0} />
                ))}
            </div>
        </div>
    );
};

interface CommentNodeProps {
    comment: CommunityComment;
    threadId: string;
    onRefresh: () => void;
    depth: number;
}

const CommentNode: React.FC<CommentNodeProps> = ({ comment, threadId, onRefresh, depth }) => {
    const { user } = useUser();
    const { showNotification } = useNotification();
    const [isReplying, setIsReplying] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [isPostingReply, setIsPostingReply] = useState(false);
    const [isLiked, setIsLiked] = useState(comment.isLiked);
    const [likesCount, setLikesCount] = useState(comment.likes);

    const handleLike = async () => {
        if (!user) return;
        setIsLiked(!isLiked);
        setLikesCount(prev => isLiked ? prev - 1 : prev + 1);
        await CommunityService.toggleLike(comment.id, 'comment');
    };

    const handleReplySubmit = async () => {
        if (!user) {
             if(confirm("Log in to reply?")) window.location.href = "/auth/login";
             return;
        }
        if (!replyText.trim()) return;

        setIsPostingReply(true);
        try {
            await CommunityService.postComment(threadId, replyText, user, comment.id);
            setReplyText('');
            setIsReplying(false);
            onRefresh();
            showNotification('success', 'Replied', 'Reply posted successfully.');
        } catch (e) {
            showNotification('alert', 'Error', 'Failed to reply.');
        } finally {
            setIsPostingReply(false);
        }
    };

    const maxDepth = 4; // Visual nesting limit
    const indentClass = depth > 0 ? (depth < maxDepth ? "ml-8 md:ml-12 border-l-2 border-gray-100 pl-4" : "ml-4 border-l-2 border-gray-100 pl-4") : "";

    return (
        <div className={`group ${indentClass} mt-4`}>
            <div className="flex gap-3">
                <img src={comment.userAvatar} className="w-8 h-8 rounded-full flex-shrink-0 cursor-pointer" title={comment.userName} />
                <div className="flex-1">
                    <div className="bg-gray-50 rounded-xl p-4 relative group-hover:bg-gray-100 transition-colors">
                        <div className="flex justify-between items-start mb-1">
                            <div className="flex items-center">
                                <span className="font-bold text-sm text-gray-900 mr-2">{comment.userName}</span>
                                <span className="text-xs text-gray-500 bg-white border px-1.5 rounded uppercase">{comment.userRole}</span>
                                <span className="text-xs text-gray-400 ml-2">{new Date(comment.createdAt).toLocaleDateString()}</span>
                            </div>
                            <button className="text-gray-400 hover:text-gray-600"><MoreVertical className="w-4 h-4" /></button>
                        </div>
                        
                        <div className="text-gray-800 text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: comment.content }} />
                        
                        {/* Actions */}
                        <div className="flex items-center gap-4 mt-3">
                            <button 
                                onClick={handleLike} 
                                className={`flex items-center text-xs font-bold transition-colors ${isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                            >
                                <Heart className={`w-3.5 h-3.5 mr-1 ${isLiked ? 'fill-current' : ''}`} /> {likesCount}
                            </button>
                            <button 
                                onClick={() => setIsReplying(!isReplying)} 
                                className="flex items-center text-xs font-bold text-gray-500 hover:text-blue-600 transition-colors"
                            >
                                <MessageCircle className="w-3.5 h-3.5 mr-1" /> Reply
                            </button>
                            <button className="flex items-center text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors ml-auto">
                                <Flag className="w-3.5 h-3.5 mr-1" /> Report
                            </button>
                        </div>
                    </div>

                    {/* Reply Input */}
                    {isReplying && (
                        <div className="mt-3 flex gap-3 animate-fade-in">
                            <div className="w-8 flex justify-center"><CornerDownRight className="w-5 h-5 text-gray-300" /></div>
                            <div className="flex-1">
                                <RichTextEditor 
                                    value={replyText} 
                                    onChange={setReplyText} 
                                    placeholder={`Replying to ${comment.userName}...`} 
                                    height="80px"
                                    showToolbar={false}
                                />
                                <div className="flex justify-end gap-2 mt-2">
                                    <button onClick={() => setIsReplying(false)} className="text-xs text-gray-500 px-3 py-1.5 hover:bg-gray-100 rounded">Cancel</button>
                                    <button 
                                        onClick={handleReplySubmit} 
                                        disabled={isPostingReply}
                                        className="bg-blue-600 text-white text-xs px-4 py-1.5 rounded-lg font-bold hover:bg-blue-700"
                                    >
                                        Reply
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Recursive Children */}
                    {comment.replies && comment.replies.length > 0 && (
                        <div className="mt-2">
                            {comment.replies.map(reply => (
                                <CommentNode key={reply.id} comment={reply} threadId={threadId} onRefresh={onRefresh} depth={depth + 1} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CommentSystem;