
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BriefcaseIcon as Briefcase,
  HistoryIcon as History,
  SearchIcon as Search,
  SparklesIcon as Sparkles,
  XIcon as X
} from './icons/ShellIcons';
import { useNavigate } from 'react-router-dom';
import { SearchService } from '../services/search';
import { SearchSuggestion } from '../types';
import { useUser } from '../context/UserContext';

interface SearchInputProps {
    placeholder?: string;
    className?: string;
    size?: 'normal' | 'large' | 'xl';
    showButton?: boolean;
    buttonLabel?: string;
    buttonAriaLabel?: string;
    searchMode?: 'keyword' | 'semantic';
    searchPath?: string;
    initialQuery?: string;
    onSearch?: (term: string) => void;
}

const DEFAULT_SEARCH_RECOMMENDATIONS: SearchSuggestion[] = [
    { text: 'interview tips', type: 'keyword', category: 'Careers' },
    { text: 'latest in ai', type: 'keyword', category: 'Trends' },
    { text: 'balancing work and personal life', type: 'keyword', category: 'Work life' },
    { text: 'remote work', type: 'keyword', category: 'Jobs' },
    { text: "when's the best time to switch jobs", type: 'keyword', category: 'Careers' }
];

const normalizeSuggestionText = (value: any) =>
    String(value?.text || value?.keyword || value?.title || value?.name || value?.query || '').trim();

const SearchInput: React.FC<SearchInputProps> = ({
    placeholder = "",
    className = "",
    size = 'normal',
    showButton = false,
    buttonLabel = "",
    buttonAriaLabel = "",
    searchMode = "keyword",
    searchPath,
    initialQuery = "",
    onSearch
}) => {
    const [query, setQuery] = useState(initialQuery);
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
    const [recommendedSuggestions, setRecommendedSuggestions] = useState<SearchSuggestion[]>(DEFAULT_SEARCH_RECOMMENDATIONS);
    const [isOpen, setIsOpen] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
    const [suggestionsResolvedFor, setSuggestionsResolvedFor] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const suggestionRequestSeqRef = useRef(0);
    const navigate = useNavigate();
    const { user } = useUser();

    useEffect(() => {
        setQuery(initialQuery);
    }, [initialQuery]);

    const loadRecommendations = useCallback(async () => {
        if (recommendationsLoaded) return;
        setRecommendationsLoaded(true);
        try {
            const [trending, personalized] = await Promise.all([
                SearchService.getTrendingSearches(6).catch(() => []),
                user?.id ? SearchService.getRecommendations(user.id).catch(() => []) : Promise.resolve([])
            ]);

            const rows: SearchSuggestion[] = [];
            (Array.isArray(personalized) ? personalized : []).forEach((item: any) => {
                const text = normalizeSuggestionText(item);
                if (!text) return;
                rows.push({
                    text,
                    type: 'result',
                    category: item?.type ? String(item.type).replace(/s$/, '') : 'Recommended',
                    url: item?.url,
                    description: item?.snippet || item?.description
                });
            });
            (Array.isArray(trending) ? trending : []).forEach((item: any) => {
                const text = normalizeSuggestionText(item);
                if (!text) return;
                rows.push({
                    text,
                    type: 'keyword',
                    category: 'Trending',
                    description: Number(item?.count) ? `${Number(item.count).toLocaleString()} searches` : undefined
                });
            });

            const deduped = Array.from(
                new Map([...rows, ...DEFAULT_SEARCH_RECOMMENDATIONS].map((item) => [item.text.toLowerCase(), item])).values()
            ).slice(0, 8);
            setRecommendedSuggestions(deduped.length ? deduped : DEFAULT_SEARCH_RECOMMENDATIONS);
        } catch {
            setRecommendedSuggestions(DEFAULT_SEARCH_RECOMMENDATIONS);
        }
    }, [recommendationsLoaded, user?.id]);

    // Debounce Suggestions
    useEffect(() => {
        const clean = query.trim();
        const requestSeq = ++suggestionRequestSeqRef.current;

        const fetchSuggestions = async () => {
            if (clean.length < 2) {
                setSuggestions([]);
                setSuggestionsResolvedFor('');
                setIsThinking(false);
                if (isOpen) {
                    loadRecommendations();
                }
                return;
            }
            setIsThinking(true);
            try {
                const results = await SearchService.getSuggestions(clean, user?.role);
                if (suggestionRequestSeqRef.current !== requestSeq) return;
                setSuggestions(Array.isArray(results) ? results : []);
                setSuggestionsResolvedFor(clean);
            } catch (error) {
                if (suggestionRequestSeqRef.current !== requestSeq) return;
                console.error("Failed to fetch suggestions", error);
                setSuggestions([]);
                setSuggestionsResolvedFor(clean);
            } finally {
                if (suggestionRequestSeqRef.current === requestSeq) {
                    setIsThinking(false);
                }
            }
        };

        const timer = setTimeout(fetchSuggestions, 300);
        return () => clearTimeout(timer);
    }, [isOpen, loadRecommendations, query, user?.role]);

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
        const cleanTerm = term.trim();
        
        // Save history if user is logged in
        if (user && user.id) {
            SearchService.saveSearchQuery(user.id, cleanTerm).catch(err => {
                console.warn('Failed to save search query:', err);
            });
        }

        setQuery(cleanTerm);
        setIsOpen(false);
        if (onSearch) onSearch(cleanTerm);

        const basePath = searchPath && searchPath.trim() ? searchPath.trim() : "/search";
        const isExternal = basePath.startsWith("http");
        const url = isExternal ? new URL(basePath) : new URL(basePath, window.location.origin);
        url.searchParams.set('q', cleanTerm);
        if (searchMode === "semantic") {
            url.searchParams.set('mode', 'semantic');
        }
        if (isExternal) {
            window.location.href = url.toString();
            return;
        }
        navigate(`${url.pathname}${url.search}`);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch(query);
        }
    };

    const clearSearch = () => {
        setQuery('');
        setSuggestions([]);
        setIsOpen(true);
        loadRecommendations();
    };

    const handleFocus = () => {
        setIsOpen(true);
        loadRecommendations();
    };

    const sizeClasses = {
        normal: "py-3 text-sm rounded-full",
        large: "py-5 text-base rounded-2xl",
        xl: "py-6 text-lg rounded-2xl"
    };

    const iconSizes = {
        normal: "h-5 w-5",
        large: "h-7 w-7",
        xl: "h-8 w-8"
    };

    const inputPaddingLeft = {
        normal: "pl-12",
        large: "pl-14",
        xl: "pl-16"
    };

    const inputPaddingRight = {
        normal: "pr-28",
        large: "pr-32",
        xl: "pr-36"
    };

    const buttonSizing = {
        normal: "text-sm px-4",
        large: "text-base px-5",
        xl: "text-base px-6"
    };

    const buttonInset = {
        normal: "my-2",
        large: "my-2.5",
        xl: "my-3"
    };

    const effectiveAriaLabel = buttonAriaLabel || buttonLabel || placeholder || '';
    const cleanQuery = query.trim();
    const activeSuggestions = useMemo(() => {
        const source =
            cleanQuery.length >= 2
                ? (suggestionsResolvedFor === cleanQuery || isThinking ? suggestions : [])
                : recommendedSuggestions;
        const deduped = new Map<string, SearchSuggestion>();
        source.forEach((item: any) => {
            const text = normalizeSuggestionText(item);
            if (!text) return;
            deduped.set(text.toLowerCase(), {
                ...item,
                text,
                type: item?.type || 'keyword',
                category: item?.category || item?.type || 'Suggested'
            });
        });
        return Array.from(deduped.values()).slice(0, cleanQuery.length >= 2 ? 8 : 6);
    }, [cleanQuery, isThinking, recommendedSuggestions, suggestions, suggestionsResolvedFor]);
    const showEmptySearchState =
        isOpen &&
        cleanQuery.length >= 2 &&
        !isThinking &&
        suggestionsResolvedFor === cleanQuery &&
        activeSuggestions.length === 0;
    const shouldShowDropdown =
        isOpen &&
        (cleanQuery.length >= 2 || isThinking || activeSuggestions.length > 0 || recommendedSuggestions.length > 0);
    const dropdownTitle = cleanQuery.length >= 2 ? 'Scrolith suggestions' : 'Try searching for';

    return (
        <div className={`relative w-full ${className}`} ref={containerRef}>
            <div className="relative group flex items-center">
                <div className={`absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none`}>
                    <Search className={`${iconSizes[size]} text-gray-400 group-focus-within:text-blue-500 transition-colors`} />
                </div>
                <input
                    type="text"
                    className={`block w-full ${inputPaddingLeft[size]} ${showButton ? inputPaddingRight[size] : 'pr-12'} border border-gray-300 leading-5 bg-white shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900/80 focus:border-slate-900 transition-colors duration-150 ${sizeClasses[size]}`}
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                />
                {!showButton && query && (
                    <button 
                        onClick={clearSearch}
                        className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                        aria-label={effectiveAriaLabel}
                    >
                        <X className="h-5 w-5" />
                    </button>
                )}
                {showButton && (
                    <button
                        onClick={() => handleSearch(query)}
                        className={`absolute right-2 inset-y-0 ${buttonInset[size]} ${buttonSizing[size]} rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition`}
                        aria-label={effectiveAriaLabel}
                    >
                        {buttonLabel ? buttonLabel : <Search className="h-4 w-4" />}
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {shouldShowDropdown && (
                <div
                    className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(26rem,calc(100dvh-8rem))] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white text-left shadow-2xl animate-fade-in"
                    style={{ contain: 'layout paint', scrollbarGutter: 'stable' }}
                >
                    <div className="border-b border-gray-100 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-gray-950">{dropdownTitle}</p>
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                <Sparkles className="h-3 w-3" />
                                Scrolith
                            </span>
                        </div>
                        {cleanQuery.length >= 2 ? (
                            <p className="mt-1 text-xs text-gray-500">Real-time matches across posts, people, pages, jobs, and gigs.</p>
                        ) : null}
                    </div>
                    <div className="py-2">
                        {isThinking && (
                            <div className="flex items-center px-4 py-2 text-xs text-gray-500">
                                <Sparkles className="mr-2 h-3.5 w-3.5 animate-pulse" />
                                Scrolith is finding the best matches...
                            </div>
                        )}

                        {showEmptySearchState && (
                            <div className="px-4 py-5 text-sm text-gray-500">
                                <p className="font-semibold text-gray-800">No exact matches yet.</p>
                                <p className="mt-1 text-xs">
                                    Press Enter to search all of Scrolith for "{cleanQuery}".
                                </p>
                            </div>
                        )}

                        {activeSuggestions.map((s, i) => {
                            const Icon = s.type === 'category' || s.type === 'result' ? Briefcase : s.type === 'history' ? History : Search;
                            return (
                                <button
                                    key={`${s.text}-${i}`}
                                    onClick={() => handleSearch(s.text)}
                                    className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                                >
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 group-hover:bg-slate-900 group-hover:text-white">
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-gray-950">
                                            {s.text}
                                        </span>
                                        {(s.description || s.category) && (
                                            <span className="block truncate text-xs text-gray-500">
                                                {s.description || `in ${s.category}`}
                                            </span>
                                        )}
                                    </span>
                                    <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:inline-flex">
                                        {s.category || s.type}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchInput;
