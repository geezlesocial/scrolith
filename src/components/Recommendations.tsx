
import React, { useEffect, useState } from 'react';
import { SearchService } from '../services/search';
import { RecommendedItem } from '../types';
import { Sparkles } from 'lucide-react';
import GigCard from './GigCard';
import { Link } from 'react-router-dom';

const Recommendations = ({ userId }: { userId: string }) => {
  const [recommendations, setRecommendations] = useState<RecommendedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecs = async () => {
      try {
        const data = await SearchService.getRecommendations(userId);
        setRecommendations(data);
      } catch (error) {
        console.error("Failed to fetch recommendations", error);
      } finally {
        setLoading(false);
      }
    };
    if (userId) fetchRecs();
  }, [userId]);

  if (loading || recommendations.length === 0) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center mb-6">
            <Sparkles className="w-6 h-6 text-purple-600 mr-2" />
            <h2 className="text-2xl font-bold text-gray-900">Recommended For You</h2>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {recommendations.map((rec) => (
             rec.type === 'gig' ? (
                <div key={rec.id} className="relative group">
                    <GigCard gig={rec.meta} />
                    <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm">
                        {Math.round(rec.score)}% Match
                    </div>
                </div>
             ) : (
                <Link key={rec.id} to={`/jobs/${rec.id}`} className="block bg-white p-6 rounded-xl shadow-sm hover:shadow-md transition-all border border-gray-100 flex flex-col h-full relative group">
                    <div className="absolute top-2 right-2 bg-purple-100 text-purple-700 text-[10px] px-2 py-1 rounded-full font-bold">
                        {Math.round(rec.score)}% Match
                    </div>
                    <h3 className="font-bold text-gray-900 mb-2 line-clamp-2">{rec.title}</h3>
                    <p className="text-sm text-gray-500 mb-4 line-clamp-3 flex-1">{rec.description}</p>
                    <div className="mt-auto flex justify-between items-center text-xs font-medium text-gray-600">
                        <span className="bg-gray-100 px-2 py-1 rounded">{rec.meta.type}</span>
                        <span>{rec.meta.budget}</span>
                    </div>
                </Link>
             )
          ))}
        </div>
      </div>
    </div>
  );
};

export default Recommendations;
