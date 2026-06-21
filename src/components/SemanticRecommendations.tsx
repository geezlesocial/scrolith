
import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCurrency } from '../context/CurrencyContext';

interface SemanticRecommendationsProps {
    userId: string;
}

const SemanticRecommendations: React.FC<SemanticRecommendationsProps> = ({ userId }) => {
  const [recommendedGigs, setRecommendedGigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { formatPrice } = useCurrency();

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const response = await fetch(`/api/semantic-search/recommendations/${userId}`);
        if (response.ok) {
            const data = await response.json();
            setRecommendedGigs(data);
        }
      } catch (error) {
        console.error("Failed to fetch recommendations", error);
      } finally {
        setLoading(false);
      }
    };
    if (userId) {
        fetchRecommendations();
    }
  }, [userId]);

  return (
    <>
      {loading ? (
          <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
          </div>
      ) : recommendedGigs.length === 0 ? null : (
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-2xl p-8 my-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
          <div className="absolute -bottom-8 -left-8 p-32 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
          
          <div className="relative z-10">
            <div className="flex items-center mb-6">
                <div className="p-2 bg-white/10 rounded-lg mr-3 backdrop-blur-sm">
                    <Sparkles className="w-5 h-5 text-yellow-300" />
                </div>
                <h2 className="text-2xl font-bold">Curated For You</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {recommendedGigs.map((rec) => (
                <Link key={rec.id} to={`/gigs/${rec.gigId}`} className="group bg-white/5 border border-white/10 rounded-xl overflow-hidden hover:bg-white/10 transition-all duration-300 hover:-translate-y-1">
                  <div className="relative h-40 bg-gray-700">
                      {rec.gig?.image ? (
                          <img src={rec.gig.image} alt={rec.gig.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20">No Image</div>
                      )}
                      <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-bold text-white border border-white/10">
                          {rec.score ? (rec.score * 100).toFixed(0) : 95}% Match
                      </div>
                  </div>
                  <div className="p-4">
                      <h3 className="font-semibold text-sm line-clamp-2 mb-2 group-hover:text-purple-300 transition-colors">{rec.gig?.title || 'Unknown Gig'}</h3>
                      <p className="text-xs text-gray-400 line-clamp-2 mb-3">{rec.gig?.description}</p>
                      <div className="flex justify-between items-center pt-3 border-t border-white/10">
                          <span className="text-xs text-gray-400">Starting at</span>
                          <span className="font-bold text-white">{rec.gig?.price ? formatPrice(rec.gig.price) : '-'}</span>
                      </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SemanticRecommendations;
