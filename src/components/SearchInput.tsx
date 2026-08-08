
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
import {
    GLOBAL_SEARCH_GROUP_BADGES,
    GLOBAL_SEARCH_GROUP_LABELS,
    GLOBAL_SEARCH_GROUP_ORDER,
    normalizeGlobalSearchType,
    searchGlobalWithMarketplace
} from '../services/globalSearch';
import { SearchSuggestion } from '../types';
import { useUser } from '../context/UserContext';
import { CompassIcon as Compass, ShoppingCartIcon as ShoppingCart, UserIcon as User, UsersIcon as Users } from './icons/ShellIcons';
import { resolveUserAvatarUrl } from '../utils/userAvatar';
import { resolvePostAttachmentMediaUrl } from '../utils/postAttachmentMedia';
import { resolveAssetUrl } from '../utils/assetUrl';

interface SearchInputProps {
    placeholder?: string;
    className?: string;
    size?: 'normal' | 'large' | 'xl' | 'header';
    showButton?: boolean;
    buttonLabel?: string;
    buttonAriaLabel?: string;
    searchMode?: 'keyword' | 'semantic';
    searchPath?: string;
    initialQuery?: string;
    onSearch?: (term: string) => void;
    disableNavigation?: boolean;
}

const DEFAULT_HEADER_PLACEHOLDER =
    'Search people, jobs, gigs, posts, pages, communities, or marketplace';

const DEFAULT_SEARCH_RECOMMENDATIONS: SearchSuggestion[] = [
    { text: 'interview tips', type: 'keyword', category: 'Careers' },
    { text: 'latest in ai', type: 'keyword', category: 'Trends' },
    { text: 'balancing work and personal life', type: 'keyword', category: 'Work life' },
    { text: 'remote work', type: 'keyword', category: 'Jobs' },
    { text: "when's the best time to switch jobs", type: 'keyword', category: 'Careers' }
];

const normalizeSuggestionText = (value: any) =>
    String(value?.text || value?.keyword || value?.title || value?.name || value?.query || '').trim();

type SearchSuggestionVisualType =
    | 'people'
    | 'pages'
    | 'jobs'
    | 'gigs'
    | 'marketplace'
    | 'posts'
    | 'history'
    | 'keyword';

const normalizeSuggestionVisualType = (suggestion: SearchSuggestion): SearchSuggestionVisualType => {
    const normalizedGroup = normalizeGlobalSearchType((suggestion as any)?.group || suggestion.category || suggestion.type);
    if (normalizedGroup) return normalizedGroup;

    const category = String(suggestion.category || '').trim().toLowerCase();
    if (category === 'user' || category === 'users' || category === 'people' || category === 'person') return 'people';
    if (category === 'page' || category === 'pages' || category === 'company') return 'pages';
    if (category === 'job' || category === 'jobs') return 'jobs';
    if (category === 'gig' || category === 'gigs') return 'gigs';
    if (category === 'item' || category === 'product' || category === 'marketplace') return 'marketplace';
    if (category === 'post' || category === 'posts') return 'posts';
    if (suggestion.type === 'history') return 'history';
    return 'keyword';
};

const resolveSuggestionImage = (suggestion: SearchSuggestion) => {
    const meta = (suggestion as any)?.meta || {};
    const fileId = String(
        meta.profilePhotoFileId ||
          meta.profile_photo_file_id ||
          meta.avatarFileId ||
          meta.logoFileId ||
          (suggestion as any)?.profilePhotoFileId ||
          (suggestion as any)?.profile_photo_file_id ||
          ''
    ).trim();
    const fromFile =
        (fileId
            ? resolvePostAttachmentMediaUrl({ fileId }) ||
              resolveUserAvatarUrl({ profilePhotoFileId: fileId })
            : '') || '';
    const raw = String(
        suggestion.avatarUrl ||
          suggestion.image ||
          suggestion.thumbnailUrl ||
          (suggestion as any)?.avatar ||
          (suggestion as any)?.thumbnail ||
          ''
    ).trim();
    const resolved =
        fromFile ||
        resolveUserAvatarUrl({
            avatarUrl: raw,
            avatar: raw,
            profilePhotoFileId: fileId || undefined,
            ...meta
        }) ||
        resolvePostAttachmentMediaUrl({ url: raw, fileId }) ||
        resolveAssetUrl(raw) ||
        raw;
    return resolved || null;
};

const suggestionVisualConfig: Record<SearchSuggestionVisualType, { icon: React.ComponentType<{ className?: string }>; shell: string; badge: string; shape: string }> = {
    people: {
        icon: Users,
        shell: 'bg-[linear-gradient(135deg,#dbeafe_0%,#eff6ff_100%)] text-blue-700',
        badge: 'bg-white/80 text-blue-700',
        shape: 'rounded-full'
    },
    pages: {
        icon: Compass,
        shell: 'bg-[linear-gradient(135deg,#ede9fe_0%,#f5f3ff_100%)] text-violet-700',
        badge: 'bg-white/80 text-violet-700',
        shape: 'rounded-2xl'
    },
    jobs: {
        icon: Briefcase,
        shell: 'bg-[linear-gradient(135deg,#dcfce7_0%,#f0fdf4_100%)] text-emerald-700',
        badge: 'bg-white/80 text-emerald-700',
        shape: 'rounded-2xl'
    },
    gigs: {
        icon: Sparkles,
        shell: 'bg-[linear-gradient(135deg,#fef3c7_0%,#fff7ed_100%)] text-amber-700',
        badge: 'bg-white/80 text-amber-700',
        shape: 'rounded-2xl'
    },
    marketplace: {
        icon: ShoppingCart,
        shell: 'bg-[linear-gradient(135deg,#dbeafe_0%,#e0f2fe_100%)] text-cyan-700',
        badge: 'bg-white/80 text-cyan-700',
        shape: 'rounded-2xl'
    },
    posts: {
        icon: Search,
        shell: 'bg-[linear-gradient(135deg,#e2e8f0_0%,#f8fafc_100%)] text-slate-700',
        badge: 'bg-white/80 text-slate-700',
        shape: 'rounded-2xl'
    },
    history: {
        icon: History,
        shell: 'bg-[linear-gradient(135deg,#f1f5f9_0%,#ffffff_100%)] text-slate-600',
        badge: 'bg-white/80 text-slate-600',
        shape: 'rounded-2xl'
    },
    keyword: {
        icon: User,
        shell: 'bg-[linear-gradient(135deg,#f8fafc_0%,#ffffff_100%)] text-slate-600',
        badge: 'bg-white/80 text-slate-600',
        shape: 'rounded-2xl'
    }
};

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
    onSearch,
    disableNavigation = false
}) => {
    const resolvedPlaceholder =
        placeholder ||
        (size === 'header' ? DEFAULT_HEADER_PLACEHOLDER : '');
    const [query, setQuery] = useState(initialQuery);
    const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
    const [recommendedSuggestions, setRecommendedSuggestions] = useState<SearchSuggestion[]>(DEFAULT_SEARCH_RECOMMENDATIONS);
    const [isOpen, setIsOpen] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
    const [suggestionsResolvedFor, setSuggestionsResolvedFor] = useState('');
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const suggestionRequestSeqRef = useRef(0);
    const listboxId = 'scrolith-search-listbox';
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
                const [results, globalResults] = await Promise.all([
                    SearchService.getSuggestions(clean, user?.role).catch(() => []),
                    searchGlobalWithMarketplace(clean, { maxResults: 8 }).catch(() => null)
                ]);
                if (suggestionRequestSeqRef.current !== requestSeq) return;
                const liveRows: SearchSuggestion[] = [];
                if (globalResults?.groups) {
                    GLOBAL_SEARCH_GROUP_ORDER.forEach((key) => {
                        (globalResults.groups[key] || []).slice(0, key === 'marketplace' ? 4 : 2).forEach((item: any) => {
                            const text = String(item?.title || item?.name || item?.username || '').trim();
                            if (!text) return;
                            liveRows.push({
                                text,
                                type: 'result',
                                group: key,
                                category: GLOBAL_SEARCH_GROUP_BADGES[key] || GLOBAL_SEARCH_GROUP_LABELS[key],
                                url: item.url,
                                title: item?.title || item?.name,
                                username: item?.username,
                                image: item?.image || item?.avatarUrl || null,
                                avatarUrl: item?.avatarUrl || item?.image || null,
                                thumbnailUrl: item?.thumbnailUrl || item?.image || item?.avatarUrl || null,
                                meta: item?.meta || undefined,
                                profilePhotoFileId:
                                    item?.meta?.profilePhotoFileId ||
                                    item?.profilePhotoFileId ||
                                    item?.profile_photo_file_id ||
                                    undefined,
                                description:
                                    item.subtitle ||
                                    item.description ||
                                    item.excerpt ||
                                    (item.username ? `@${item.username}` : GLOBAL_SEARCH_GROUP_LABELS[key])
                            } as SearchSuggestion);
                        });
                    });
                }
                setSuggestions([...(Array.isArray(results) ? results : []), ...liveRows]);
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
                setHighlightIndex(-1);
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
        if (disableNavigation) return;

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

    const selectSuggestion = (s: SearchSuggestion) => {
        const url = String((s as any).url || '').trim();
        if (url) {
            setQuery(s.text);
            setIsOpen(false);
            setHighlightIndex(-1);
            if (url.startsWith('http')) {
                window.location.href = url;
            } else {
                navigate(url);
            }
            return;
        }
        handleSearch(s.text);
    };

    const clearSearch = () => {
        setQuery('');
        setSuggestions([]);
        setIsOpen(true);
        setHighlightIndex(-1);
        loadRecommendations();
    };

    const handleFocus = () => {
        setIsOpen(true);
        loadRecommendations();
    };

    const sizeClasses = {
        normal: "py-3 text-sm rounded-full",
        large: "py-5 text-base rounded-2xl",
        xl: "py-6 text-lg rounded-2xl",
        header:
            "py-2.5 text-sm rounded-full border border-slate-200/90 bg-slate-100/90 shadow-none " +
            "placeholder:text-slate-500 hover:bg-white hover:border-slate-300 " +
            "focus:bg-white focus:border-blue-400 focus:ring-2 " +
            "focus:ring-blue-500/20 focus:shadow-md motion-safe:transition-colors motion-safe:duration-150"
    };

    const iconSizes = {
        normal: "h-5 w-5",
        large: "h-7 w-7",
        xl: "h-8 w-8",
        header: "h-4 w-4"
    };

    const inputPaddingLeft = {
        normal: "pl-12",
        large: "pl-14",
        xl: "pl-16",
        header: "pl-10"
    };

    const inputPaddingRight = {
        normal: "pr-28",
        large: "pr-32",
        xl: "pr-36",
        header: "pr-10"
    };

    const buttonSizing = {
        normal: "text-sm px-4",
        large: "text-base px-5",
        xl: "text-base px-6",
        header: "text-xs px-3"
    };

    const buttonInset = {
        normal: "my-2",
        large: "my-2.5",
        xl: "my-3",
        header: "my-1.5"
    };

    const iconLeftPadding = size === 'header' ? 'pl-3.5' : 'pl-4';
    const effectiveAriaLabel = buttonAriaLabel || buttonLabel || resolvedPlaceholder || '';
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

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (isOpen) {
                e.preventDefault();
                e.stopPropagation();
                setIsOpen(false);
                setHighlightIndex(-1);
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIsOpen(true);
            setHighlightIndex((prev) => {
                const max = Math.max(activeSuggestions.length - 1, 0);
                if (activeSuggestions.length === 0) return -1;
                return prev < max ? prev + 1 : 0;
            });
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex((prev) => {
                const max = Math.max(activeSuggestions.length - 1, 0);
                if (activeSuggestions.length === 0) return -1;
                return prev <= 0 ? max : prev - 1;
            });
            return;
        }
        if (e.key === 'Enter') {
            if (isOpen && highlightIndex >= 0 && activeSuggestions[highlightIndex]) {
                e.preventDefault();
                selectSuggestion(activeSuggestions[highlightIndex]);
                return;
            }
            handleSearch(query);
        }
    };

    const isHeaderSize = size === 'header';
    const inputBaseClass = isHeaderSize
        ? `block w-full ${inputPaddingLeft[size]} ${showButton ? inputPaddingRight[size] : 'pr-10'} border leading-5 focus:outline-none ${sizeClasses[size]}`
        : `block w-full ${inputPaddingLeft[size]} ${showButton ? inputPaddingRight[size] : 'pr-12'} border border-gray-300 leading-5 bg-white shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900/80 focus:border-slate-900 transition-colors duration-150 ${sizeClasses[size]}`;

    return (
        <div className={`relative w-full ${className}`} ref={containerRef} role="search">
            <div className="relative group flex items-center">
                <div className={`absolute inset-y-0 left-0 ${iconLeftPadding} flex items-center pointer-events-none`}>
                    <Search
                        className={`${iconSizes[size]} text-gray-400 group-focus-within:text-blue-600 motion-safe:transition-colors motion-safe:duration-200`}
                        aria-hidden="true"
                    />
                </div>
                <input
                    type="search"
                    name="q"
                    role="combobox"
                    autoComplete="off"
                    enterKeyHint="search"
                    className={inputBaseClass}
                    placeholder={resolvedPlaceholder}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                        setHighlightIndex(-1);
                    }}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                    aria-label={resolvedPlaceholder || 'Search'}
                    aria-expanded={shouldShowDropdown}
                    aria-controls={listboxId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                        highlightIndex >= 0 ? `${listboxId}-option-${highlightIndex}` : undefined
                    }
                />
                {!showButton && query && (
                    <button 
                        type="button"
                        onClick={clearSearch}
                        className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-full"
                        aria-label="Clear search"
                    >
                        <X className={isHeaderSize ? 'h-4 w-4' : 'h-5 w-5'} />
                    </button>
                )}
                {showButton && (
                    <button
                        type="button"
                        onClick={() => handleSearch(query)}
                        className={`absolute right-2 inset-y-0 ${buttonInset[size]} ${buttonSizing[size]} rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1`}
                        aria-label={effectiveAriaLabel}
                    >
                        {buttonLabel ? buttonLabel : <Search className="h-4 w-4" />}
                    </button>
                )}
            </div>

            {/* Dropdown */}
            {shouldShowDropdown && (
                <div
                    id={listboxId}
                    role="listbox"
                    aria-label="Search suggestions"
                    className="absolute left-0 right-0 top-full z-[70] mt-2 max-h-[min(26rem,calc(100dvh-8rem))] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white text-left shadow-2xl animate-fade-in"
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
                            <p className="mt-1 text-xs text-gray-500">Real-time matches across marketplace items, posts, people, pages, jobs, and gigs.</p>
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
                            const visualType = normalizeSuggestionVisualType(s);
                            const visual = suggestionVisualConfig[visualType];
                            const imageSrc = resolveSuggestionImage(s);
                            const VisualIcon = visual.icon;
                            const isHighlighted = i === highlightIndex;
                            return (
                                <button
                                    key={`${s.text}-${i}`}
                                    id={`${listboxId}-option-${i}`}
                                    type="button"
                                    role="option"
                                    aria-selected={isHighlighted}
                                    onMouseEnter={() => setHighlightIndex(i)}
                                    onClick={() => selectSuggestion(s)}
                                    className={`group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                                        isHighlighted ? 'bg-blue-50' : 'hover:bg-slate-50'
                                    }`}
                                >
                                    <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden border border-slate-200 shadow-sm ${visual.shape} ${imageSrc ? 'bg-slate-100' : visual.shell}`}>
                                        {imageSrc ? (
                                            <img
                                                src={imageSrc}
                                                alt={s.title || s.text}
                                                className="h-full w-full object-cover"
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        ) : (
                                            <>
                                                <VisualIcon className="h-5 w-5" />
                                                <span className={`absolute bottom-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${visual.badge}`}>
                                                    {GLOBAL_SEARCH_GROUP_BADGES[visualType as keyof typeof GLOBAL_SEARCH_GROUP_BADGES] || (s.category || s.type)}
                                                </span>
                                            </>
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-gray-950">
                                            {s.title || s.text}
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
