
import React, { useState } from 'react';
import { Search, Loader2, Star, Sparkles } from 'lucide-react';
import { useCurrency } from '../context/CurrencyContext';

interface SemanticSearchBarProps {
  userId?: string;
  className?: string;
}

const SemanticSearchBar: React.FC<SemanticSearchBarProps> = ({ userId, className = "" }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const { formatPrice } = useCurrency();

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    setResults([]);

    try {
        // Save search query if user is logged in
        if (userId) {
            await fetch('/api/semantic-search/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, query })
            });
        }

        // Perform semantic search
        const response = await fetch(`/api/semantic-search/search?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (Array.isArray(data)) {
            setResults(data);
        }
    } catch (error) {
        console.error("Semantic search failed", error);
    } finally {
        setIsSearching(false);
    }
  };

  return (
    <div className={`w-full max-w-2xl mx-auto ${className}`}>
      <div className="relative group">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Sparkles className="h-5 w-5 text-indigo-500" />
        </div>
        <input
            type="text"
            className="block w-full pl-12 pr-24 py-4 border-2 border-indigo-100 rounded-full leading-5 bg-white shadow-sm placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all duration-200 text-base"
            placeholder="Describe what you're looking for..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <div className="absolute inset-y-0 right-2 flex items-center">
            <button 
                onClick={() => handleSearch()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-full transition-colors flex items-center justify-center w-10 h-10"
                disabled={isSearching}
            >
                {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            </button>
        </div>
      </div>

      {/* Results Dropdown */}
      {(hasSearched || isSearching) && (
          <div className="mt-4 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden animate-fade-in-up">
              {isSearching ? (
                  <div className="p-8 text-center text-gray-500">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-indigo-500" />
                      <p>AI is analyzing your request...</p>
                  </div>
              ) : results.length > 0 ? (
                  <div className="max-h-96 overflow-y-auto p-2 space-y-2">
                      <div className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                          AI Matched Results
                      </div>
                      {results.map((gig) => (
                          <div key={gig.id} className="flex items-start p-3 hover:bg-gray-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-indigo-100">
                              <img src={gig.image || "https://via.placeholder.com/60"} alt={gig.title} className="w-16 h-16 rounded-md object-cover mr-4 bg-gray-200" />
                              <div className="flex-1">
                                  <h4 className="font-bold text-gray-900 text-sm line-clamp-1">{gig.title}</h4>
                                  <p className="text-xs text-gray-500 line-clamp-2 mt-1">{gig.description}</p>
                                  <div className="flex justify-between items-center mt-2">
                                      <div className="flex items-center text-xs text-yellow-500 font-medium">
                                          <Star className="w-3 h-3 fill-current mr-1" />
                                          {gig.score ? `${(gig.score * 100).toFixed(0)}% Match` : 'Recommended'}
                                      </div>
                                      <span className="font-bold text-gray-900 text-sm">{formatPrice(gig.price)}</span>
                                  </div>
                              </div>
                          </div>
                      ))}
                  </div>
              ) : (
                  <div className="p-8 text-center text-gray-500">
                      <p>No relevant gigs found matching your description.</p>
                  </div>
              )}
          </div>
      )}
    </div>
  );
};

export default SemanticSearchBar;
