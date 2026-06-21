
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Calendar, User, ChevronLeft, Loader } from 'lucide-react';
import { BlogPost as BlogPostType } from '../types';
import { CMSService } from '../services/cms';

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPostType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPost = async () => {
      if (!slug) return;
      try {
        const data = await CMSService.getBlogPostBySlug(slug);
        setPost(data || null);
      } catch (error) {
        console.error("Failed to load post", error);
      } finally {
        setLoading(false);
      }
    };
    loadPost();
  }, [slug]);

  return (
    <>
      {loading ? (
        <div className="min-h-screen flex items-center justify-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : !post ? (
        <div className="min-h-screen flex flex-col items-center justify-center px-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Post not found</h2>
          <Link to="/blog" className="text-blue-600 hover:underline">Return to Blog</Link>
        </div>
      ) : (
        <article className="min-h-screen bg-white pt-20 pb-12">
          <div className="w-full h-80 sm:h-96 relative mb-8 sm:mb-12">
            <img 
              src={post.featuredImage} 
              alt={post.title} 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="max-w-4xl mx-auto px-4 text-center text-white">
                <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-blue-600 mb-4">
                    {post.categoryName || 'Article'}
                </span>
                <h1 className="text-3xl sm:text-5xl font-bold leading-tight mb-4">
                  {post.title}
                </h1>
                <div className="flex items-center justify-center space-x-6 text-sm sm:text-base text-gray-200">
                    <div className="flex items-center">
                      <User className="w-5 h-5 mr-2" />
                      {post.authorName}
                    </div>
                    <div className="flex items-center">
                      <Calendar className="w-5 h-5 mr-2" />
                      {new Date(post.createdAt).toLocaleDateString()}
                    </div>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-3xl mx-auto px-4 sm:px-6">
            <Link to="/blog" className="inline-flex items-center text-gray-500 hover:text-blue-600 mb-8 transition-colors">
              <ChevronLeft className="w-5 h-5 mr-1" />
              Back to Blog
            </Link>
            
            <div className="prose prose-lg max-w-none text-gray-700">
              {/* In a real app, render safe HTML or Markdown here */}
              <p className="lead text-xl text-gray-500 mb-8 font-light">
                {post.excerpt}
              </p>
              <div className="whitespace-pre-line">
                {post.content}
              </div>
            </div>
          </div>
        </article>
      )}
    </>
  );
};

export default BlogPost;
