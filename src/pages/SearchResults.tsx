
import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { SearchService } from '../services/search';
import { SearchResult } from '../types';
import { Loader, Filter, Briefcase, User, FileText, Star, Clock, Search } from 'lucide-react';
import SearchInput from '../components/SearchInput';
import { useCurrency } from '../context/CurrencyContext';

const SearchResults = () => {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'gig' | 'job' | 'blog'>('all');
    const { formatPrice } = useCurrency();

    useEffect(() => {
        const fetchResults = async () => {
            setLoading(true);
            try {
                const { results } = await SearchService.performSearch(query);
                setResults(results);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchResults();
    }, [query]);

    const filteredResults = filter === 'all' ? results : results.filter(r => r.type === filter);

    return (
        <div className="min-h-screen bg-gray-50 pt-20 pb-12">
            <div className="bg-white border-b border-gray-200 mb-8">
                <div className="max-w-7xl mx-auto px-4 py-8">
                    <SearchInput placeholder="Search for anything..." className="max-w-3xl" />
                    <div className="mt-6 flex space-x-4 overflow-x-auto pb-2">
                        {['all', 'gig', 'job', 'blog'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f as any)}
                                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                                    filter === f 
                                    ? 'bg-blue-600 text-white shadow-md' 
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                {f === 'all' ? 'All Results' : f === 'gig' ? 'Services' : f === 'job' ? 'Jobs' : 'Articles'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <h2 className="text-xl font-bold text-gray-900 mb-6">
                    {loading ? 'Searching...' : `${filteredResults.length} results for "${query}"`}
                </h2>

                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader className="w-10 h-10 text-blue-600 animate-spin" />
                    </div>
                ) : filteredResults.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredResults.map(item => (
                            <Link 
                                key={item.id} 
                                to={item.url}
                                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col"
                            >
                                {item.image && (
                                    <div className="h-48 w-full bg-gray-100 relative">
                                        <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                                        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold uppercase tracking-wide">
                                            {item.type}
                                        </div>
                                    </div>
                                )}
                                <div className="p-5 flex-1 flex flex-col">
                                    {!item.image && (
                                        <div className="flex items-center mb-2">
                                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                                item.type === 'job' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                            }`}>
                                                {item.type}
                                            </span>
                                        </div>
                                    )}
                                    <h3 className="font-bold text-gray-900 text-lg mb-2 line-clamp-2">{item.title}</h3>
                                    <p className="text-gray-600 text-sm line-clamp-3 mb-4 flex-1">{item.description}</p>
                                    
                                    <div className="border-t border-gray-100 pt-4 mt-auto flex justify-between items-center text-sm">
                                        {item.type === 'gig' && (
                                            <>
                                                <div className="flex items-center text-yellow-500 font-medium">
                                                    <Star className="w-4 h-4 mr-1 fill-current" /> {item.meta?.rating || 'New'}
                                                </div>
                                                <div className="font-bold text-gray-900">{formatPrice(Number(item.meta?.price))}</div>
                                            </>
                                        )}
                                        {item.type === 'job' && (
                                            <>
                                                <div className="flex items-center text-gray-500">
                                                    <Clock className="w-4 h-4 mr-1" /> {item.meta?.date}
                                                </div>
                                                <div className="font-medium text-purple-600">{item.meta?.author}</div>
                                            </>
                                        )}
                                        {item.type === 'blog' && (
                                            <div className="flex items-center text-gray-500">
                                                <User className="w-4 h-4 mr-2" /> {item.meta?.author}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Search className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">No results found</h3>
                        <p className="text-gray-500 mt-2">Try adjusting your search or filter to find what you're looking for.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SearchResults;
