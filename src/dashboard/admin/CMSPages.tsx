
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Save, ArrowLeft, Image as ImageIcon, Link as LinkIcon, Type, Eye, Upload, X, Code, Bold, Italic, List, Video, Folder, Globe, Settings } from 'lucide-react';
import { StaticPage, PageCategory, MediaItem, ContentBlock, BlogCategory, BlogSettings } from '../../types';
import { CMSService } from '../../services/cms';
import { useNotification } from '../../context/NotificationContext';

const TabButton = ({ id, label, icon: Icon, activeTab, setActiveTab, setView }: any) => (
    <button 
        onClick={() => { setActiveTab(id); setView('list'); }}
        className={`px-4 py-2 text-sm font-medium rounded-md flex items-center transition-all ${activeTab === id ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-200'}`}
    >
        <Icon className="w-4 h-4 mr-2" /> {label}
    </button>
);

const CMSPages = () => {
    const [pages, setPages] = useState<StaticPage[]>([]);
    const [categories, setCategories] = useState<PageCategory[]>([]);
    const [view, setView] = useState<'list' | 'editor' | 'categories'>('list');
    const [editingPage, setEditingPage] = useState<StaticPage | null>(null);
    const { showNotification } = useNotification();

    // Editor Refs
    const contentRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [p, c] = await Promise.all([CMSService.getPages(), CMSService.getPageCategories()]);
        setPages(p);
        setCategories(c);
    };

    // --- Page Actions ---

    const handleCreate = () => {
        setEditingPage({
            id: Math.random().toString(36).substr(2, 9),
            title: '',
            slug: '',
            content: '',
            blocks: [],
            status: 'DRAFT',
            visibility: 'public',
            updatedAt: new Date().toISOString(),
            categoryId: categories[0]?.id || '',
            seo: { metaTitle: '', metaDescription: '', metaKeywords: [] },
            images: [],
            videos: []
        });
        setView('editor');
    };

    const handleEdit = (page: StaticPage) => {
        setEditingPage({ 
            ...page, 
            seo: page.seo || { metaTitle: '', metaDescription: '' },
            images: page.images || [],
            videos: page.videos || []
        });
        setView('editor');
    };

    const handleSave = async () => {
        if (!editingPage || !editingPage.title) {
            showNotification('alert', 'Error', 'Page Title is required.');
            return;
        }
        
        // Auto-generate slug if empty
        if (!editingPage.slug) {
            editingPage.slug = editingPage.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        }

        try {
            await CMSService.savePage(editingPage);
            showNotification('success', 'Page Saved', 'Changes have been published to the database.');
            loadData();
            setView('list');
        } catch (e) {
            showNotification('alert', 'Error', 'Failed to save page.');
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Are you sure you want to delete this page? This cannot be undone.')) {
            await CMSService.deletePage(id);
            showNotification('success', 'Page Deleted', 'Page removed successfully.');
            loadData();
        }
    };

    // --- Editor Helpers ---

    const insertTag = (tag: string) => {
        if (!contentRef.current || !editingPage) return;
        const textarea = contentRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        
        let insertion = '';
        if (tag === 'img') insertion = `<img src="URL_HERE" alt="Image" class="w-full rounded-lg my-4" />`;
        else if (tag === 'video') insertion = `<div class="aspect-video my-4"><iframe src="EMBED_URL" class="w-full h-full"></iframe></div>`;
        else if (tag === 'a') insertion = `<a href="#" class="text-blue-600 hover:underline">Link Text</a>`;
        else insertion = `<${tag}>${text.substring(start, end) || 'Content'}</${tag}>`;

        const newContent = text.substring(0, start) + insertion + text.substring(end);
        setEditingPage({ ...editingPage, content: newContent });
        
        // Restore focus (simplified)
        setTimeout(() => textarea.focus(), 0);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
        if (e.target.files && e.target.files[0] && editingPage) {
            try {
                const media = await CMSService.uploadMedia(e.target.files[0]);
                if (type === 'image') {
                    setEditingPage({ 
                        ...editingPage, 
                        images: [...(editingPage.images || []), media.url],
                        // Auto-insert into content
                        content: editingPage.content + `\n<img src="${media.url}" alt="${media.name}" class="w-full rounded-lg my-4" />`
                    });
                } else {
                    setEditingPage({ 
                        ...editingPage, 
                        videos: [...(editingPage.videos || []), media.url] 
                    });
                }
                showNotification('success', 'Media Uploaded', 'File added to page gallery.');
            } catch (err) {
                showNotification('alert', 'Error', 'Upload failed.');
            }
        }
    };

    // --- Render ---

    return view === 'categories' ? (
        <CategoryManager categories={categories} reload={loadData} setView={setView} />
    ) : view === 'editor' && editingPage ? (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-900 flex items-center">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pages
                    </button>
                    <h2 className="text-xl font-bold">{editingPage.id ? 'Edit Page' : 'New Page'}</h2>
                    <div className="flex space-x-3">
                        <button className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 flex items-center"><Eye className="w-4 h-4 mr-2" /> Preview</button>
                        <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 shadow-sm">
                            <Save className="w-4 h-4 mr-2" /> {editingPage.status === 'PUBLISHED' ? 'Update Page' : 'Save Draft'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Editor */}
                    <div className="lg:col-span-2 space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Page Title *</label>
                            <input 
                                className="w-full border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                value={editingPage.title}
                                onChange={e => setEditingPage({ ...editingPage, title: e.target.value })}
                                placeholder="e.g., About Us"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium text-gray-700">Content (HTML Editor)</label>
                                <div className="flex space-x-1">
                                    <button onClick={() => insertTag('b')} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Bold"><Bold className="w-4 h-4" /></button>
                                    <button onClick={() => insertTag('i')} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Italic"><Italic className="w-4 h-4" /></button>
                                    <button onClick={() => insertTag('h2')} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Heading 2"><Type className="w-4 h-4" /></button>
                                    <button onClick={() => insertTag('ul')} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="List"><List className="w-4 h-4" /></button>
                                    <button onClick={() => insertTag('a')} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Link"><LinkIcon className="w-4 h-4" /></button>
                                    <button onClick={() => insertTag('img')} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Image Tag"><ImageIcon className="w-4 h-4" /></button>
                                    <button onClick={() => insertTag('video')} className="p-1.5 hover:bg-gray-100 rounded text-gray-600" title="Embed Video"><Video className="w-4 h-4" /></button>
                                </div>
                            </div>
                            <textarea 
                                ref={contentRef}
                                className="w-full border-gray-300 rounded-lg p-4 font-mono text-sm h-[500px] focus:ring-blue-500 focus:border-blue-500"
                                value={editingPage.content}
                                onChange={e => setEditingPage({ ...editingPage, content: e.target.value })}
                                placeholder="<p>Start writing your page content here...</p>"
                            />
                        </div>

                        {/* SEO Section */}
                        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center"><Globe className="w-4 h-4 mr-2" /> SEO Metadata</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Meta Title</label>
                                    <input 
                                        className="w-full border-gray-300 rounded-md"
                                        value={editingPage.seo?.metaTitle || ''}
                                        onChange={e => setEditingPage({ ...editingPage, seo: { ...editingPage.seo, metaTitle: e.target.value } })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Meta Description</label>
                                    <textarea 
                                        className="w-full border-gray-300 rounded-md h-20"
                                        value={editingPage.seo?.metaDescription || ''}
                                        onChange={e => setEditingPage({ ...editingPage, seo: { ...editingPage.seo, metaDescription: e.target.value } })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Status & Category */}
                        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-900 mb-4 flex items-center"><Settings className="w-4 h-4 mr-2" /> Settings</h4>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                    <select 
                                        className="w-full border-gray-300 rounded-lg"
                                        value={editingPage.status}
                                        onChange={e => setEditingPage({ ...editingPage, status: e.target.value as any })}
                                    >
                                        <option value="DRAFT">Draft</option>
                                        <option value="PUBLISHED">Published</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                    <select 
                                        className="w-full border-gray-300 rounded-lg"
                                        value={editingPage.categoryId || ''}
                                        onChange={e => setEditingPage({ ...editingPage, categoryId: e.target.value })}
                                    >
                                        <option value="">Uncategorized</option>
                                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Slug URL</label>
                                    <div className="flex rounded-md shadow-sm">
                                        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-xs">
                                            /p/
                                        </span>
                                        <input 
                                            type="text" 
                                            className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border-gray-300 text-sm" 
                                            value={editingPage.slug}
                                            onChange={e => setEditingPage({ ...editingPage, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Media Gallery */}
                        <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                            <h4 className="font-bold text-gray-900 mb-4 flex items-center"><ImageIcon className="w-4 h-4 mr-2" /> Media</h4>
                            
                            <div className="grid grid-cols-3 gap-2 mb-4">
                                {editingPage.images && editingPage.images.map((img, i) => (
                                    <div key={i} className="relative aspect-square bg-gray-100 rounded overflow-hidden group">
                                        <img src={img} className="w-full h-full object-cover" />
                                        <button 
                                            onClick={() => setEditingPage({...editingPage, images: editingPage.images?.filter((_, idx) => idx !== i)})}
                                            className="absolute top-0 right-0 bg-red-500 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <label className="block w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 transition">
                                <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                                <span className="text-xs text-gray-500">Upload Image</span>
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'image')} />
                            </label>
                        </div>
                    </div>
                </div>
            </div>
    ) : (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">CMS Pages</h2>
                <div className="flex space-x-2">
                    <button onClick={() => setView('categories')} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center shadow-sm">
                        <Folder className="w-4 h-4 mr-2" /> Manage Categories
                    </button>
                    <button onClick={handleCreate} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 shadow-sm">
                        <Plus className="w-4 h-4 mr-2" /> Create New Page
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium">
                        <tr>
                            <th className="px-6 py-4">Title</th>
                            <th className="px-6 py-4">Slug</th>
                            <th className="px-6 py-4">Category</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Last Updated</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {pages.map(page => (
                            <tr key={page.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-900">{page.title}</td>
                                <td className="px-6 py-4 text-gray-500">/p/{page.slug}</td>
                                <td className="px-6 py-4"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">{categories.find(c => c.id === page.categoryId)?.name || 'Uncategorized'}</span></td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${page.status === 'PUBLISHED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                        {page.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-500">{new Date(page.updatedAt).toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    <button onClick={() => handleEdit(page)} className="text-blue-600 hover:bg-blue-50 p-2 rounded transition-colors" title="Edit"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => handleDelete(page.id)} className="text-red-600 hover:bg-red-50 p-2 rounded transition-colors" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                        {pages.length === 0 && (
                            <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No pages found. Create one to get started.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- Category Manager ---

const CategoryManager = ({ categories, reload, setView }: { categories: PageCategory[], reload: () => void, setView: (v: any) => void }) => {
    const [cats, setCats] = useState<PageCategory[]>(categories);
    const [editingCat, setEditingCat] = useState<Partial<PageCategory> | null>(null);
    const { showNotification } = useNotification();
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);

    useEffect(() => {
        setCats(categories);
    }, [categories]);

    const saveCat = async () => {
        if (!editingCat || !editingCat.name) return;
        const slug = editingCat.slug || editingCat.name.toLowerCase().replace(/\s+/g, '-');
        await CMSService.savePageCategory({ ...editingCat, slug, status: 'active' } as PageCategory);
        const newCats = await CMSService.getPageCategories();
        setCats(newCats);
        setEditingCat(null);
        showNotification('success', 'Category Saved', 'Category updated successfully.');
        reload();
    };

    const deleteCat = async (id: string) => {
        if (confirm('Delete this category?')) {
            await CMSService.deletePageCategory(id);
            setCats(prev => prev.filter(c => c.id !== id));
            showNotification('success', 'Deleted', 'Category removed.');
            reload();
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0] && editingCat) {
            const media = await CMSService.uploadMedia(e.target.files[0]);
            setEditingCat({ ...editingCat, image: media.url });
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-900 flex items-center">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pages
                </button>
                <h2 className="text-xl font-bold">Page Categories</h2>
                <button onClick={() => setEditingCat({ name: '', description: '' })} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" /> Add Category
                </button>
            </div>

            {editingCat && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
                            <input className="w-full border-gray-300 rounded-md" value={editingCat.name} onChange={e => setEditingCat({ ...editingCat, name: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Slug</label>
                            <input className="w-full border-gray-300 rounded-md" value={editingCat.slug} onChange={e => setEditingCat({ ...editingCat, slug: e.target.value })} placeholder="Auto-generated if empty" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                        <input className="w-full border-gray-300 rounded-md" value={editingCat.description} onChange={e => setEditingCat({ ...editingCat, description: e.target.value })} />
                    </div>
                    <div className="flex items-center space-x-4">
                        <label className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                            <Upload className="w-4 h-4 mr-2 text-gray-500" />
                            <span className="text-sm">Upload Logo</span>
                            <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                        </label>
                        {editingCat.image && <img src={editingCat.image} className="h-10 w-10 object-cover rounded" alt="Logo" />}
                    </div>
                    <div className="flex justify-end space-x-2">
                        <button onClick={() => setEditingCat(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                        <button onClick={saveCat} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Save Category</button>
                    </div>
                </div>
            )}

            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500"><tr><th className="px-6 py-3">Category</th><th className="px-6 py-3">Slug</th><th className="px-6 py-3">Active</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y">
                    {cats.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium flex items-center">
                                {c.image && <img src={c.image} className="w-6 h-6 mr-2 rounded" />}
                                {c.name}
                            </td>
                            <td className="px-6 py-4 text-gray-500">{c.slug}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded text-xs ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {c.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                                <button onClick={() => setEditingCat(c)} className="text-blue-600 hover:bg-blue-50 p-1 rounded"><Edit2 className="w-4 h-4" /></button>
                                <button onClick={() => deleteCat(c.id)} className="text-red-600 hover:bg-red-50 p-1 rounded"><Trash2 className="w-4 h-4" /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default CMSPages;
