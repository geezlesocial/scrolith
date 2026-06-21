
import React, { useState, useEffect, useRef } from 'react';
import { Search, X, TrendingUp, Sparkles, History, Briefcase, User, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SearchService } from '../services/search';
import { SearchSuggestion, UserRole } from '../types';
import { useUser } from '../context/UserContext';

interface SearchInputProps {
    placeholder?: string;
    className?: string;
    size?: 'normal' | 'large' | 'xl';
}

const SearchInput: React.FC<SearchInputProps> = ({ placeholder = "Search...", className = "", size = 'normal' }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const { user } = useUser();

    // Debounce Suggestions
    useEffect(() => {
        const fetchSuggestions = async () => {
            if (query.trim().length < 2) {
                setSuggestions([]);
                return;
            }
            setIsThinking(true);
            try {
                const results = await SearchService.getSuggestions(query, user?.role);
                setSuggestions(results);
            } catch (error) {
                console.error("Failed to fetch suggestions", error);
            } finally {
                setIsThinking(false);
            }
        };

        const timer = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timer);
    }, [query, user]);

    // Outside Click Handler
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSearch = (term: string) => {
        if (!term.trim()) return;
        
        // Save history if user is logged in
        if (user) {
            SearchService.saveSearchQuery(user.id, term);
        }

        setQuery(term);
        setIsOpen(false);
        navigate(`/search?q=${encodeURIComponent(term)}`);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch(query);
        }
    };

    const clearSearch = () => {
        setQuery('');
        setSuggestions([]);
        setIsOpen(false);
    };

    const sizeClasses = {
        normal: "py-3 text-sm rounded-full",
        large: "py-4 text-base rounded-2xl",
        xl: "py-5 text-lg rounded-2xl"
    };

    const iconSizes = {
        normal: "h-5 w-5",
        large: "h-6 w-6",
        xl: "h-7 w-7"
    };

    return (
        <div className={`relative w-full ${className}`} ref={containerRef}>
            <div className="relative group">
                <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none`}>
                    <Search className={`${iconSizes[size]} text-gray-400 group-focus-within:text-blue-500 transition-colors`} />
                </div>
                <input
                    type="text"
                    className={`block w-full pl-12 pr-12 border border-gray-200 leading-5 bg-white shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${sizeClasses[size]}`}
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                />
                {query && (
                    <button 
                        onClick={clearSearch}
                        className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                        <X className="h-5 w-5" />
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && (suggestions.length > 0 || query.length === 0) && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-fade-in-up text-left">
                    {/* Empty State / Popular (Simulated logic if empty query) */}
                    {query.length === 0 && (
                        <div className="p-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center">
                                <TrendingUp className="w-4 h-4 mr-2 text-blue-500" /> Popular Right Now
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {['Logo Design', 'Video Editing', 'SEO', 'WordPress'].map(term => (
                                    <button 
                                        key={term} 
                                        onClick={() => handleSearch(term)}
                                        className="px-4 py-2 bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-full text-sm font-medium transition-colors"
                                    >
                                        {term}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Suggestions List */}
                    {suggestions.length > 0 && (
                        <div className="py-2">
                            {isThinking && <div className="px-4 py-2 text-xs text-gray-400 flex items-center"><Sparkles className="w-3 h-3 mr-1 animate-pulse" /> AI is thinking...</div>}
                            
                            {suggestions.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => handleSearch(s.text)}
                                    className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center transition-colors group"
                                >
                                    {s.type === 'category' ? (
                                        <Briefcase className="w-4 h-4 text-gray-400 mr-3 group-hover:text-blue-500" />
                                    ) : s.type === 'history' ? (
                                        <History className="w-4 h-4 text-gray-400 mr-3" />
                                    ) : (
                                        <Search className="w-4 h-4 text-gray-400 mr-3" />
                                    )}
                                    
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600">
                                            {s.text}
                                        </span>
                                        {s.category && (
                                            <span className="text-xs text-gray-500">in {s.category}</span>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchInput;
