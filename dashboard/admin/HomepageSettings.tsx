
// ... existing imports ...
import React, { useState, useEffect } from 'react';
import { CMSService } from '../../services/cms';
import { AdminService } from '../../services/admin';
import { SearchService } from '../../services/search';
import { AIService } from '../../services/ai/ai.service';
import { HomepageSection, ABTest, HomepageAnalytics, HomepageTemplate, HomepageVersion, UserRole, HomepageSectionType, HeaderConfig, FooterConfig, NavItem, UploadedFile, HomeSlide, TrendingConfig, ListingCategory, HeroSearchConfig } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import { Eye, EyeOff, Save, GripVertical, ChevronUp, ChevronDown, ToggleLeft, ToggleRight, Edit2, Plus, Trash2, ArrowLeft, Image as ImageIcon, BarChart2, Layers, Clock, Settings, Copy, RefreshCw, Users, Search, Download, Check, LayoutTemplate, Link as LinkIcon, Menu, Columns, X, GalleryHorizontal, Sparkles, TrendingUp, Cpu, Facebook, Twitter, Linkedin, Instagram, Youtube, Globe, Mail, Loader2, MousePointer, Smartphone, Monitor, Tablet, ArrowUp as ArrowUpIcon, ArrowDown as ArrowDownIcon, Upload } from 'lucide-react';
import SearchIntelligence from './SearchIntelligence';
import FilePicker from '../../components/FilePicker';
import HomeSlider from '../../components/HomeSlider';

const HomepageSettings = () => {
    // New Tab Structure
    const [activeTab, setActiveTab] = useState<'header' | 'trending' | 'slider' | 'sections' | 'footer' | 'ai' | 'analytics'>('header');
    
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Homepage Settings</h2>
                    <p className="text-sm text-gray-500">Manage layout, personalization, and performance.</p>
                </div>
                <div className="flex space-x-2">
                    <button onClick={() => window.open('/', '_blank')} className="flex items-center px-4 py-2 border rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
                        <Eye className="w-4 h-4 mr-2" /> Live Preview
                    </button>
                </div>
            </div>

            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto">
                <TabButton id="header" label="Header & Hero" icon={Menu} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="trending" label="Trending Categories" icon={TrendingUp} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="slider" label="Home Slider (Media)" icon={GalleryHorizontal} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="sections" label="Sections Manager" icon={Layers} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="footer" label="Footer Builder" icon={Columns} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="ai" label="AI Optimization" icon={Cpu} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="analytics" label="Analytics" icon={BarChart2} activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>

            <div className="animate-fade-in">
                {activeTab === 'header' && <HeaderBuilder />}
                {activeTab === 'trending' && <TrendingManager />}
                {activeTab === 'slider' && <SliderManager />}
                {activeTab === 'sections' && <LayoutManager />}
                {activeTab === 'footer' && <FooterBuilder />}
                {activeTab === 'ai' && <AIOptimization />}
                {activeTab === 'analytics' && <AnalyticsView />}
            </div>
        </div>
    );
};

const TabButton = ({ id, label, icon: Icon, activeTab, setActiveTab }: any) => (
    <button 
        onClick={() => setActiveTab(id)}
        className={`px-4 py-2 text-sm font-medium rounded-md flex items-center transition-all whitespace-nowrap ${activeTab === id ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}
    >
        <Icon className="w-4 h-4 mr-2" /> {label}
    </button>
);

// --- 1. HEADER & HERO BUILDER ---
const HeaderBuilder = () => {
    const [config, setConfig] = useState<HeaderConfig | null>(null);
    const [heroConfig, setHeroConfig] = useState<HeroSearchConfig | null>(null);
    const [subTab, setSubTab] = useState<'nav' | 'hero'>('nav');
    const { showNotification } = useNotification();
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [targetLogo, setTargetLogo] = useState<'main' | 'favicon' | { type: 'brand', index: number }>('main');

    useEffect(() => {
        CMSService.getHeaderConfig().then(setConfig);
        CMSService.getHeroSearchConfig().then(setHeroConfig);
    }, []);

    const handleSave = async () => {
        if (config) await CMSService.saveHeaderConfig(config);
        if (heroConfig) await CMSService.saveHeroSearchConfig(heroConfig);
        showNotification('success', 'Saved', 'Header & Hero configuration updated.');
    };

    const handleFileSelect = (file: UploadedFile) => {
        if (typeof targetLogo === 'object' && targetLogo.type === 'brand' && heroConfig) {
             const newLogos = [...heroConfig.trustedBrands.logos];
             newLogos[targetLogo.index].src = file.url;
             setHeroConfig({ ...heroConfig, trustedBrands: { ...heroConfig.trustedBrands, logos: newLogos } });
        } else if (config) {
            if (targetLogo === 'main') {
                setConfig({ ...config, logoUrl: file.url, logoFileId: file.id });
            } else if (targetLogo === 'favicon') {
                setConfig({ ...config, faviconUrl: file.url, faviconFileId: file.id });
            }
        }
        setIsFilePickerOpen(false);
    };

    // ... Navigation Helpers (existing) ...
    const toggleNavRole = (navId: string, role: UserRole) => {
        if(!config) return;
        const newNav = config.navigation.map(n => {
            if(n.id === navId) {
                const roles = n.visibility.includes(role) ? n.visibility.filter(r => r !== role) : [...n.visibility, role];
                return {...n, visibility: roles};
            }
            return n;
        });
        setConfig({...config, navigation: newNav});
    }

    const addNavItem = () => {
        if(!config) return;
        const newItem: NavItem = { id: `nav-${Date.now()}`, label: 'New Link', url: '/', visibility: [UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] };
        setConfig({...config, navigation: [...config.navigation, newItem]});
    };

    const removeNavItem = (id: string) => { if(config) setConfig({...config, navigation: config.navigation.filter(n => n.id !== id)}); };
    const updateNavItem = (id: string, field: keyof NavItem, value: any) => { if(config) setConfig({ ...config, navigation: config.navigation.map(n => n.id === id ? { ...n, [field]: value } : n) }); };

    // ... Hero Helpers ...
    const updateTag = (index: number, field: string, value: string) => {
        if(!heroConfig) return;
        const newTags = [...heroConfig.quickTags];
        (newTags[index] as any)[field] = value;
        setHeroConfig({ ...heroConfig, quickTags: newTags });
    };
    const addTag = () => {
        if(!heroConfig) return;
        setHeroConfig({ ...heroConfig, quickTags: [...heroConfig.quickTags, { id: `qt-${Date.now()}`, label: 'New Tag', url: '/browse', color: 'blue' }] });
    };
    const removeTag = (index: number) => {
        if(!heroConfig) return;
        setHeroConfig({ ...heroConfig, quickTags: heroConfig.quickTags.filter((_, i) => i !== index) });
    };

    if (!config || !heroConfig) return <div className="p-8 text-center">Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="flex gap-4 border-b border-gray-200 pb-2 mb-4">
                <button onClick={() => setSubTab('nav')} className={`pb-2 text-sm font-medium ${subTab === 'nav' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Navigation Bar</button>
                <button onClick={() => setSubTab('hero')} className={`pb-2 text-sm font-medium ${subTab === 'hero' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Hero Search Overlay</button>
            </div>

            {subTab === 'nav' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center"><ImageIcon className="w-4 h-4 mr-2" /> Visual Identity</h3>
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div><p className="text-sm font-medium text-gray-700">Header Logo</p><p className="text-xs text-gray-500">Overrides global logo if set</p></div>
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-32 bg-gray-50 rounded border border-dashed flex items-center justify-center overflow-hidden">{config.logoUrl ? <img src={config.logoUrl} className="h-full object-contain" /> : <span className="text-[10px] text-gray-400">Default</span>}</div>
                                        <button onClick={() => { setTargetLogo('main'); setIsFilePickerOpen(true); }} className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200">Change</button>
                                    </div>
                                </div>
                                {/* Favicon Logic Similar */}
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                             {/* Search Settings */}
                             <h3 className="font-bold text-gray-900 mb-4 flex items-center"><Search className="w-4 h-4 mr-2" /> Navbar Search</h3>
                             <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-700">Enable Navbar Search</span>
                                <button onClick={() => setConfig({...config, searchEnabled: !config.searchEnabled})} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${config.searchEnabled ? 'bg-blue-600' : 'bg-gray-200'}`}><span className={`inline-block h-3 w-3 transform rounded-full bg-white transition ${config.searchEnabled ? 'translate-x-5' : 'translate-x-1'}`} /></button>
                             </div>
                        </div>
                    </div>
                    {/* Navigation Items Editor (reusing logic from previous implementation) */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-gray-900">Navigation Items</h3><button onClick={addNavItem} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 flex items-center"><Plus className="w-3 h-3 mr-1"/> Add Item</button></div>
                        <div className="space-y-2">
                             {config.navigation.map((nav, i) => (
                                <div key={nav.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-200 gap-4">
                                    <div className="flex-1 grid grid-cols-2 gap-2">
                                        <input className="border rounded px-2 py-1 text-sm" value={nav.label} onChange={(e) => updateNavItem(nav.id, 'label', e.target.value)} placeholder="Label" />
                                        <input className="border rounded px-2 py-1 text-sm text-gray-500" value={nav.url} onChange={(e) => updateNavItem(nav.id, 'url', e.target.value)} placeholder="/url" />
                                    </div>
                                    <div className="flex gap-1">
                                        {[UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER].map(r => (
                                            <button key={r} onClick={() => toggleNavRole(nav.id, r)} className={`text-[10px] px-2 py-1 rounded uppercase border ${nav.visibility.includes(r) ? 'bg-blue-100 text-blue-700 border-blue-200 font-bold' : 'bg-white text-gray-400 border-gray-200'}`} title={`Visible to ${r}`}>{r.substr(0,1)}</button>
                                        ))}
                                    </div>
                                    <button onClick={() => removeNavItem(nav.id)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
                                </div>
                             ))}
                        </div>
                    </div>
                </div>
            )}

            {subTab === 'hero' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Headings & Search */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="font-bold text-gray-900 mb-4">Hero Text & Search</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Primary Headline</label>
                                <input className="w-full border rounded p-2" value={heroConfig.headline} onChange={e => setHeroConfig({...heroConfig, headline: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Subheadline (Value Prop)</label>
                                <input className="w-full border rounded p-2" value={heroConfig.subheadline} onChange={e => setHeroConfig({...heroConfig, subheadline: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Search Placeholder</label>
                                    <input className="w-full border rounded p-2" value={heroConfig.searchPlaceholder} onChange={e => setHeroConfig({...heroConfig, searchPlaceholder: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Size Preset</label>
                                    <select className="w-full border rounded p-2" value={heroConfig.searchSize} onChange={e => setHeroConfig({...heroConfig, searchSize: e.target.value as any})}>
                                        <option value="normal">Normal</option>
                                        <option value="large">Large</option>
                                        <option value="xl">Extra Large</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Quick Tags */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                             <h3 className="font-bold text-gray-900">Quick Category Buttons</h3>
                             <button onClick={addTag} className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded font-bold hover:bg-blue-100">+ Add Button</button>
                        </div>
                        <div className="space-y-2">
                            {heroConfig.quickTags.map((tag, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <input className="border rounded px-2 py-1 text-sm flex-1" value={tag.label} onChange={e => updateTag(idx, 'label', e.target.value)} placeholder="Label" />
                                    <input className="border rounded px-2 py-1 text-sm flex-1 text-gray-500" value={tag.url} onChange={e => updateTag(idx, 'url', e.target.value)} placeholder="URL" />
                                    <button onClick={() => removeTag(idx)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Trusted Brands */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="font-bold text-gray-900 mb-4">Trusted Brands Section</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Section Title</label>
                                <input className="w-full border rounded p-2" value={heroConfig.trustedBrands.title} onChange={e => setHeroConfig({...heroConfig, trustedBrands: { ...heroConfig.trustedBrands, title: e.target.value }})} />
                            </div>
                            <div className="flex items-center gap-2">
                                <input type="checkbox" checked={heroConfig.trustedBrands.enabled} onChange={e => setHeroConfig({...heroConfig, trustedBrands: { ...heroConfig.trustedBrands, enabled: e.target.checked }})} />
                                <span className="text-sm">Enable Section</span>
                            </div>
                            
                            <div className="grid grid-cols-4 gap-4">
                                {heroConfig.trustedBrands.logos.map((logo, idx) => (
                                    <div key={idx} className="border rounded p-2 text-center relative group">
                                        <img src={logo.src} className="h-8 mx-auto object-contain" />
                                        <button 
                                            onClick={() => { setTargetLogo({ type: 'brand', index: idx }); setIsFilePickerOpen(true); }}
                                            className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-bold transition-opacity"
                                        >
                                            Change
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-end pt-4 border-t border-gray-200">
                <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-lg">Save Configuration</button>
            </div>

            <FilePicker 
                isOpen={isFilePickerOpen} 
                onClose={() => setIsFilePickerOpen(false)} 
                onSelect={handleFileSelect} 
                acceptedTypes="image/*" 
                title="Select Logo"
            />
        </div>
    );
};

// ... keep TrendingManager, SliderManager, LayoutManager, FooterBuilder, AIOptimization, AnalyticsView unchanged ...
const TrendingManager = () => {
    // ... (previous content of TrendingManager)
    const [config, setConfig] = useState<TrendingConfig | null>(null);
    const [allCategories, setAllCategories] = useState<ListingCategory[]>([]);
    const [catSearch, setCatSearch] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const { showNotification } = useNotification();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [c, gigs, jobs] = await Promise.all([
            CMSService.getTrendingConfig(),
            AdminService.getGigCategories(),
            AdminService.getJobCategories()
        ]);
        setConfig(c);
        setAllCategories([...gigs, ...jobs]);
    };

    const handleSave = async () => {
        if(config) {
            await CMSService.saveTrendingConfig(config);
            showNotification('success', 'Saved', 'Trending categories updated.');
        }
    };

    const handleAutoFill = async () => {
        setIsAnalyzing(true);
        try {
            const trends = await SearchService.getTrendingSearches();
            const keywords = trends.map(t => t.keyword);

            if (keywords.length === 0) {
                showNotification('info', 'No Data', 'Not enough search data to generate trends.');
                setIsAnalyzing(false);
                return;
            }

            const categoriesSimple = allCategories.map(c => ({ id: c.id, name: c.name }));
            const result = await AIService.matchTrendsToCategories({ trends: keywords, categories: categoriesSimple });
            const newSet = Array.from(new Set([...config!.categoryIds, ...result.categoryIds]));
            
            setConfig(prev => prev ? { ...prev, categoryIds: newSet } : null);
            showNotification('success', 'AI Updated', `Added ${result.categoryIds.length} categories based on search trends.`);
        } catch (e) {
            console.error(e);
            showNotification('alert', 'Error', 'AI Analysis failed.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const toggleCategory = (catId: string) => {
        if(!config) return;
        const current = config.categoryIds;
        const newIds = current.includes(catId) ? current.filter(id => id !== catId) : [...current, catId];
        setConfig({...config, categoryIds: newIds});
    };

    const toggleVisibility = (role: UserRole) => {
        if(!config) return;
        const current = config.visibility;
        const newVis = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
        setConfig({...config, visibility: newVis});
    };

    const filteredCategories = allCategories.filter(c => c.name.toLowerCase().includes(catSearch.toLowerCase()));

    if(!config) return <div>Loading...</div>;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
                <h3 className="font-bold text-gray-900">Trending Categories Strip</h3>
                <div className="flex items-center gap-3">
                    <label className="flex items-center text-sm cursor-pointer">
                        <input type="checkbox" checked={config.enabled} onChange={e => setConfig({...config, enabled: e.target.checked})} className="mr-2 rounded text-blue-600" />
                        Enable Strip
                    </label>
                    <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700">Save</button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Strip Title</label>
                        <input 
                            className="w-full border-gray-300 rounded-lg p-2" 
                            value={config.title} 
                            onChange={e => setConfig({...config, title: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Behavior</label>
                        <select 
                            className="w-full border-gray-300 rounded-lg p-2"
                            value={config.scrollBehavior}
                            onChange={e => setConfig({...config, scrollBehavior: e.target.value as any})}
                        >
                            <option value="manual">Manual Scroll (Arrows)</option>
                            <option value="auto">Auto Slide</option>
                        </select>
                    </div>
                    {config.scrollBehavior === 'auto' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Interval (ms)</label>
                            <input 
                                type="number" 
                                className="w-full border-gray-300 rounded-lg p-2" 
                                value={config.autoSlideInterval} 
                                onChange={e => setConfig({...config, autoSlideInterval: parseInt(e.target.value)})}
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Visible To</label>
                        <div className="flex gap-2">
                            {[UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER].map(r => (
                                <button 
                                    key={r}
                                    onClick={() => toggleVisibility(r)}
                                    className={`px-3 py-1 rounded text-xs border capitalize ${config.visibility.includes(r) ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border-gray-200'}`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col h-[400px]">
                    <div className="flex justify-between items-center mb-3">
                        <div>
                            <h4 className="font-bold text-gray-900 text-sm">Select Categories</h4>
                            <p className="text-xs text-gray-500">Selected: {config.categoryIds.length}</p>
                        </div>
                        <button 
                            onClick={handleAutoFill}
                            disabled={isAnalyzing}
                            className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-md hover:bg-purple-700 transition flex items-center disabled:opacity-70"
                        >
                            {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                            Auto-Fill from Trends
                        </button>
                    </div>
                    
                    <div className="mb-2 relative">
                        <Search className="w-4 h-4 absolute left-2 top-2 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Filter categories..." 
                            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                            value={catSearch}
                            onChange={(e) => setCatSearch(e.target.value)}
                        />
                    </div>

                    <div className="overflow-y-auto space-y-2 flex-1 pr-1">
                        {filteredCategories.map(cat => (
                            <div key={cat.id} onClick={() => toggleCategory(cat.id)} className={`flex items-center justify-between p-2 rounded cursor-pointer border hover:bg-blue-50/50 ${config.categoryIds.includes(cat.id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}>
                                <span className="text-sm font-medium">{cat.name}</span>
                                {config.categoryIds.includes(cat.id) && <Check className="w-4 h-4 text-blue-600" />}
                            </div>
                        ))}
                        {filteredCategories.length === 0 && <p className="text-center text-xs text-gray-400 py-4">No categories match.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

const SliderManager = () => {
    // ... (previous content of SliderManager)
    const [slides, setSlides] = useState<HomeSlide[]>([]);
    const [editingSlide, setEditingSlide] = useState<Partial<HomeSlide> | null>(null);
    const [activeSubTab, setActiveSubTab] = useState<'editor' | 'abtest' | 'ai'>('editor');
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const { showNotification } = useNotification();

    useEffect(() => {
        loadSlides();
    }, []);

    const loadSlides = async () => {
        const data = await CMSService.getHomeSlides();
        setSlides(data);
    };

    const handleSave = async () => {
        if(editingSlide && editingSlide.mediaUrl) {
            await CMSService.saveHomeSlide(editingSlide as HomeSlide);
            setEditingSlide(null);
            loadSlides();
            showNotification('success', 'Saved', 'Slide updated');
        }
    };

    const handleCreate = () => {
        setEditingSlide({
            id: `slide-${Date.now()}`,
            mediaType: 'image',
            mediaUrl: '',
            isActive: true,
            sortOrder: slides.length + 1,
            roleVisibility: [UserRole.GUEST, UserRole.EMPLOYER],
            backgroundColor: '#000000',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    };

    const handleDelete = async (id: string) => {
        if(confirm('Delete?')) {
            await CMSService.deleteHomeSlide(id);
            loadSlides();
        }
    }

    const moveSlide = async (index: number, dir: 'up'|'down') => {
        if ((dir === 'up' && index === 0) || (dir === 'down' && index === slides.length - 1)) return;
        const newSlides = [...slides];
        const swap = dir === 'up' ? index - 1 : index + 1;
        [newSlides[index], newSlides[swap]] = [newSlides[swap], newSlides[index]];
        newSlides.forEach((s, i) => s.sortOrder = i + 1);
        await CMSService.updateHomeSlideOrder(newSlides);
        setSlides(newSlides);
    };

    const handleFileSelect = (file: UploadedFile) => {
        if (editingSlide) {
            setEditingSlide({ ...editingSlide, mediaUrl: file.url, fileId: file.id, mediaType: file.type.startsWith('video') ? 'video' : 'image' });
            setIsFilePickerOpen(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex gap-4 border-b border-gray-200 pb-2">
                <button onClick={() => setActiveSubTab('editor')} className={`pb-2 text-sm font-medium ${activeSubTab === 'editor' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>Slider Editor</button>
                <button onClick={() => setActiveSubTab('abtest')} className={`pb-2 text-sm font-medium ${activeSubTab === 'abtest' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>A/B Experiments</button>
                <button onClick={() => setActiveSubTab('ai')} className={`pb-2 text-sm font-medium ${activeSubTab === 'ai' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>AI Optimization</button>
            </div>

            {activeSubTab === 'editor' && (
                <div className="space-y-4">
                    <div className="flex justify-between">
                        <h4 className="font-bold text-gray-900">Manage Slides</h4>
                        <button onClick={handleCreate} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">+ Add Slide</button>
                    </div>
                    <div className="bg-white border rounded-xl overflow-hidden">
                        {slides.map((slide, idx) => (
                            <div key={slide.id} className="flex items-center p-4 border-b last:border-0 hover:bg-gray-50">
                                <div className="flex flex-col mr-4">
                                    <button onClick={() => moveSlide(idx, 'up')} className="text-gray-400 hover:text-blue-600"><ChevronUp className="w-4 h-4"/></button>
                                    <button onClick={() => moveSlide(idx, 'down')} className="text-gray-400 hover:text-blue-600"><ChevronDown className="w-4 h-4"/></button>
                                </div>
                                <img src={slide.mediaUrl} className="w-24 h-16 object-cover rounded bg-gray-200 mr-4" />
                                <div className="flex-1">
                                    <div className="font-bold text-sm">{slide.title || 'Untitled'}</div>
                                    <div className="text-xs text-gray-500">{slide.redirectUrl}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setEditingSlide(slide)} className="p-2 bg-white border rounded text-blue-600 hover:bg-blue-50"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => handleDelete(slide.id)} className="p-2 bg-white border rounded text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        ))}
                        {slides.length === 0 && <div className="p-8 text-center text-gray-500">No slides.</div>}
                    </div>
                </div>
            )}

            {activeSubTab === 'abtest' && (
                <div className="bg-white p-8 rounded-xl border border-gray-200 text-center">
                    <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Settings className="w-8 h-8 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">A/B Testing Engine</h3>
                    <p className="text-gray-500 mb-6 max-w-md mx-auto">Create experiments to test different banner variations, CTAs, and audience segments to maximize Click-Through Rate.</p>
                    <button className="bg-purple-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-purple-700">Create Experiment</button>
                </div>
            )}

            {activeSubTab === 'ai' && (
                <div className="bg-white p-8 rounded-xl border border-gray-200 text-center">
                    <div className="bg-yellow-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="w-8 h-8 text-yellow-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">AI Banner Intelligence</h3>
                    <p className="text-gray-500 mb-6 max-w-md mx-auto">Let AI analyze user behavior and suggest optimal banner placement, colors, and text for each user segment.</p>
                    <button className="bg-gray-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-gray-800">Activate AI Insights</button>
                </div>
            )}

            {/* Slide Editor Modal */}
            {editingSlide && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-xl w-full max-w-2xl p-6 shadow-2xl">
                        <h3 className="font-bold text-lg mb-4">Edit Slide</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="border-2 border-dashed p-4 rounded-lg text-center cursor-pointer hover:bg-gray-50" onClick={() => setIsFilePickerOpen(true)}>
                                    {editingSlide.mediaUrl ? <img src={editingSlide.mediaUrl} className="h-32 mx-auto object-contain" /> : <div className="py-8 text-gray-400">Select Image</div>}
                                </div>
                                <input className="w-full border rounded p-2" placeholder="Title" value={editingSlide.title || ''} onChange={e => setEditingSlide({...editingSlide, title: e.target.value})} />
                                <input className="w-full border rounded p-2" placeholder="Subtitle" value={editingSlide.subtitle || ''} onChange={e => setEditingSlide({...editingSlide, subtitle: e.target.value})} />
                                <input className="w-full border rounded p-2" placeholder="Link URL" value={editingSlide.redirectUrl || ''} onChange={e => setEditingSlide({...editingSlide, redirectUrl: e.target.value})} />
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold mb-1">Background Color</label>
                                    <input type="color" className="w-full h-10 p-0 border-0 rounded cursor-pointer" value={editingSlide.backgroundColor || '#000000'} onChange={e => setEditingSlide({...editingSlide, backgroundColor: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold mb-2">Visibility</label>
                                    <div className="flex flex-wrap gap-2">
                                        {[UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER].map(r => (
                                            <button key={r} onClick={() => {
                                                const roles = editingSlide.roleVisibility || [];
                                                const newRoles = roles.includes(r) ? roles.filter(x => x !== r) : [...roles, r];
                                                setEditingSlide({...editingSlide, roleVisibility: newRoles});
                                            }} className={`text-xs px-2 py-1 rounded border capitalize ${editingSlide.roleVisibility?.includes(r) ? 'bg-blue-100 border-blue-200 text-blue-700' : 'bg-white'}`}>{r}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex items-center pt-4">
                                    <input type="checkbox" checked={editingSlide.isActive} onChange={e => setEditingSlide({...editingSlide, isActive: e.target.checked})} className="mr-2" /> Active
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={() => setEditingSlide(null)} className="px-4 py-2 border rounded">Cancel</button>
                            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">Save</button>
                        </div>
                    </div>
                </div>
            )}

            <FilePicker isOpen={isFilePickerOpen} onClose={() => setIsFilePickerOpen(false)} onSelect={handleFileSelect} acceptedTypes="image/*,video/*" />
        </div>
    );
};

const LayoutManager = () => {
    // ... (previous content of LayoutManager)
    const [sections, setSections] = useState<HomepageSection[]>([]);
    const { showNotification } = useNotification();
    const [editingSection, setEditingSection] = useState<HomepageSection | null>(null);

    useEffect(() => {
        loadSections();
    }, []);

    const loadSections = async () => {
        const data = await CMSService.getHomepageSections();
        setSections(data);
    };

    const toggleActive = async (id: string) => {
        const section = sections.find(s => s.id === id);
        if (section) {
            const updated = { ...section, isActive: !section.isActive };
            await CMSService.saveHomepageSection(updated);
            loadSections();
        }
    };

    const moveSection = async (index: number, dir: 'up' | 'down') => {
        if ((dir === 'up' && index === 0) || (dir === 'down' && index === sections.length - 1)) return;
        const newSections = [...sections];
        const swap = dir === 'up' ? index - 1 : index + 1;
        [newSections[index], newSections[swap]] = [newSections[swap], newSections[index]];
        newSections.forEach((s, i) => s.position = i + 1);
        await CMSService.updateSectionOrder(newSections);
        setSections(newSections);
    };

    const handleSaveEdit = async () => {
        if (editingSection) {
            await CMSService.saveHomepageSection(editingSection);
            setEditingSection(null);
            loadSections();
            showNotification('success', 'Saved', 'Section updated');
        }
    };

    const sectionTypes: HomepageSectionType[] = ['hero', 'trust', 'categories', 'how_it_works', 'featured', 'cta', 'skill_matching', 'trending_opps', 'growth_dash', 'gig_creation', 'market_insights', 'project_brief_generator', 'top_pro_services', 'trust_security'];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="font-bold text-gray-900">Homepage Sections</h3>
                <button 
                    onClick={async () => {
                        const newSec = await CMSService.addHomepageSection('cta');
                        loadSections();
                    }}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                >
                    + Add Section
                </button>
            </div>

            <div className="bg-white border rounded-xl overflow-hidden">
                {sections.map((section, idx) => (
                    <div key={section.id} className={`flex items-center p-4 border-b last:border-0 hover:bg-gray-50 ${!section.isActive ? 'opacity-50 bg-gray-50' : ''}`}>
                        <div className="flex flex-col mr-4 text-gray-400">
                            <button onClick={() => moveSection(idx, 'up')} className="hover:text-blue-600"><ChevronUp className="w-4 h-4" /></button>
                            <button onClick={() => moveSection(idx, 'down')} className="hover:text-blue-600"><ChevronDown className="w-4 h-4" /></button>
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center">
                                <span className="font-bold text-sm mr-2">{section.name}</span>
                                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded uppercase">{section.type}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">ID: {section.id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => toggleActive(section.id)} className={`p-2 rounded ${section.isActive ? 'text-green-600 bg-green-50' : 'text-gray-400 bg-gray-100'}`}>
                                {section.isActive ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                            </button>
                            <button onClick={() => setEditingSection(section)} className="p-2 bg-white border rounded text-blue-600 hover:bg-blue-50"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => { if(confirm('Delete?')) { CMSService.deleteHomepageSection(section.id).then(loadSections); } }} className="p-2 bg-white border rounded text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Generic Edit Modal */}
            {editingSection && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-2xl">
                        <div className="flex justify-between mb-4">
                            <h3 className="font-bold text-lg">Edit Section: {editingSection.name}</h3>
                            <button onClick={() => setEditingSection(null)}><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                            <div>
                                <label className="block text-xs font-bold mb-1">Name (Internal)</label>
                                <input className="w-full border rounded p-2" value={editingSection.name} onChange={e => setEditingSection({...editingSection, name: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold mb-1">Type</label>
                                <select className="w-full border rounded p-2" value={editingSection.type} onChange={e => setEditingSection({...editingSection, type: e.target.value as any})}>
                                    {sectionTypes.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            
                            {/* Generic Content Editor based on JSON */}
                            <div>
                                <label className="block text-xs font-bold mb-1">Content Configuration (JSON)</label>
                                <textarea 
                                    className="w-full border rounded p-2 font-mono text-xs h-40"
                                    value={JSON.stringify(editingSection.content, null, 2)}
                                    onChange={e => {
                                        try {
                                            setEditingSection({...editingSection, content: JSON.parse(e.target.value)});
                                        } catch(err) { /* invalid json */ }
                                    }} 
                                />
                                <p className="text-[10px] text-gray-500 mt-1">Edit title, subtitle, or other props directly.</p>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={() => setEditingSection(null)} className="px-4 py-2 border rounded">Cancel</button>
                            <button onClick={handleSaveEdit} className="px-4 py-2 bg-blue-600 text-white rounded font-bold">Save Changes</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- 5. FOOTER BUILDER (Updated) ---

const FooterBuilder = () => {
    const [config, setConfig] = useState<FooterConfig | null>(null);
    const { showNotification } = useNotification();
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [uploadTarget, setUploadTarget] = useState<'logo' | 'icon' | null>(null);
    const [uploadTargetIndex, setUploadTargetIndex] = useState<number | null>(null);

    const predefinedSocials = ['Facebook', 'Twitter', 'LinkedIn', 'Reddit', 'YouTube', 'Instagram', 'WhatsApp', 'TikTok'];

    useEffect(() => {
        CMSService.getFooterConfig().then(setConfig);
    }, []);

    const handleSave = async () => {
        if(config) {
            await CMSService.saveFooterConfig(config);
            showNotification('success', 'Saved', 'Footer updated.');
            setUploadTargetIndex(null);
            setUploadTarget(null);
        }
    };

    const handleFileSelect = (file: UploadedFile) => {
         if (config) {
            if (uploadTarget === 'logo') {
                setConfig({ ...config, logoUrl: file.url });
            } else if (uploadTarget === 'icon' && uploadTargetIndex !== null) {
                const newSocials = [...config.socials];
                newSocials[uploadTargetIndex] = { ...newSocials[uploadTargetIndex], icon: file.url };
                setConfig({ ...config, socials: newSocials });
            }
            setIsFilePickerOpen(false);
            setUploadTarget(null);
            setUploadTargetIndex(null);
        }
    }

    const addSocial = (platform: string = 'New Platform') => {
        if(!config) return;
        const newSocial = { 
            id: `soc-${Date.now()}`, 
            platform: platform, 
            url: 'https://', 
            enabled: true, 
            icon: '' 
        };
        setConfig({ ...config, socials: [...config.socials, newSocial] });
    };

    const removeSocial = (idx: number) => {
        if(!config) return;
        const newSocials = config.socials.filter((_, i) => i !== idx);
        setConfig({ ...config, socials: newSocials });
    };

    const updateSocial = (idx: number, field: string, value: any) => {
        if(!config) return;
        const newSocials = [...config.socials];
        newSocials[idx] = { ...newSocials[idx], [field]: value };
        setConfig({ ...config, socials: newSocials });
    };

    const addColumn = () => {
        if(!config) return;
        const newCol = { id: `col-${Date.now()}`, title: 'New Column', links: [] };
        setConfig({ ...config, columns: [...config.columns, newCol] });
    };

    const removeColumn = (index: number) => {
        if(!config) return;
        const newCols = config.columns.filter((_, i) => i !== index);
        setConfig({ ...config, columns: newCols });
    };

    const updateColumnTitle = (index: number, title: string) => {
        if(!config) return;
        const newCols = [...config.columns];
        newCols[index].title = title;
        setConfig({ ...config, columns: newCols });
    };

    const addLink = (colIndex: number) => {
        if(!config) return;
        const newCols = [...config.columns];
        newCols[colIndex].links.push({ id: `l-${Date.now()}`, label: 'New Link', url: '#', type: 'internal', visibility: [UserRole.GUEST] });
        setConfig({ ...config, columns: newCols });
    };

    const removeLink = (colIndex: number, linkIndex: number) => {
        if(!config) return;
        const newCols = [...config.columns];
        newCols[colIndex].links = newCols[colIndex].links.filter((_, i) => i !== linkIndex);
        setConfig({ ...config, columns: newCols });
    };

    const updateLink = (colIndex: number, linkIndex: number, field: string, value: string) => {
        if(!config) return;
        const newCols = [...config.columns];
        newCols[colIndex].links[linkIndex] = { ...newCols[colIndex].links[linkIndex], [field]: value };
        setConfig({ ...config, columns: newCols });
    };

    if(!config) return <div>Loading...</div>;

    return (
        <div className="space-y-8">
            <div className="bg-white p-6 rounded-xl border border-gray-200">
                <h3 className="font-bold text-gray-900 mb-4">General Info</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold mb-1">Footer Description</label>
                        <textarea className="w-full border rounded p-2" value={config.description} onChange={e => setConfig({...config, description: e.target.value})} />
                    </div>
                    <div>
                         <label className="block text-xs font-bold mb-1">Footer Logo</label>
                         <div className="flex items-center gap-3">
                             <div className="h-10 w-32 bg-gray-50 rounded border border-dashed flex items-center justify-center overflow-hidden">
                                 {config.logoUrl ? <img src={config.logoUrl} className="h-full object-contain" /> : <span className="text-[10px] text-gray-400">Default</span>}
                             </div>
                             <button onClick={() => { setUploadTarget('logo'); setIsFilePickerOpen(true); }} className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200">Change</button>
                         </div>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold mb-1">Copyright Text</label>
                        <input className="w-full border rounded p-2" value={config.copyright} onChange={e => setConfig({...config, copyright: e.target.value})} />
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200">
                <div className="flex justify-between mb-4">
                    <h3 className="font-bold text-gray-900">Columns & Links</h3>
                    <button onClick={addColumn} className="text-sm bg-blue-50 text-blue-600 px-3 py-1 rounded font-medium">+ Add Column</button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {config.columns.map((col, cIdx) => (
                        <div key={col.id} className="border rounded-lg p-4 bg-gray-50 relative group">
                            <button onClick={() => removeColumn(cIdx)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"><X className="w-4 h-4" /></button>
                            <input 
                                className="font-bold bg-transparent border-b border-transparent focus:border-blue-300 w-full mb-3 focus:outline-none" 
                                value={col.title} 
                                onChange={e => updateColumnTitle(cIdx, e.target.value)} 
                            />
                            
                            <div className="space-y-2 mb-3">
                                {col.links.map((link, lIdx) => (
                                    <div key={link.id} className="flex gap-2 items-center">
                                        <div className="flex-1 space-y-1">
                                            <input className="w-full text-xs border rounded p-1" value={link.label} onChange={e => updateLink(cIdx, lIdx, 'label', e.target.value)} placeholder="Label" />
                                            <input className="w-full text-[10px] border rounded p-1 text-gray-500" value={link.url} onChange={e => updateLink(cIdx, lIdx, 'url', e.target.value)} placeholder="URL" />
                                        </div>
                                        <button onClick={() => removeLink(cIdx, lIdx)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => addLink(cIdx)} className="w-full py-1 text-xs border border-dashed border-gray-300 rounded text-gray-500 hover:bg-white">+ Add Link</button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200">
                <h3 className="font-bold text-gray-900 mb-4">Social Links</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {config.socials.map((social, idx) => (
                        <div key={social.id} className="flex items-center p-3 border rounded bg-gray-50 relative group">
                             <button onClick={() => removeSocial(idx)} className="absolute top-1 right-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                             <div className="mr-3 cursor-pointer" onClick={() => { setUploadTarget('icon'); setUploadTargetIndex(idx); setIsFilePickerOpen(true); }}>
                                {social.icon ? <img src={social.icon} className="w-8 h-8 rounded" /> : <div className="w-8 h-8 bg-white border rounded flex items-center justify-center text-gray-400">?</div>}
                             </div>
                             <div className="flex-1 space-y-1">
                                <select className="w-full text-xs border rounded p-1" value={social.platform} onChange={e => updateSocial(idx, 'platform', e.target.value)}>
                                    {predefinedSocials.map(p => <option key={p} value={p}>{p}</option>)}
                                    <option value="Custom">Custom</option>
                                </select>
                                <input className="w-full text-xs border rounded p-1" value={social.url} onChange={e => updateSocial(idx, 'url', e.target.value)} />
                             </div>
                             <input type="checkbox" className="ml-2" checked={social.enabled} onChange={e => updateSocial(idx, 'enabled', e.target.checked)} />
                        </div>
                    ))}
                    <button onClick={() => addSocial()} className="border-2 border-dashed border-gray-300 rounded p-4 flex flex-col items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-blue-600 hover:border-blue-300">
                        <Plus className="w-6 h-6 mb-1" /> Add Social
                    </button>
                </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-200">
                <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-lg">Save Footer Config</button>
            </div>
            
            <FilePicker isOpen={isFilePickerOpen} onClose={() => setIsFilePickerOpen(false)} onSelect={handleFileSelect} acceptedTypes="image/*" />
        </div>
    );
};

// --- 6. AI OPTIMIZATION ---
const AIOptimization = () => (
    <div className="bg-white p-8 rounded-xl border border-gray-200 text-center">
         <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
             <Cpu className="w-8 h-8 text-indigo-600" />
         </div>
         <h3 className="text-lg font-bold text-gray-900">AI Layout Optimization</h3>
         <p className="text-gray-500 mb-6 max-w-md mx-auto">Let AI analyze user heatmaps and conversion data to automatically reorder homepage sections for maximum engagement.</p>
         <button className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700">Enable Auto-Optimize</button>
    </div>
);

// --- 7. ANALYTICS ---
const AnalyticsView = () => {
    const [stats, setStats] = useState<HomepageAnalytics | null>(null);

    useEffect(() => {
        CMSService.getHomepageAnalytics().then(setStats);
    }, []);

    if(!stats) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-xs font-bold text-gray-500 uppercase">Page Views</div>
                    <div className="text-2xl font-bold text-gray-900">{stats.views.toLocaleString()}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-xs font-bold text-gray-500 uppercase">CTA Clicks</div>
                    <div className="text-2xl font-bold text-blue-600">{stats.ctaClicks.toLocaleString()}</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-xs font-bold text-gray-500 uppercase">Bounce Rate</div>
                    <div className="text-2xl font-bold text-red-500">{stats.bounceRate}%</div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <div className="text-xs font-bold text-gray-500 uppercase">Avg. Time</div>
                    <div className="text-2xl font-bold text-green-600">{stats.avgTimeOnPage}s</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                     <h3 className="font-bold text-gray-900 mb-4">Device Breakdown</h3>
                     <div className="space-y-4">
                         <div className="flex items-center justify-between">
                             <div className="flex items-center"><Monitor className="w-4 h-4 mr-2 text-gray-500" /> Desktop</div>
                             <div className="flex items-center w-2/3">
                                 <div className="h-2 bg-blue-600 rounded-full mr-2" style={{width: `${stats.deviceBreakdown.desktop}%`}}></div>
                                 <span className="text-xs font-bold">{stats.deviceBreakdown.desktop}%</span>
                             </div>
                         </div>
                         <div className="flex items-center justify-between">
                             <div className="flex items-center"><Smartphone className="w-4 h-4 mr-2 text-gray-500" /> Mobile</div>
                             <div className="flex items-center w-2/3">
                                 <div className="h-2 bg-green-500 rounded-full mr-2" style={{width: `${stats.deviceBreakdown.mobile}%`}}></div>
                                 <span className="text-xs font-bold">{stats.deviceBreakdown.mobile}%</span>
                             </div>
                         </div>
                         <div className="flex items-center justify-between">
                             <div className="flex items-center"><Tablet className="w-4 h-4 mr-2 text-gray-500" /> Tablet</div>
                             <div className="flex items-center w-2/3">
                                 <div className="h-2 bg-yellow-500 rounded-full mr-2" style={{width: `${stats.deviceBreakdown.tablet}%`}}></div>
                                 <span className="text-xs font-bold">{stats.deviceBreakdown.tablet}%</span>
                             </div>
                         </div>
                     </div>
                 </div>

                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                     <h3 className="font-bold text-gray-900 mb-4">Top Sections</h3>
                     <div className="space-y-3">
                         {stats.sectionEngagement.map((sec, i) => (
                             <div key={i} className="flex justify-between items-center border-b border-gray-100 pb-2 last:border-0">
                                 <span className="text-sm font-medium">{sec.name}</span>
                                 <div className="text-right">
                                     <div className="text-xs font-bold text-gray-900">{sec.clicks} clicks</div>
                                     <div className="text-[10px] text-gray-500">{sec.views} views</div>
                                 </div>
                             </div>
                         ))}
                     </div>
                 </div>
            </div>
        </div>
    );
};

export default HomepageSettings;
