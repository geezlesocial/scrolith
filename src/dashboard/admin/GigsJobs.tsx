import React, { useState, useEffect } from 'react';
import {
    Plus, Edit2, Trash2, Star, Filter, Eye, CheckCircle, XCircle, Search,
    Upload, Image as ImageIcon, Video, Folder, ArrowLeft, Save, Briefcase,
    DollarSign, List, Layout, ChevronRight, HelpCircle,
    ChevronDown, ChevronUp, GripVertical, FileText, Globe, Tag, MapPin, Clock, Lock, X,
    Crown, ShieldCheck, Zap, RefreshCw
} from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useCurrency } from '../../context/CurrencyContext';
import { useNotification } from '../../context/NotificationContext';
import {
    Gig, Job, ListingCategory, GigPackage, Plan, PlanFeature,
    GigExtra, GigFAQ, GigRequirement, CategorySub, UploadedFile
} from '../../types';
import { CMSService } from '../../services/cms';
import FilePickerModal from '../shared/FilePickerModal';
import RichTextEditor from '../../components/RichTextEditor';

const ListingsManagementTab = () => {
    const { formatPrice } = useCurrency();
    const { showNotification } = useNotification();

    // Core Navigation State
    const [activeTab, setActiveTab] = useState<'gigs' | 'jobs' | 'categories' | 'plans'>('gigs');

    // View State (List vs Editor)
    const [view, setView] = useState<'list' | 'editor'>('list');
    const [subView, setSubView] = useState<'gig-cats' | 'job-cats' | null>(null);

    // Data State
    const [items, setItems] = useState<any[]>([]);
    const [categories, setCategories] = useState<ListingCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<any>(null);

    // --- Load Data ---
    useEffect(() => {
        // Initialize subView default if in categories mode
        if (activeTab === 'categories' && !subView) {
            setSubView('gig-cats');
        }
        loadData();
    }, [activeTab, subView]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            if (activeTab === 'gigs') {
                const [gigs, gigCats] = await Promise.all([
                    AdminService.getAdminGigs(),
                    AdminService.getGigCategories()
                ]);
                setItems(gigs);
                setCategories(gigCats);
            } else if (activeTab === 'jobs') {
                const [jobs, jobCats] = await Promise.all([
                    AdminService.getAdminJobs(),
                    AdminService.getJobCategories()
                ]);
                setItems(jobs);
                setCategories(jobCats);
            } else if (activeTab === 'categories') {
                const targetSub = subView || 'gig-cats';
                const isJob = targetSub === 'job-cats';
                const cats = isJob ? await AdminService.getJobCategories() : await AdminService.getGigCategories();
                setItems(cats);
            } else if (activeTab === 'plans') {
                const plans = await AdminService.getPlans();
                setItems(plans);
            }

            // Load stats for all tabs
            const statsData = await AdminService.getGigsJobsStats();
            setStats(statsData);
        } catch (error) {
            console.error("Failed to load listings data", error);
            setError('Failed to load data. Please check your connection.');
            showNotification('error', 'Error', 'Failed to load data. Please refresh.');
            setItems([]);
            setCategories([]);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = () => {
        loadData();
        showNotification('info', 'Refreshing', 'Loading latest data...');
    };

    if (error && view === 'list') {
        return (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Commerce & Listings</h2>
                        <p className="text-sm text-gray-500">Manage global marketplace inventory and monetization.</p>
                    </div>
                </div>
                <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-8 rounded-xl text-center">
                    <p className="font-medium mb-4">{error}</p>
                    <button
                        onClick={handleRefresh}
                        className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 flex items-center mx-auto"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Commerce & Listings</h2>
                    <p className="text-sm text-gray-500">Manage global marketplace inventory and monetization.</p>
                </div>
                <div className="flex items-center gap-4">
                    {stats && (
                        <div className="hidden md:flex items-center px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-blue-700 text-sm font-medium">
                            <div className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></div>
                            {stats.total_gigs || 0} Gigs • {stats.total_jobs || 0} Jobs
                        </div>
                    )}
                    <button
                        onClick={handleRefresh}
                        className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition"
                        title="Refresh data"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {view === 'list' && (
                        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
                            <TabButton id="gigs" label="Gigs" icon={Briefcase} activeTab={activeTab} setActiveTab={setActiveTab} />
                            <TabButton id="jobs" label="Jobs" icon={List} activeTab={activeTab} setActiveTab={setActiveTab} />
                            <TabButton id="categories" label="Categories" icon={Layout} activeTab={activeTab} setActiveTab={(id: any) => { setActiveTab(id); setSubView('gig-cats'); }} />
                            <TabButton id="plans" label="Plans" icon={DollarSign} activeTab={activeTab} setActiveTab={setActiveTab} />
                        </div>
                    )}
                </div>
            </div>

            {activeTab === 'categories' && view === 'list' && (
                <div className="flex space-x-4 border-b border-gray-200 pb-4 mb-4">
                    <button
                        onClick={() => setSubView('gig-cats')}
                        className={`text-sm font-medium pb-2 -mb-4 border-b-2 transition-colors ${subView !== 'job-cats' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Gig Categories
                    </button>
                    <button
                        onClick={() => setSubView('job-cats')}
                        className={`text-sm font-medium pb-2 -mb-4 border-b-2 transition-colors ${subView === 'job-cats' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Job Categories
                    </button>
                </div>
            )}

            {activeTab === 'plans' ? (
                <PlanManager />
            ) : view === 'list' ? (
                <div className="animate-fade-in">
                    {activeTab === 'categories' ? (
                        <CategoriesList
                            items={items}
                            type={subView === 'job-cats' ? 'job' : 'gig'}
                            reload={loadData}
                            loading={loading}
                        />
                    ) : (
                        <ListingsTable
                            items={items}
                            type={activeTab}
                            loading={loading}
                            categories={categories}
                            onEdit={(item: any) => setView('editor')}
                            reload={loadData}
                            onCreate={() => setView('editor')}
                        />
                    )}
                </div>
            ) : (
                <EditorWrapper
                    type={activeTab}
                    onBack={() => { setView('list'); loadData(); }}
                    categories={categories}
                />
            )}
        </div>
    );
};

const TabButton = ({ id, label, icon: Icon, activeTab, setActiveTab }: any) => (
    <button
        onClick={() => setActiveTab(id)}
        className={`px-4 py-2 text-sm font-medium rounded-md flex items-center transition-all ${activeTab === id ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}
    >
        <Icon className="w-4 h-4 mr-2" /> {label}
    </button>
);

const ListingsTable = ({ items, type, loading, onEdit, reload, onCreate }: any) => {
    const { formatPrice } = useCurrency();
    const { showNotification } = useNotification();
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const handleDelete = async (id: string) => {
        if (!confirm(`Delete this ${type}? This action cannot be undone.`)) return;
        try {
            let success;
            if (type === 'gigs') {
                success = await AdminService.deleteGig(id);
            } else {
                success = await AdminService.deleteJob(id);
            }

            if (success) {
                reload();
                showNotification('success', 'Deleted', `${type === 'gigs' ? 'Gig' : 'Job'} removed successfully.`);
            } else {
                showNotification('error', 'Error', `Failed to delete ${type}. Please try again.`);
            }
        } catch (error) {
            console.error('Delete error:', error);
            showNotification('error', 'Error', 'An error occurred while deleting.');
        }
    };

    const handleStatusChange = async (item: any, newStatus: string) => {
        const isApprove = newStatus === 'approved';
        try {
            const result = await AdminService.approveListing(type === 'gigs' ? 'gig' : 'job', item.id, isApprove ? 'active' : 'rejected');

            if (result) {
                const link = type === 'gigs' ? `/gigs/${item.id}` : `/jobs/${item.id}`;
                showNotification(
                    isApprove ? 'success' : 'alert',
                    isApprove ? `${type === 'gigs' ? 'Gig' : 'Job'} Approved` : `${type === 'gigs' ? 'Gig' : 'Job'} Rejected`,
                    `Notification sent to user.`,
                    link,
                    item.id
                );
                reload();
            } else {
                showNotification('error', 'Error', 'Failed to update status');
            }
        } catch (error) {
            console.error('Status change error:', error);
            showNotification('error', 'Error', 'An error occurred while updating status.');
        }
    };

    const safeItems = Array.isArray(items) ? items : [];

    const filteredItems = safeItems.filter((item: any) => {
        const matchesSearch = (item.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.id && item.id.toString().toLowerCase().includes(searchTerm.toLowerCase()));
        const itemStatus = item.status || item.adminStatus;
        const matchesStatus = filterStatus === 'all' || itemStatus === filterStatus;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex flex-1 gap-4 w-full">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder={`Search ${type}...`}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="relative w-48">
                        <Filter className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <select
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white cursor-pointer"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                        >
                            <option value="all">All Statuses</option>
                            <option value="draft">Draft</option>
                            <option value="submitted">Submitted</option>
                            <option value="under_review">Under Review</option>
                            <option value="active">Active</option>
                            <option value="paused">Paused</option>
                            <option value="rejected">Rejected</option>
                            <option value="archived">Archived</option>
                        </select>
                    </div>
                </div>
                <button onClick={onCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 flex items-center shadow-sm whitespace-nowrap">
                    <Plus className="w-4 h-4 mr-2" /> Add {type === 'gigs' ? 'Gig' : 'Job'}
                </button>
            </div>

            {loading ? (
                <div className="p-8 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-500">Loading {type}...</p>
                </div>
            ) : (
                <>
                    <div className="px-6 py-3 bg-gray-50 text-sm text-gray-500 border-b">
                        Showing {filteredItems.length} of {safeItems.length} {type}
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium">
                            <tr>
                                <th className="px-6 py-3">Listing</th>
                                <th className="px-6 py-3">Category</th>
                                <th className="px-6 py-3">Value</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredItems.map((item: any) => (
                                <tr key={item.id} className="hover:bg-gray-50 group transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            {item.image ? (
                                                <img src={item.image} className="w-10 h-10 rounded object-cover mr-3 bg-gray-100" alt={item.title} />
                                            ) : (
                                                <div className="w-10 h-10 rounded bg-gray-200 mr-3 flex items-center justify-center text-gray-400">
                                                    <ImageIcon className="w-5 h-5" />
                                                </div>
                                            )}
                                            <div>
                                                <div className="font-medium text-gray-900 max-w-xs truncate">{item.title}</div>
                                                <div className="text-xs text-gray-500">ID: {item.id}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">
                                        {item.category}
                                        {item.subcategory && <span className="text-xs text-gray-400 block">{item.subcategory}</span>}
                                    </td>
                                    <td className="px-6 py-4 font-bold text-gray-800">
                                        {type === 'gigs' ? formatPrice(item.price) : item.budget}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold w-fit uppercase ${
                                            // Use snake_case properties from backend
                                            item.status === 'active' || item.adminStatus === 'approved' ? 'bg-green-100 text-green-700' :
                                                item.status === 'rejected' || item.adminStatus === 'rejected' ? 'bg-red-100 text-red-700' :
                                                    item.status === 'submitted' || item.status === 'under_review' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {item.adminStatus === 'pending' && item.status === 'submitted' ? 'Under Review' : (item.status || item.adminStatus)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end space-x-2">
                                            {item.adminStatus !== 'approved' && item.status !== 'active' && (
                                                <button
                                                    onClick={() => handleStatusChange(item, 'approved')}
                                                    className="text-green-600 hover:bg-green-50 p-1.5 rounded transition-colors"
                                                    title="Approve"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                </button>
                                            )}
                                            {item.adminStatus !== 'rejected' && item.status !== 'rejected' && (
                                                <button
                                                    onClick={() => handleStatusChange(item, 'rejected')}
                                                    className="text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                                                    title="Reject"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => onEdit(item)}
                                                className="text-blue-600 hover:bg-blue-50 p-1.5 rounded transition-colors"
                                                title="Edit"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredItems.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-500">
                                        <div className="flex flex-col items-center">
                                            <Search className="w-12 h-12 text-gray-300 mb-4" />
                                            <p className="font-medium">No {type} found matching your criteria.</p>
                                            <p className="text-sm mt-1">Try adjusting your search or filters.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </>
            )}
        </div>
    );
};

const CategoriesList = ({ items, type, reload, loading }: {
    items: ListingCategory[],
    type: 'gig' | 'job',
    reload: () => void,
    loading: boolean
}) => {
    const [editing, setEditing] = useState<Partial<ListingCategory> | null>(null);
    const { showNotification } = useNotification();
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [uploadTarget, setUploadTarget] = useState<'category' | { subIndex: number }>('category');

    const generateSlug = (text: string) => {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');
    };

    const handleSave = async () => {
        if (!editing?.name) {
            showNotification('error', 'Error', 'Category name is required.');
            return;
        }

        const slug = editing.slug || generateSlug(editing.name);

        const categoryToSave: ListingCategory = {
            id: editing.id || `cat-${Date.now()}`,
            name: editing.name,
            slug: slug,
            type: type,
            status: editing.status || 'active',
            count: editing.count || 0,
            sortOrder: editing.sortOrder || 0,
            subcategories: editing.subcategories || [],
            description: editing.description || '',
            logo: editing.logo || ''
        };

        const success = await AdminService.saveListingCategory(categoryToSave);
        if (success) {
            showNotification('success', 'Saved', 'Category updated successfully.');
            setEditing(null);
            reload();
        } else {
            showNotification('error', 'Error', 'Failed to save category.');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete category? This will also remove all subcategories.')) return;
        const success = await AdminService.deleteListingCategory(id);
        if (success) {
            showNotification('success', 'Deleted', 'Category removed.');
            reload();
        } else {
            showNotification('error', 'Error', 'Failed to delete category.');
        }
    };

    const addSub = () => {
        if (!editing) return;
        const newSub: CategorySub = {
            id: `sub-${Date.now()}`,
            name: 'New Subcategory',
            slug: 'new-subcategory',
            status: 'active',
            sortOrder: (editing.subcategories?.length || 0) + 1
        };
        setEditing({ ...editing, subcategories: [...(editing.subcategories || []), newSub] });
    };

    const updateSub = (index: number, field: keyof CategorySub, val: any) => {
        if (!editing || !editing.subcategories) return;
        const subs = [...editing.subcategories];
        subs[index] = { ...subs[index], [field]: val };
        setEditing({ ...editing, subcategories: subs });
    };

    const handleSubNameChange = (index: number, val: string) => {
        if (!editing || !editing.subcategories) return;
        const subs = [...editing.subcategories];
        subs[index] = {
            ...subs[index],
            name: val,
            slug: generateSlug(val)
        };
        setEditing({ ...editing, subcategories: subs });
    };

    const removeSub = (index: number) => {
        if (!editing || !editing.subcategories) return;
        setEditing({ ...editing, subcategories: editing.subcategories.filter((_, i) => i !== index) });
    };

    const handleFileSelect = (file: UploadedFile) => {
        if (!editing) return;

        if (uploadTarget === 'category') {
            setEditing({ ...editing, logo: file.url });
        } else if (typeof uploadTarget === 'object') {
            updateSub(uploadTarget.subIndex, 'icon', file.url);
        }
        setIsFilePickerOpen(false);
    };

    const safeItems = Array.isArray(items) ? items : [];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
                <div>
                    <h3 className="font-bold text-gray-900">{type === 'gig' ? 'Gig' : 'Job'} Categories</h3>
                    <p className="text-xs text-gray-500">Manage structure for {type} listings</p>
                </div>
                <button
                    onClick={() => setEditing({
                        type,
                        subcategories: [],
                        status: 'active',
                        name: '',
                        slug: '',
                        description: '',
                        logo: '',
                        count: 0,
                        sortOrder: 0
                    })}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center hover:bg-blue-700 transition"
                >
                    <Plus className="w-4 h-4 mr-2" /> Add Category
                </button>
            </div>

            {loading ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-500">Loading categories...</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-6 py-3">Name</th>
                                <th className="px-6 py-3">Slug</th>
                                <th className="px-6 py-3">Subcategories</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {safeItems.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-500">
                                        <div className="flex flex-col items-center">
                                            <Folder className="w-12 h-12 text-gray-300 mb-4" />
                                            <p className="font-medium">No categories defined.</p>
                                            <p className="text-sm mt-1">Create your first category to get started.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            {safeItems.map(cat => (
                                <tr key={cat.id} className="hover:bg-gray-50 group transition-colors">
                                    <td className="px-6 py-4 font-bold text-gray-900 flex items-center">
                                        {cat.logo && <img src={cat.logo} className="w-6 h-6 mr-2 rounded object-cover" alt={cat.name} />}
                                        {cat.name}
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 font-mono text-xs">{cat.slug}</td>
                                    <td className="px-6 py-4">
                                        <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-bold">
                                            {cat.subcategories?.length || 0}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs uppercase font-bold ${cat.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {cat.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button
                                            onClick={() => setEditing(cat)}
                                            className="text-blue-600 hover:bg-blue-50 p-2 rounded transition"
                                            title="Edit"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(cat.id)}
                                            className="text-red-600 hover:bg-red-50 p-2 rounded transition"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {editing && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-lg text-gray-900">{editing.id ? 'Edit' : 'New'} Category</h3>
                            <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
                                    <input
                                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        value={editing.name || ''}
                                        onChange={e => {
                                            const name = e.target.value;
                                            setEditing({ ...editing, name, slug: generateSlug(name) });
                                        }}
                                        placeholder="Category Name"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Slug</label>
                                    <input
                                        className="w-full border border-gray-300 rounded-lg p-2 bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        value={editing.slug || ''}
                                        onChange={e => setEditing({ ...editing, slug: e.target.value })}
                                        placeholder="Auto-generated"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                                    <input
                                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        value={editing.description || ''}
                                        onChange={e => setEditing({ ...editing, description: e.target.value })}
                                        placeholder="Category description"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                                    <select
                                        className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                        value={editing.status}
                                        onChange={e => setEditing({ ...editing, status: e.target.value as string })}
                                    >
                                        <option value="active">Active</option>
                                        <option value="hidden">Hidden</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Icon/Logo</label>
                                    <div className="flex items-center gap-2">
                                        {editing.logo && <img src={editing.logo} className="w-8 h-8 rounded border border-gray-200" alt="Category logo" />}
                                        <button
                                            onClick={() => { setUploadTarget('category'); setIsFilePickerOpen(true); }}
                                            className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded border border-gray-300 transition-colors"
                                        >
                                            {editing.logo ? 'Change' : 'Upload'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-gray-100 pt-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="font-bold text-gray-900 text-sm">Subcategories</h4>
                                    <button
                                        onClick={addSub}
                                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded font-medium transition-colors border border-gray-300"
                                    >
                                        Add Subcategory
                                    </button>
                                </div>

                                <div className="space-y-2 bg-gray-50 p-4 rounded-xl border border-gray-200 max-h-60 overflow-y-auto">
                                    {(!editing.subcategories || editing.subcategories.length === 0) && (
                                        <p className="text-xs text-gray-400 text-center py-4">No subcategories yet.</p>
                                    )}
                                    {editing.subcategories?.map((sub, idx) => (
                                        <div key={idx} className="flex gap-2 items-center bg-white p-3 rounded border border-gray-200">
                                            <div
                                                className="w-8 h-8 bg-white border border-gray-300 rounded flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-colors"
                                                onClick={() => { setUploadTarget({ subIndex: idx }); setIsFilePickerOpen(true); }}
                                                title="Upload icon"
                                            >
                                                {sub.icon ? (
                                                    <img src={sub.icon} className="w-full h-full object-cover rounded" alt="Subcategory icon" />
                                                ) : (
                                                    <ImageIcon className="w-4 h-4 text-gray-400" />
                                                )}
                                            </div>
                                            <input
                                                className="flex-1 border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                                value={sub.name}
                                                onChange={e => handleSubNameChange(idx, e.target.value)}
                                                placeholder="Subcategory Name"
                                            />
                                            <input
                                                className="w-32 border border-gray-300 rounded p-2 text-sm text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                                value={sub.slug}
                                                onChange={e => updateSub(idx, 'slug', e.target.value)}
                                                placeholder="Slug"
                                            />
                                            <button
                                                onClick={() => removeSub(idx)}
                                                className="text-red-400 hover:text-red-600 p-2 transition-colors"
                                                title="Remove subcategory"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
                            <button
                                onClick={() => setEditing(null)}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-sm"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelect={handleFileSelect}
                acceptedTypes="image/*"
                role="admin"
            />
        </div>
    );
};

const PlanManager = () => {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [typeFilter, setTypeFilter] = useState<'all' | 'freelancer' | 'employer'>('all');
    const [editingPlan, setEditingPlan] = useState<Partial<Plan> | null>(null);
    const { showNotification } = useNotification();
    const { formatPrice } = useCurrency();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadPlans();
    }, []);

    const loadPlans = async () => {
        setLoading(true);
        try {
            const data = await AdminService.getPlans();
            setPlans(data || []);
        } catch (e) {
            console.error('Error loading plans:', e);
            setPlans([]);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingPlan({
            id: `plan-${Date.now()}`,
            name: '',
            type: 'freelancer',
            price: 0,
            interval: 'monthly',
            currency: 'USD',
            isActive: true,
            isPopular: false,
            features: []
        });
    };

    const handleSave = async () => {
        if (!editingPlan?.name) {
            showNotification('error', 'Error', 'Plan name is required.');
            return;
        }
        const success = await AdminService.savePlan(editingPlan as Plan);
        if (success) {
            showNotification('success', 'Saved', 'Plan updated successfully.');
            setEditingPlan(null);
            loadPlans();
        } else {
            showNotification('error', 'Error', 'Failed to save plan.');
        }
    };

    const toggleStatus = async (plan: Plan) => {
        const updatedPlan = { ...plan, isActive: !plan.isActive };
        const success = await AdminService.savePlan(updatedPlan);
        if (success) {
            loadPlans();
            showNotification('success', 'Updated', `Plan ${updatedPlan.isActive ? 'activated' : 'deactivated'}.`);
        } else {
            showNotification('error', 'Error', 'Failed to update plan status.');
        }
    };

    const filteredPlans = typeFilter === 'all' ? plans : plans.filter(p => p.type === typeFilter);

    const addFeature = () => {
        if (!editingPlan) return;
        const newFeature: PlanFeature = { id: `ft-${Date.now()}`, name: '', included: true };
        setEditingPlan({ ...editingPlan, features: [...(editingPlan.features || []), newFeature] });
    };

    const updateFeature = (idx: number, field: keyof PlanFeature, val: any) => {
        if (!editingPlan || !editingPlan.features) return;
        const feats = [...editingPlan.features];
        feats[idx] = { ...feats[idx], [field]: val };
        setEditingPlan({ ...editingPlan, features: feats });
    };

    const removeFeature = (idx: number) => {
        if (!editingPlan || !editingPlan.features) return;
        setEditingPlan({ ...editingPlan, features: editingPlan.features.filter((_, i) => i !== idx) });
    };

    return editingPlan ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-fade-in max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <button onClick={() => setEditingPlan(null)} className="text-gray-500 hover:text-gray-900 flex items-center transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Plans
                </button>
                <h2 className="text-xl font-bold">{editingPlan.name || 'New Plan'}</h2>
                <button onClick={handleSave} className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 shadow-sm flex items-center transition-colors">
                    <Save className="w-4 h-4 mr-2" /> Save Plan
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h4 className="font-bold text-gray-900 border-b pb-2">Plan Details</h4>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Plan Name</label>
                        <input
                            className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                            value={editingPlan.name}
                            onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label>
                            <select
                                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                value={editingPlan.type}
                                onChange={e => setEditingPlan({ ...editingPlan, type: e.target.value as string })}
                            >
                                <option value="freelancer">Freelancer</option>
                                <option value="employer">Employer</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Billing Cycle</label>
                            <select
                                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                value={editingPlan.interval}
                                onChange={e => setEditingPlan({ ...editingPlan, interval: e.target.value as string })}
                            >
                                <option value="monthly">Monthly</option>
                                <option value="yearly">Yearly</option>
                                <option value="lifetime">Lifetime</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Price</label>
                            <div className="relative">
                                <span className="absolute left-3 top-2 text-gray-500">$</span>
                                <input
                                    type="number"
                                    className="w-full pl-6 border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    value={editingPlan.price}
                                    onChange={e => setEditingPlan({ ...editingPlan, price: Number(e.target.value) })}
                                />
                            </div>
                        </div>
                        <div className="flex items-center pt-6">
                            <label className="flex items-center cursor-pointer mr-4">
                                <input
                                    type="checkbox"
                                    checked={editingPlan.isActive}
                                    onChange={e => setEditingPlan({ ...editingPlan, isActive: e.target.checked })}
                                    className="mr-2 rounded text-green-600 focus:ring-blue-500"
                                />
                                Active
                            </label>
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={editingPlan.isPopular}
                                    onChange={e => setEditingPlan({ ...editingPlan, isPopular: e.target.checked })}
                                    className="mr-2 rounded text-blue-600 focus:ring-blue-500"
                                />
                                Featured
                            </label>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-2">
                        <h4 className="font-bold text-gray-900">Features</h4>
                        <button
                            onClick={addFeature}
                            className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded font-medium hover:bg-blue-100 transition-colors border border-blue-200"
                        >
                            Add Feature
                        </button>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 max-h-96 overflow-y-auto space-y-2">
                        {editingPlan.features?.map((feat, idx) => (
                            <div key={idx} className="flex gap-2 items-center bg-white p-3 rounded border border-gray-200">
                                <input
                                    type="checkbox"
                                    checked={feat.included}
                                    onChange={e => updateFeature(idx, 'included', e.target.checked)}
                                    className="rounded text-green-600 focus:ring-blue-500"
                                />
                                <input
                                    className="flex-1 text-sm border border-transparent focus:border-blue-300 focus:ring-2 focus:ring-blue-100 rounded px-2 py-1 outline-none"
                                    value={feat.name}
                                    onChange={e => updateFeature(idx, 'name', e.target.value)}
                                    placeholder="Feature Name"
                                />
                                <input
                                    className="w-20 text-xs border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none"
                                    value={feat.limit || ''}
                                    onChange={e => updateFeature(idx, 'limit', e.target.value)}
                                    placeholder="Limit"
                                />
                                <button
                                    onClick={() => removeFeature(idx)}
                                    className="text-red-400 hover:text-red-600 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {(!editingPlan.features || editingPlan.features.length === 0) && (
                            <p className="text-center text-gray-400 text-xs py-4">No features added.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    ) : (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
                <div>
                    <h3 className="font-bold text-gray-900">Membership Plans</h3>
                    <p className="text-xs text-gray-500">Manage subscriptions for employers and freelancers</p>
                </div>
                <div className="flex gap-2">
                    <div className="bg-gray-100 p-1 rounded-lg flex text-xs font-medium">
                        <button
                            onClick={() => setTypeFilter('all')}
                            className={`px-3 py-1.5 rounded transition-colors ${typeFilter === 'all' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setTypeFilter('freelancer')}
                            className={`px-3 py-1.5 rounded transition-colors ${typeFilter === 'freelancer' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Freelancer
                        </button>
                        <button
                            onClick={() => setTypeFilter('employer')}
                            className={`px-3 py-1.5 rounded transition-colors ${typeFilter === 'employer' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Employer
                        </button>
                    </div>
                    <button
                        onClick={handleCreate}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-4 h-4 mr-2" /> New Plan
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-500">Loading plans...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPlans.map(plan => (
                        <div key={plan.id} className={`bg-white rounded-xl shadow-sm border p-6 flex flex-col transition-all hover:shadow-md ${plan.isActive ? 'border-gray-200' : 'border-gray-100 opacity-75'}`}>
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${plan.type === 'freelancer' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                        {plan.type}
                                    </span>
                                    <h3 className="font-bold text-xl text-gray-900 mt-2">{plan.name}</h3>
                                </div>
                                {plan.isPopular && <Crown className="w-6 h-6 text-yellow-500 fill-current" />}
                            </div>
                            <div className="mb-6">
                                <span className="text-3xl font-extrabold text-gray-900">{formatPrice(plan.price)}</span>
                                <span className="text-gray-500 text-sm">/{plan.interval}</span>
                            </div>
                            <div className="flex-1 space-y-3 mb-6">
                                {plan.features.slice(0, 5).map((f, i) => (
                                    <div key={i} className="flex items-center text-sm text-gray-600">
                                        {f.included ? (
                                            <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                                        ) : (
                                            <XCircle className="w-4 h-4 text-gray-300 mr-2 flex-shrink-0" />
                                        )}
                                        <span className={!f.included ? 'text-gray-400 line-through' : ''}>
                                            {f.name} {f.limit && <span className="font-bold">({f.limit})</span>}
                                        </span>
                                    </div>
                                ))}
                                {plan.features.length > 5 && (
                                    <div className="text-xs text-gray-400 italic">+{plan.features.length - 5} more features</div>
                                )}
                            </div>
                            <div className="flex gap-2 pt-4 border-t border-gray-100">
                                <button
                                    onClick={() => toggleStatus(plan)}
                                    className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${plan.isActive ? 'border-gray-300 text-gray-600 hover:bg-gray-50' : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'}`}
                                >
                                    {plan.isActive ? 'Deactivate' : 'Activate'}
                                </button>
                                <button
                                    onClick={() => setEditingPlan(plan)}
                                    className="flex-1 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                                >
                                    Edit
                                </button>
                            </div>
                        </div>
                    ))}
                    {filteredPlans.length === 0 && (
                        <div className="col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                            <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="font-medium text-gray-700">No plans found</p>
                            <p className="text-sm text-gray-500 mt-1">
                                {typeFilter === 'all' ? 'Create your first plan to get started.' : `No ${typeFilter} plans found.`}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const EditorWrapper = ({ type, onBack, categories }: any) => {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <button onClick={onBack} className="text-gray-500 hover:text-gray-900 flex items-center transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to List
                </button>
                <h2 className="text-xl font-bold">New {type === 'gigs' ? 'Gig' : 'Job'} Listing</h2>
                <div className="w-24"></div>
            </div>

            {type === 'gigs' ? <GigWizard categories={categories} onComplete={onBack} /> : <JobEditor categories={categories} onComplete={onBack} />}
        </div>
    );
};

const GigWizard = ({ categories, onComplete }: { categories: ListingCategory[], onComplete: () => void }) => {
    const [step, setStep] = useState(1);
    const [gig, setGig] = useState<Partial<Gig>>({
        title: '', description: '', category: '', subcategory: '', price: 0,
        pricingMode: 'packages',
        packages: [
            { name: 'Basic', description: '', deliveryDays: 3, revisions: 1, price: 0, features: [] },
            { name: 'Standard', description: '', deliveryDays: 5, revisions: 3, price: 0, features: [] },
            { name: 'Premium', description: '', deliveryDays: 7, revisions: -1, price: 0, features: [] }
        ],
        milestones: [],
        extras: [],
        faqs: [], requirements: [], images: [], videos: [], documents: [], adminStatus: 'approved'
    });
    const [availableSubs, setAvailableSubs] = useState<CategorySub[]>([]);
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [fileMode, setFileMode] = useState<'image' | 'video' | 'document'>('image');
    const { showNotification } = useNotification();

    useEffect(() => {
        const cat = categories.find(c => c.name === gig.category);
        setAvailableSubs(cat ? cat.subcategories : []);
    }, [gig.category, categories]);

    const handleSave = async () => {
        try {
            await AdminService.saveGig(gig as Gig);
            showNotification('success', 'Published', 'Gig is now live!', `/gigs/new`);
            onComplete();
        } catch (e) {
            showNotification('error', 'Error', 'Failed to publish gig.');
        }
    };

    const updatePackage = (idx: number, field: keyof GigPackage, val: any) => {
        const newPackages = [...(gig.packages || [])];
        newPackages[idx] = { ...newPackages[idx], [field]: val };
        setGig({ ...gig, packages: newPackages, price: idx === 0 && field === 'price' ? Number(val) : gig.price });
    };

    const addExtra = () => setGig({ ...gig, extras: [...(gig.extras || []), { id: Date.now().toString(), title: '', description: '', price: 0, additionalDays: 0, appliesTo: 'all' }] });
    const removeExtra = (idx: number) => setGig({ ...gig, extras: gig.extras?.filter((_, i) => i !== idx) });
    const updateExtra = (idx: number, field: keyof GigExtra, val: any) => {
        const newExtras = [...(gig.extras || [])];
        newExtras[idx] = { ...newExtras[idx], [field]: val };
        setGig({ ...gig, extras: newExtras });
    };

    const addFAQ = () => setGig({ ...gig, faqs: [...(gig.faqs || []), { id: Date.now().toString(), question: '', answer: '' }] });
    const removeFAQ = (idx: number) => setGig({ ...gig, faqs: gig.faqs?.filter((_, i) => i !== idx) });
    const updateFAQ = (idx: number, field: keyof GigFAQ, val: string) => {
        const newFaqs = [...(gig.faqs || [])];
        newFaqs[idx] = { ...newFaqs[idx], [field]: val };
        setGig({ ...gig, faqs: newFaqs });
    };

    const addReq = () => setGig({ ...gig, requirements: [...(gig.requirements || []), { id: Date.now().toString(), question: '', type: 'text', required: true }] });
    const removeReq = (idx: number) => setGig({ ...gig, requirements: gig.requirements?.filter((_, i) => i !== idx) });
    const updateReq = (idx: number, field: keyof GigRequirement, val: any) => {
        const newReqs = [...(gig.requirements || [])];
        newReqs[idx] = { ...newReqs[idx], [field]: val };
        setGig({ ...gig, requirements: newReqs });
    };

    const handleFileSelect = (file: UploadedFile) => {
        if (fileMode === 'image') {
            const currentImages = gig.images || [];
            if (currentImages.length >= 6) {
                showNotification('error', 'Limit Reached', 'Max 6 images allowed.');
                return;
            }
            const image = !gig.image ? file.url : gig.image;
            setGig(prev => ({ ...prev, image, images: [...(prev.images || []), file.url] }));
        } else if (fileMode === 'video') {
            // Ensure "a Video" (singular)
            setGig(prev => ({ ...prev, videos: [file.url] }));
        } else if (fileMode === 'document') {
            const currentDocs = gig.documents || [];
            if (currentDocs.length >= 2) {
                showNotification('error', 'Limit Reached', 'Max 2 documents allowed.');
                return;
            }
            setGig(prev => ({ ...prev, documents: [...(prev.documents || []), file.url] }));
        }
        setIsFilePickerOpen(false);
    };

    const getAcceptedTypes = () => {
        if (fileMode === 'image') return "image/*";
        if (fileMode === 'video') return "video/*";
        if (fileMode === 'document') return ".pdf,.doc,.docx,.txt";
        return "*";
    };

    const steps = ['Overview', 'Pricing', 'Description', 'Requirements', 'Gallery', 'Publish'];

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex justify-between mb-8 relative">
                <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -z-10 -translate-y-1/2 rounded"></div>
                {steps.map((label, idx) => (
                    <div key={idx} className={`flex flex-col items-center cursor-pointer ${step > idx + 1 ? 'text-green-600' : step === idx + 1 ? 'text-blue-600' : 'text-gray-400'}`} onClick={() => setStep(idx + 1)}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mb-2 transition-all ${step > idx + 1 ? 'bg-green-100' : step === idx + 1 ? 'bg-blue-600 text-white shadow-lg scale-110' : 'bg-gray-200'}`}>
                            {step > idx + 1 ? <CheckCircle className="w-5 h-5" /> : idx + 1}
                        </div>
                        <span className="text-xs font-medium">{label}</span>
                    </div>
                ))}
            </div>

            <div className="py-4 min-h-[500px]">
                {step === 1 && (
                    <div className="space-y-6 max-w-3xl mx-auto">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Gig Title</label>
                            <input
                                className="w-full border-gray-300 rounded-lg p-2.5 shadow-sm"
                                placeholder="I will..."
                                value={gig.title}
                                onChange={e => setGig({ ...gig, title: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Category</label>
                                <select className="w-full border-gray-300 rounded-lg p-2.5" value={gig.category} onChange={e => setGig({ ...gig, category: e.target.value, subcategory: '' })}>
                                    <option value="">Select Category</option>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Subcategory</label>
                                <select className="w-full border-gray-300 rounded-lg p-2.5" value={gig.subcategory} onChange={e => setGig({ ...gig, subcategory: e.target.value })} disabled={!availableSubs.length}>
                                    <option value="">Select Subcategory</option>
                                    {availableSubs.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-8 animate-fade-in">
                        {/* Pricing UI (Same as CreateGig) */}
                        <div className="overflow-x-auto border rounded-xl shadow-sm">
                            <table className="w-full text-sm border-collapse">
                                {/* ... table content identical to CreateGig ... */}
                                <thead>
                                    <tr className="bg-gray-50 text-left">
                                        <th className="p-4 w-1/4 border-r font-medium text-gray-500 uppercase text-xs tracking-wider"></th>
                                        {['Basic', 'Standard', 'Premium'].map((pkg, i) => (
                                            <th key={i} className="p-4 border-r last:border-r-0 text-center font-bold text-gray-900 bg-gray-50 text-lg">{pkg}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="p-4 border-r border-t font-medium text-gray-700 bg-gray-50">Description</td>
                                        {gig.packages?.map((pkg, i) => (
                                            <td key={i} className="p-2 border-r border-t last:border-r-0">
                                                <textarea className="w-full border-gray-200 rounded-lg text-sm p-3 focus:ring-blue-500 focus:border-blue-500 min-h-[100px]" placeholder="Describe package..." value={pkg.description} onChange={(e) => updatePackage(i, 'description', e.target.value)} />
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="p-4 border-r border-t font-medium text-gray-700 bg-gray-50">Delivery</td>
                                        {gig.packages?.map((pkg, i) => (
                                            <td key={i} className="p-2 border-r border-t last:border-r-0">
                                                <input type="number" className="w-full border-gray-200 rounded-lg p-2" value={pkg.deliveryDays} onChange={(e) => updatePackage(i, 'deliveryDays', parseInt(e.target.value))} />
                                            </td>
                                        ))}
                                    </tr>
                                    <tr>
                                        <td className="p-4 border-r border-t font-medium text-gray-700 bg-gray-50">Price ($)</td>
                                        {gig.packages?.map((pkg, i) => (
                                            <td key={i} className="p-2 border-r border-t last:border-r-0">
                                                <input type="number" className="w-full border-gray-200 rounded-lg p-2 font-bold" value={pkg.price} onChange={(e) => updatePackage(i, 'price', parseInt(e.target.value))} />
                                            </td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-900">Gig Extras</h3>
                                <button onClick={addExtra} className="text-blue-600 text-sm font-medium hover:underline flex items-center"><Plus className="w-4 h-4 mr-1" /> Add Extra</button>
                            </div>
                            {gig.extras?.map((extra, i) => (
                                <div key={i} className="flex gap-4 items-start mb-3 bg-gray-50 p-3 rounded-lg border border-gray-200 relative group">
                                    <button onClick={() => removeExtra(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                                    <input className="border-gray-300 rounded p-2 text-sm flex-1" placeholder="Title (e.g. Fast Delivery)" value={extra.title} onChange={e => updateExtra(i, 'title', e.target.value)} />
                                    <input className="border-gray-300 rounded p-2 text-sm w-24" placeholder="Price ($)" type="number" value={extra.price} onChange={e => updateExtra(i, 'price', parseInt(e.target.value))} />
                                    <input className="border-gray-300 rounded p-2 text-sm w-32" placeholder="Add. Days" type="number" value={extra.additional_days} onChange={e => updateExtra(i, 'additional_days' as any, parseInt(e.target.value))} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-6 max-w-3xl mx-auto">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                            <RichTextEditor value={gig.description || ''} onChange={(val) => setGig({ ...gig, description: val })} placeholder="Detailed description..." height="300px" />
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-gray-900">Frequently Asked Questions</h3>
                                <button onClick={addFAQ} className="text-blue-600 text-sm font-medium hover:underline flex items-center"><Plus className="w-4 h-4 mr-1" /> Add FAQ</button>
                            </div>
                            {gig.faqs?.map((faq, i) => (
                                <div key={i} className="mb-4 bg-gray-50 p-4 rounded-lg border border-gray-200 relative group">
                                    <button onClick={() => removeFAQ(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                    <input className="w-full mb-2 border-gray-300 rounded p-2 text-sm font-bold" placeholder="Question" value={faq.question} onChange={e => updateFAQ(i, 'question', e.target.value)} />
                                    <textarea className="w-full border-gray-300 rounded p-2 text-sm" placeholder="Answer" value={faq.answer} onChange={e => updateFAQ(i, 'answer', e.target.value)} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="max-w-3xl mx-auto space-y-6">
                        <div className="bg-blue-50 p-4 rounded-lg flex items-start text-sm text-blue-800">
                            <HelpCircle className="w-5 h-5 mr-3 flex-shrink-0" />
                            <p>Get all the information you need from buyers to get started. Add questions here.</p>
                        </div>
                        {gig.requirements?.map((req, i) => (
                            <div key={i} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm relative">
                                <button onClick={() => removeReq(i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                                <input className="w-full mb-3 border-gray-300 rounded p-2 text-sm" value={req.question} onChange={e => updateReq(i, 'question', e.target.value)} placeholder="Requirement question..." />
                                <div className="flex gap-4 text-sm">
                                    <select className="border-gray-300 rounded p-1" value={req.type} onChange={e => updateReq(i, 'type', e.target.value)}>
                                        <option value="text">Free Text</option>
                                        <option value="file">Attachment</option>
                                    </select>
                                    <label className="flex items-center"><input type="checkbox" checked={req.required} onChange={e => updateReq(i, 'required', e.target.checked)} className="mr-2" /> Required</label>
                                </div>
                            </div>
                        ))}
                        <button onClick={addReq} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-600 font-medium transition flex items-center justify-center">
                            <Plus className="w-4 h-4 mr-2" /> Add Requirement
                        </button>
                    </div>
                )}

                {step === 5 && (
                    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
                        {/* Images Section */}
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 mb-4">Gig Images (Max 6)</h3>
                            <div className="grid grid-cols-3 gap-6">
                                {(gig.images || []).map((img, i) => (
                                    <div key={i} className="aspect-[4/3] relative rounded-xl overflow-hidden border border-gray-200 group">
                                        <img src={img} className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => setGig({ ...gig, images: gig.images?.filter((_, idx) => idx !== i) })}
                                            className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow hover:bg-red-700 opacity-0 group-hover:opacity-100 transition"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {(gig.images?.length || 0) < 6 && (
                                    <div
                                        onClick={() => { setFileMode('image'); setIsFilePickerOpen(true); }}
                                        className="aspect-[4/3] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition text-gray-400 hover:text-indigo-600 hover:border-indigo-300"
                                    >
                                        <ImageIcon className="w-8 h-8 mb-2" />
                                        <span className="text-xs font-medium">Add Image</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Video Section */}
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 mb-4">Gig Video (Max 1)</h3>
                            {gig.videos && gig.videos.length > 0 ? (
                                <div className="aspect-video relative rounded-xl overflow-hidden border border-gray-200 bg-black w-full max-w-md">
                                    <video src={gig.videos[0]} controls className="w-full h-full" />
                                    <button
                                        onClick={() => setGig({ ...gig, videos: [] })}
                                        className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow hover:bg-red-700"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => { setFileMode('video'); setIsFilePickerOpen(true); }}
                                    className="aspect-video border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition text-gray-400 hover:text-indigo-600 hover:border-indigo-300 w-full max-w-md"
                                >
                                    <Video className="w-8 h-8 mb-2" />
                                    <span className="text-xs font-medium">Add Video</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {step === 6 && (
                    <div className="max-w-lg mx-auto text-center py-12 animate-fade-in">
                        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle className="w-12 h-12 text-green-600" />
                        </div>
                        <h2 className="text-3xl font-bold text-gray-900 mb-2">Ready to Launch!</h2>
                        <p className="text-gray-600 mb-8">
                            Click below to publish the gig immediately.
                        </p>
                        <button onClick={handleSave} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg flex items-center justify-center mx-auto">
                            <Save className="w-4 h-4 mr-2" /> Publish Gig
                        </button>
                    </div>
                )}
            </div>

            {/* Footer Nav */}
            {step < 6 && (
                <div className="flex justify-between border-t border-gray-200 pt-4">
                    <button
                        onClick={() => setStep(Math.max(1, step - 1))}
                        disabled={step === 1}
                        className="text-gray-600 hover:text-gray-900 font-medium px-4 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        Back
                    </button>
                    <button
                        onClick={() => setStep(step + 1)}
                        className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 shadow-sm"
                    >
                        Next
                    </button>
                </div>
            )}

            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelect={handleFileSelect}
                acceptedTypes={getAcceptedTypes()}
                filterType={fileMode === 'image' ? 'image' : fileMode === 'video' ? 'video' : 'document'}
                role="admin"
            />
        </div>
    );
};

const JobEditor = ({ categories, onComplete }: { categories: ListingCategory[], onComplete: () => void }) => {
    const { showNotification } = useNotification();
    const [availableSubs, setAvailableSubs] = useState<CategorySub[]>([]);
    const [saving, setSaving] = useState(false);
    const [job, setJob] = useState<Partial<Job>>({
        title: '',
        description: '',
        budget: '',
        type: 'Fixed Price',
        category: '',
        subcategory: '',
        experience_level: 'Intermediate',
        status: 'draft',
        admin_status: 'pending',
        client_name: 'Admin',
        tags: []
    });

    useEffect(() => {
        const cat = categories.find(c => c.name === job.category);
        setAvailableSubs(cat ? cat.subcategories : []);
    }, [job.category, categories]);

    const handleSave = async () => {
        if (!job.title || !job.category) {
            showNotification('alert', 'Required', 'Title and category are required.');
            return;
        }
        setSaving(true);
        try {
            await AdminService.saveJob(job as Job);
            showNotification('success', 'Saved', 'Job created successfully.');
            onComplete();
        } catch (error) {
            showNotification('error', 'Error', 'Failed to save job.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Job Title</label>
                <input
                    className="w-full border-gray-300 rounded-lg p-2.5 shadow-sm"
                    placeholder="Enter a job title..."
                    value={job.title}
                    onChange={e => setJob({ ...job, title: e.target.value })}
                />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Category</label>
                    <select
                        className="w-full border-gray-300 rounded-lg p-2.5 bg-white"
                        value={job.category}
                        onChange={e => setJob({ ...job, category: e.target.value, subcategory: '' })}
                    >
                        <option value="">Select Category</option>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Subcategory</label>
                    <select
                        className="w-full border-gray-300 rounded-lg p-2.5 bg-white"
                        value={job.subcategory}
                        onChange={e => setJob({ ...job, subcategory: e.target.value })}
                        disabled={!availableSubs.length}
                    >
                        <option value="">Select Subcategory</option>
                        {availableSubs.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Job Type</label>
                    <select
                        className="w-full border-gray-300 rounded-lg p-2.5 bg-white"
                        value={job.type}
                        onChange={e => setJob({ ...job, type: e.target.value as Job['type'] })}
                    >
                        <option value="Fixed Price">Fixed Price</option>
                        <option value="Hourly">Hourly</option>
                        <option value="Contract">Contract</option>
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Experience Level</label>
                    <select
                        className="w-full border-gray-300 rounded-lg p-2.5 bg-white"
                        value={job.experience_level}
                        onChange={e => setJob({ ...job, experience_level: e.target.value as Job['experience_level'] })}
                    >
                        <option value="Entry">Entry</option>
                        <option value="Intermediate">Intermediate</option>
                        <option value="Expert">Expert</option>
                    </select>
                </div>
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Budget</label>
                <input
                    className="w-full border-gray-300 rounded-lg p-2.5 shadow-sm"
                    placeholder="$1000 - $2000"
                    value={job.budget}
                    onChange={e => setJob({ ...job, budget: e.target.value })}
                />
            </div>
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                <textarea
                    className="w-full border-gray-300 rounded-lg p-3 min-h-[140px] shadow-sm"
                    placeholder="Describe the job requirements..."
                    value={job.description}
                    onChange={e => setJob({ ...job, description: e.target.value })}
                />
            </div>
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                    onClick={onComplete}
                    className="bg-white border border-gray-300 px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-70"
                >
                    {saving ? 'Saving...' : 'Save Job'}
                </button>
            </div>
        </div>
    );
};

export default ListingsManagementTab;
