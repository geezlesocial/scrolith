
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader, AlertCircle } from 'lucide-react';
import { StaticPage as StaticPageType } from '../types';
import { CMSService } from '../services/cms';

const StaticPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<StaticPageType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPage = async () => {
      if (!slug) return;
      setLoading(true);
      try {
        const data = await CMSService.getPageBySlug(slug);
        setPage(data || null);
      } catch (error) {
        console.error("Failed to load page", error);
      } finally {
        setLoading(false);
      }
    };
    loadPage();
  }, [slug]);

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
