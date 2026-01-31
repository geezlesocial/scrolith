
import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader, AlertCircle } from 'lucide-react';
import { StaticPage as StaticPageType } from '../types';
import { CMSService } from '../services/cms';
import { useSocket } from '../context/SocketContext';

const StaticPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<StaticPageType | null>(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();
  const slugRef = useRef<string | undefined>(slug);

  useEffect(() => {
    slugRef.current = slug;
  }, [slug]);

  const loadPage = async () => {
    if (!slugRef.current) return;
    setLoading(true);
    try {
      const data = await CMSService.getPageBySlug(slugRef.current);
      setPage(data || null);
    } catch (error) {
      console.error("Failed to load page", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!socket) return;
    const handlePageUpdate = (payload: any) => {
      const updatedSlug = payload?.slug || payload?.data?.slug;
      if (!updatedSlug || updatedSlug === slugRef.current) {
        loadPage();
      }
    };
    const handlePagesUpdate = () => loadPage();
    const handlePageDelete = (payload: any) => {
      const deletedId = payload?.id || payload?.data?.id;
      if (page?.id && deletedId && deletedId === page.id) {
        setPage(null);
      } else {
        loadPage();
      }
    };

    socket.on('cms:page_updated', handlePageUpdate);
    socket.on('cms:pages_updated', handlePagesUpdate);
    socket.on('cms:page_deleted', handlePageDelete);
    return () => {
      socket.off('cms:page_updated', handlePageUpdate);
      socket.off('cms:pages_updated', handlePagesUpdate);
      socket.off('cms:page_deleted', handlePageDelete);
    };
  }, [socket, page?.id]);

  useEffect(() => {
    if (socket) return;
    const id = window.setInterval(() => {
      loadPage();
    }, 60000);
    return () => window.clearInterval(id);
  }, [socket]);

  return (
    <>
      {loading ? (
        <div className="min-h-screen flex items-center justify-center">
          <Loader className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : !page ? (
        <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-50">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Page Not Found</h2>
            <p className="text-gray-600 mb-6">The page you are looking for doesn't exist or has been moved.</p>
            <Link to="/" className="inline-flex items-center justify-center px-5 py-2 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
              Go Home
            </Link>
          </div>
        </div>
      ) : (
        <div className="min-h-screen bg-white pt-24 pb-16">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-8 border-b pb-4">
              {page.title}
            </h1>
            
            {/* Render HTML content safely - caution: only use with trusted sources */}
            <div 
              className="prose prose-lg max-w-none text-gray-700"
              dangerouslySetInnerHTML={{ __html: page.content }} 
            />
            
            <div className="mt-12 pt-6 border-t text-sm text-gray-500">
              Last updated: {new Date(page.updatedAt).toLocaleDateString()}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StaticPage;
