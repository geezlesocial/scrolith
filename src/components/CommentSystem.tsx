import React, { useState } from 'react';
import { CommunityService } from '../services/community';
import { CommunityComment, UserRole } from '../types';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import { MessageCircle, Send, Loader2, Heart, Reply, Trash2, AlertCircle } from 'lucide-react';
import RichTextEditor from './RichTextEditor';
import InteractionBar from './InteractionBar';
import EnterpriseAvatar from './common/EnterpriseAvatar';

interface CommentSystemProps {
  threadId: string;
  comments: CommunityComment[];
  onRefresh: () => void;
}

const CommentSystem: React.FC<CommentSystemProps> = ({ threadId, comments, onRefresh }) => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  // Transform comments to handle both snake_case and camelCase
  const transformComment = (comment: any): CommunityComment => ({
    id: comment.id,
    thread_id: comment.thread_id || comment.threadId || threadId,
    parent_id: comment.parent_id || comment.parentId || null,
    user_id: comment.user_id || comment.userId || '',
    user_name: comment.user_name || comment.userName || 'Anonymous',
    user_avatar: comment.user_avatar || comment.userAvatar || null,
    user_role: comment.user_role || comment.userRole || UserRole.GUEST,
    content: comment.content || '',
    created_at: comment.created_at || comment.createdAt || new Date().toISOString(),
    likes: comment.likes || 0,
    is_liked: comment.is_liked || comment.isLiked || false,
    replies: (comment.replies || []).map(transformComment),
    mentions: comment.mentions || []
  });

  const transformedComments = comments.map(transformComment);
  // Filter top-level comments (no parent_id)
  const topLevelComments = transformedComments.filter(c => !c.parent_id && !c.parentId);
  
  // Build reply tree for each top-level comment
  const buildReplyTree = (parentId: string): CommunityComment[] => {
    return transformedComments
      .filter(c => (c.parent_id === parentId || c.parentId === parentId))
      .map(comment => ({
        ...comment,
        replies: buildReplyTree(comment.id)
      }));
  };
  
  const commentsWithReplies = topLevelComments.map(comment => ({
    ...comment,
    replies: buildReplyTree(comment.id)
  }));

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      if (confirm('Log in to post a comment?')) {
        window.location.href = '/auth/login';
      }
      return;
    }

    if (!newComment.trim()) return;

    setIsPosting(true);
    try {
      await CommunityService.postComment(threadId, newComment, user);
      showNotification('success', 'Posted', 'Comment posted successfully.');
      setNewComment('');
      onRefresh();
    } catch (error) {
      showNotification('error', 'Error', 'Failed to post comment.');
      console.error('Post comment error:', error);
    } finally {
      setIsPosting(false);
    }
  };

  const handlePostReply = async (parentId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      if (confirm('Log in to reply?')) {
        window.location.href = '/auth/login';
      }
      return;
    }

    if (!replyContent.trim()) return;

    setIsPosting(true);
    try {
      await CommunityService.postComment(threadId, replyContent, user, parentId);
      showNotification('success', 'Posted', 'Reply posted successfully.');
      setReplyContent('');
      setReplyingTo(null);
      setExpandedReplies(prev => new Set([...prev, parentId]));
      onRefresh();
    } catch (error) {
      showNotification('error', 'Error', 'Failed to post reply.');
      console.error('Post reply error:', error);
    } finally {
      setIsPosting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('Are you sure you want to delete this comment?')) return;
    
    try {
      await CommunityService.deleteComment(commentId);
      showNotification('success', 'Deleted', 'Comment deleted.');
      onRefresh();
    } catch (error) {
      showNotification('alert', 'Error', 'Failed to delete comment.');
    }
  };

  const renderComment = (comment: CommunityComment, depth: number = 0): React.ReactNode => {
    const replies = comment.replies || [];
    const canDelete = user && (user.id === (comment.user_id || comment.userId) || user.role === UserRole.ADMIN || user.role === UserRole.MODERATOR);

    return (
      <div key={comment.id} className={`${depth > 0 ? 'ml-8 mt-4 border-l-2 border-gray-200 pl-4' : ''}`}>
        <div className="bg-white rounded-lg p-4 border border-gray-200 hover:border-indigo-200 transition-colors">
          <div className="flex items-start gap-3">
            <EnterpriseAvatar
              src={comment.user_avatar}
              name={comment.user_name}
              size="md"
              className="border-2 border-white shadow-sm"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-gray-900 text-sm">{comment.user_name}</span>
                {comment.user_role === UserRole.ADMIN && (
                  <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">Admin</span>
                )}
                {comment.user_role === UserRole.MODERATOR && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">Mod</span>
                )}
                <span className="text-xs text-gray-400">
                  {new Date(comment.created_at).toLocaleDateString()}
                </span>
                {canDelete && (
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    className="ml-auto text-red-500 hover:text-red-700 p-1"
                    title="Delete comment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div 
                className="text-gray-700 text-sm mb-3 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: comment.content }}
              />
              
              <div className="flex items-center gap-4 text-sm">
                <button
                  onClick={() => {
                    if (!user) {
                      if (confirm('Log in to like?')) window.location.href = '/auth/login';
                      return;
                    }
                    const currentLiked = comment.is_liked || comment.isLiked || false;
                    CommunityService.toggleLike(comment.id, 'comment', currentLiked).then(() => {
                      onRefresh();
                    });
                  }}
                  className={`flex items-center gap-1 ${(comment.is_liked || comment.isLiked) ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                >
                  <Heart className={`w-4 h-4 ${(comment.is_liked || comment.isLiked) ? 'fill-current' : ''}`} />
                  <span>{comment.likes}</span>
                </button>
                
                {depth < 3 && (
                  <button
                    onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                    className="flex items-center gap-1 text-gray-500 hover:text-indigo-500"
                  >
                    <Reply className="w-4 h-4" />
                    Reply
                  </button>
                )}
              </div>

              {replyingTo === comment.id && (
                <form onSubmit={(e) => handlePostReply(comment.id, e)} className="mt-4">
                  <RichTextEditor
                    value={replyContent}
                    onChange={setReplyContent}
                    placeholder="Write a reply..."
                    height="150px"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="submit"
                      disabled={isPosting || !replyContent.trim()}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Post Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyContent('');
                      }}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-50 rounded-lg text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {replies.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => {
                      const newExpanded = new Set(expandedReplies);
                      if (newExpanded.has(comment.id)) {
                        newExpanded.delete(comment.id);
                      } else {
                        newExpanded.add(comment.id);
                      }
                      setExpandedReplies(newExpanded);
                    }}
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    {expandedReplies.has(comment.id) ? 'Hide' : 'Show'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                  </button>
                  {expandedReplies.has(comment.id) && (
                    <div className="mt-2">
                      {replies.map(reply => renderComment(reply, depth + 1))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-5 h-5 text-indigo-600" />
        <h2 className="text-xl font-bold text-gray-900">
          Comments ({transformedComments.length})
        </h2>
      </div>

      {/* Post Comment Form */}
      {user ? (
        <form onSubmit={handlePostComment} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <RichTextEditor
            value={newComment}
            onChange={setNewComment}
            placeholder="Write a comment..."
            height="200px"
          />
          <div className="flex justify-end mt-4">
            <button
              type="submit"
              disabled={isPosting || !newComment.trim()}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Post Comment
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <AlertCircle className="w-5 h-5 text-yellow-600 mx-auto mb-2" />
          <p className="text-sm text-yellow-800">
            <button
              onClick={() => window.location.href = '/auth/login'}
              className="text-indigo-600 hover:underline font-medium"
            >
              Log in
            </button>
            {' '}to post a comment
          </p>
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-4">
        {commentsWithReplies.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No comments yet. Be the first to comment!</p>
          </div>
        ) : (
          commentsWithReplies.map(comment => renderComment(comment))
        )}
      </div>
    </div>
  );
};

export default CommentSystem;
