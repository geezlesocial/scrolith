
import React, { useState, useEffect } from 'react';
import { 
    Plus, Edit2, Trash2, Save, ArrowLeft, Image as ImageIcon, Eye, Search, Filter, 
    Settings, List, Layout, Globe, Calendar, CheckCircle, XCircle, Type, 
    MoreVertical, Video, Quote, Code, ArrowUp, ArrowDown, Upload
} from 'lucide-react';
import { BlogPost, BlogCategory, BlogSettings, ContentBlock } from '../../types';
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

const BlogManagement = () => {
    const [activeTab, setActiveTab] = useState<'posts' | 'categories' | 'settings'>('posts');
    const [view, setView] = useState<'list' | 'editor'>('list');
    
    // Data States
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [categories, setCategories] = useState<BlogCategory[]>([]);
    const [settings, setSettings] = useState<BlogSettings | null>(null);
    const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
    
    const { showNotification } = useNotification();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [p, c, s] = await Promise.all([
            CMSService.getBlogPosts(),
            CMSService.getBlogCategories(),
            CMSService.getBlogSettings()
        ]);
        setPosts(p);
        setCategories(c);
        setSettings(s);
    };

    // --- Post Actions ---

    const handleCreatePost = () => {
        setEditingPost({
            id: Math.random().toString(36).substr(2, 9),
            title: '',
            slug: '',
            content: '',
            blocks: [{ id: 'b1', type: 'text', content: 'Start writing your amazing story...' }],
            excerpt: '',
            shortDescription: '',
            featuredImage: '',
            status: 'draft',
            visibility: 'public',
            authorName: 'Admin', // In real app, from user context
            categoryId: categories[0]?.id || '',
            categoryName: categories[0]?.name || '',
            tags: [],
            views: 0,
            seo: { metaTitle: '', metaDescription: '', metaKeywords: [], noIndex: false },
            allowComments: true,
            isFeatured: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
        setView('editor');
    };

    const handleEditPost = (post: BlogPost) => {
        setEditingPost({ 
            ...post, 
            blocks: post.blocks && post.blocks.length > 0 ? post.blocks : [{ id: 'b1', type: 'text', content: post.content || '' }]
        });
        setView('editor');
    };

    const handleDeletePost = async (id: string) => {
        if (confirm('Are you sure you want to delete this post?')) {
            await CMSService.deleteBlogPost(id);
            showNotification('success', 'Deleted', 'Blog post removed.');
            loadData();
        }
    };

    const handleSavePost = async () => {
        if (!editingPost) return;
        if (!editingPost.title) {
            showNotification('alert', 'Missing Title', 'Please enter a blog title.');
            return;
        }
        
        // Auto-generate slug if empty
        let slug = editingPost.slug;
        if (!slug) {
            slug = editingPost.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        }

        const updatedPost = { ...editingPost, slug };
        await CMSService.saveBlogPost(updatedPost);
        showNotification('success', 'Saved', 'Blog post updated successfully.');
        loadData();
        setView('list');
    };

    if (view === 'editor' && editingPost) {
        return (
            <BlogEditor 
                post={editingPost} 
                setPost={setEditingPost} 
                onSave={handleSavePost} 
                onCancel={() => setView('list')} 
                categories={categories}
            />
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Blog Management</h2>
                    <p className="text-sm text-gray-500">Create, edit, and manage your content.</p>
                </div>
                {activeTab === 'posts' && (
                    <button onClick={handleCreatePost} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 transition-colors shadow-sm">
                        <Plus className="w-4 h-4 mr-2" /> Add New Post
                    </button>
                )}
            </div>

            <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
                <TabButton id="posts" label="All Posts" icon={List} activeTab={activeTab} setActiveTab={setActiveTab} setView={setView} />
                <TabButton id="categories" label="Categories" icon={Layout} activeTab={activeTab} setActiveTab={setActiveTab} setView={setView} />
                <TabButton id="settings" label="Settings" icon={Settings} activeTab={activeTab} setActiveTab={setActiveTab} setView={setView} />
            </div>

            <div className="animate-fade-in">
                {activeTab === 'posts' && <PostsList posts={posts} onEdit={handleEditPost} onDelete={handleDeletePost} />}
                {activeTab === 'categories' && <CategoriesManager categories={categories} reload={loadData} />}
                {activeTab === 'settings' && settings && <BlogSettingsForm settings={settings} reload={loadData} />}
            </div>
        </div>
    );
};

// --- 1. POSTS LIST ---

const PostsList = ({ posts, onEdit, onDelete }: { posts: BlogPost[], onEdit: (p: BlogPost) => void, onDelete: (id: string) => void }) => {
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');

    const filtered = posts.filter(p => {
        if (filter !== 'all' && p.status !== filter) return false;
        if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Search posts..." 
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
                    {['all', 'published', 'draft', 'scheduled'].map(f => (
                        <button 
                            key={f} 
                            onClick={() => setFilter(f)} 
                            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize whitespace-nowrap transition-colors ${filter === f ? 'bg-blue-100 text-blue-700' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium">
                        <tr>
                            <th className="px-6 py-4">Title</th>
                            <th className="px-6 py-4">Category</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Author</th>
                            <th className="px-6 py-4">Views</th>
                            <th className="px-6 py-4">Last Updated</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filtered.length === 0 ? (
                            <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">No posts found matching your criteria.</td></tr>
                        ) : filtered.map(post => (
                            <tr key={post.id} className="hover:bg-gray-50 group">
                                <td className="px-6 py-4">
                                    <div className="flex items-center">
                                        {post.featuredImage ? (
                                            <img src={post.featuredImage} className="w-10 h-10 rounded object-cover mr-3 bg-gray-200" />
                                        ) : (
                                            <div className="w-10 h-10 rounded bg-gray-200 mr-3 flex items-center justify-center text-gray-400"><ImageIcon className="w-5 h-5" /></div>
                                        )}
                                        <div>
                                            <div className="font-medium text-gray-900 line-clamp-1">{post.title}</div>
                                            <div className="text-xs text-gray-500 truncate max-w-[150px]">/{post.slug}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">{post.categoryName}</span></td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
                                        post.status === 'published' ? 'bg-green-100 text-green-700' : 
                                        post.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                                        'bg-yellow-100 text-yellow-700'
                                    }`}>
                                        {post.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-600">{post.authorName}</td>
                                <td className="px-6 py-4 text-gray-500">{post.views}</td>
                                <td className="px-6 py-4 text-gray-500">{new Date(post.updatedAt).toLocaleDateString()}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => window.open(`/blog/${post.slug}`, '_blank')} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded" title="View"><Eye className="w-4 h-4" /></button>
                                        <button onClick={() => onEdit(post)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => onDelete(post.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- 2. EDITOR COMPONENT ---

const BlogEditor = ({ post, setPost, onSave, onCancel, categories }: { 
    post: BlogPost, 
    setPost: (p: BlogPost) => void, 
    onSave: () => void, 
    onCancel: () => void, 
    categories: BlogCategory[] 
}) => {
    
    // --- Block Helpers ---
    const addBlock = (type: ContentBlock['type']) => {
        const newBlock: ContentBlock = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            content: '',
            settings: {}
        };
        setPost({ ...post, blocks: [...post.blocks, newBlock] });
    };

    const updateBlock = (id: string, updates: Partial<ContentBlock>) => {
        setPost({
            ...post,
            blocks: post.blocks.map(b => b.id === id ? { ...b, ...updates } : b)
        });
    };

    const removeBlock = (id: string) => {
        setPost({ ...post, blocks: post.blocks.filter(b => b.id !== id) });
    };

    const moveBlock = (index: number, direction: 'up' | 'down') => {
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === post.blocks.length - 1)) return;
        const newBlocks = [...post.blocks];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        [newBlocks[index], newBlocks[swapIndex]] = [newBlocks[swapIndex], newBlocks[index]];
        setPost({ ...post, blocks: newBlocks });
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'banner' | 'block', blockId?: string) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const media = await CMSService.uploadMedia(e.target.files[0]);
                if (field === 'banner') {
                    setPost({ ...post, featuredImage: media.url });
                } else if (field === 'block' && blockId) {
                    updateBlock(blockId, { content: media.url });
                }
            } catch (err) {
                console.error("Upload failed", err);
            }
        }
    };

    return (
        <div className="bg-gray-50 min-h-screen pb-20">
            {/* Toolbar Header */}
            <div className="sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center shadow-sm">
                <div className="flex items-center">
                    <button onClick={onCancel} className="mr-4 text-gray-500 hover:text-gray-900 p-1 rounded hover:bg-gray-100 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">{post.title || 'Untitled Post'}</h2>
                        <span className={`text-xs px-2 py-0.5 rounded uppercase font-bold ${post.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {post.status}
                        </span>
                    </div>
                </div>
                <div className="flex space-x-3">
                    <button className="text-gray-600 hover:text-gray-900 px-3 py-2 text-sm font-medium"><Eye className="w-4 h-4 inline mr-1" /> Preview</button>
                    <button onClick={onSave} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center shadow-md transition-transform active:scale-95">
                        <Save className="w-4 h-4 mr-2" /> {post.status === 'published' ? 'Update' : 'Save Draft'}
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Main Editor Column */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Basic Info */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
                        <input 
                            type="text" 
                            placeholder="Enter Blog Post Title..." 
                            className="w-full text-3xl font-bold border-none placeholder-gray-300 focus:ring-0 px-0"
                            value={post.title}
                            onChange={e => setPost({...post, title: e.target.value})}
                        />
                        <textarea 
                            placeholder="Short description for previews and SEO..." 
                            className="w-full border-none text-gray-500 focus:ring-0 px-0 resize-none h-16 text-lg"
                            value={post.shortDescription}
                            onChange={e => setPost({...post, shortDescription: e.target.value})}
                        />
                    </div>

                    {/* Block Editor Area */}
                    <div className="space-y-4">
                        {post.blocks.map((block, index) => (
                            <div key={block.id} className="group relative bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:border-blue-300 transition-colors">
                                {/* Block Controls */}
                                <div className="absolute right-2 top-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white shadow-sm border border-gray-100 rounded-md p-1 z-10">
                                    <button onClick={() => moveBlock(index, 'up')} disabled={index === 0} className="p-1 hover:bg-gray-100 rounded text-gray-500"><ArrowUp className="w-3 h-3" /></button>
                                    <button onClick={() => moveBlock(index, 'down')} disabled={index === post.blocks.length - 1} className="p-1 hover:bg-gray-100 rounded text-gray-500"><ArrowDown className="w-3 h-3" /></button>
                                    <button onClick={() => removeBlock(block.id)} className="p-1 hover:bg-red-50 text-red-500 rounded"><Trash2 className="w-3 h-3" /></button>
                                </div>

                                {/* Block Content Renderer */}
                                {block.type === 'heading' && (
                                    <input 
                                        className="w-full font-bold text-xl border-none focus:ring-0 px-0" 
                                        placeholder="Heading..."
                                        value={block.content}
                                        onChange={e => updateBlock(block.id, { content: e.target.value })}
                                    />
                                )}
                                {block.type === 'text' && (
                                    <textarea 
                                        className="w-full border-none focus:ring-0 px-0 resize-y min-h-[100px]"
                                        placeholder="Type your text here..."
                                        value={block.content}
                                        onChange={e => updateBlock(block.id, { content: e.target.value })}
                                    />
                                )}
                                {block.type === 'image' && (
                                    <div className="space-y-2">
                                        {block.content ? (
                                            <div className="relative">
                                                <img src={block.content} className="w-full h-auto rounded-lg" />
                                                <button onClick={() => updateBlock(block.id, { content: '' })} className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full"><XCircle className="w-4 h-4"/></button>
                                            </div>
                                        ) : (
                                            <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                                                <ImageIcon className="w-8 h-8 text-gray-400 mb-2" />
                                                <span className="text-sm text-gray-500">Upload Image</span>
                                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'block', block.id)} />
                                            </label>
                                        )}
                                        <input 
                                            className="w-full text-xs text-center border-none focus:ring-0 text-gray-400" 
                                            placeholder="Image Caption (optional)"
                                            value={block.settings?.caption || ''}
                                            onChange={e => updateBlock(block.id, { settings: { ...block.settings, caption: e.target.value } })}
                                        />
                                    </div>
                                )}
                                {block.type === 'quote' && (
                                    <div className="flex">
                                        <div className="w-1 bg-blue-600 mr-4 rounded-full"></div>
                                        <textarea 
                                            className="w-full border-none focus:ring-0 px-0 text-lg italic text-gray-700"
                                            placeholder="Enter quote..."
                                            value={block.content}
                                            onChange={e => updateBlock(block.id, { content: e.target.value })}
                                        />
                                    </div>
                                )}
                                {block.type === 'code' && (
                                    <div className="bg-gray-900 rounded-lg p-4">
                                        <textarea 
                                            className="w-full bg-transparent text-green-400 font-mono text-sm border-none focus:ring-0 px-0 resize-y min-h-[100px]"
                                            placeholder="// Enter code snippet..."
                                            value={block.content}
                                            onChange={e => updateBlock(block.id, { content: e.target.value })}
                                        />
                                    </div>
                                )}
                                {/* Label for Block Type */}
                                <div className="absolute top-2 left-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{block.type}</span>
                                </div>
                            </div>
                        ))}

                        {/* Add Block Bar */}
                        <div className="flex justify-center space-x-2 py-4 border-t-2 border-dashed border-gray-200 mt-8">
                            <button onClick={() => addBlock('text')} className="p-2 rounded-full bg-white border border-gray-200 shadow-sm hover:text-blue-600 hover:border-blue-300 transition-all flex flex-col items-center w-16 text-xs text-gray-500 gap-1"><Type className="w-4 h-4" /> Text</button>
                            <button onClick={() => addBlock('heading')} className="p-2 rounded-full bg-white border border-gray-200 shadow-sm hover:text-blue-600 hover:border-blue-300 transition-all flex flex-col items-center w-16 text-xs text-gray-500 gap-1"><Type className="w-4 h-4 font-bold" /> Heading</button>
                            <button onClick={() => addBlock('image')} className="p-2 rounded-full bg-white border border-gray-200 shadow-sm hover:text-blue-600 hover:border-blue-300 transition-all flex flex-col items-center w-16 text-xs text-gray-500 gap-1"><ImageIcon className="w-4 h-4" /> Image</button>
                            <button onClick={() => addBlock('quote')} className="p-2 rounded-full bg-white border border-gray-200 shadow-sm hover:text-blue-600 hover:border-blue-300 transition-all flex flex-col items-center w-16 text-xs text-gray-500 gap-1"><Quote className="w-4 h-4" /> Quote</button>
                            <button onClick={() => addBlock('code')} className="p-2 rounded-full bg-white border border-gray-200 shadow-sm hover:text-blue-600 hover:border-blue-300 transition-all flex flex-col items-center w-16 text-xs text-gray-500 gap-1"><Code className="w-4 h-4" /> Code</button>
                        </div>
                    </div>
                </div>

                {/* Sidebar Column */}
                <div className="space-y-6">
                    {/* Publishing */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="font-bold text-gray-900 mb-4 flex items-center"><Globe className="w-4 h-4 mr-2" /> Publishing</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                                <select 
                                    className="w-full border-gray-300 rounded-lg text-sm"
                                    value={post.status}
                                    onChange={e => setPost({...post, status: e.target.value as any})}
                                >
                                    <option value="draft">Draft</option>
                                    <option value="published">Published</option>
                                    <option value="scheduled">Scheduled</option>
                                </select>
                            </div>
                            {post.status === 'scheduled' && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Schedule Date</label>
                                    <input 
                                        type="datetime-local" 
                                        className="w-full border-gray-300 rounded-lg text-sm"
                                        value={post.scheduledAt || ''}
                                        onChange={e => setPost({...post, scheduledAt: e.target.value})}
                                    />
                                </div>
                            )}
                            <div className="flex flex-col space-y-2 pt-2">
                                <label className="flex items-center space-x-2 text-sm cursor-pointer">
                                    <input type="checkbox" checked={post.isFeatured} onChange={e => setPost({...post, isFeatured: e.target.checked})} className="rounded text-blue-600" />
                                    <span>Feature on Homepage</span>
                                </label>
                                <label className="flex items-center space-x-2 text-sm cursor-pointer">
                                    <input type="checkbox" checked={post.allowComments} onChange={e => setPost({...post, allowComments: e.target.checked})} className="rounded text-blue-600" />
                                    <span>Allow Comments</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Taxonomy */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="font-bold text-gray-900 mb-4 flex items-center"><Layout className="w-4 h-4 mr-2" /> Categorization</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label>
                                <select 
                                    className="w-full border-gray-300 rounded-lg text-sm"
                                    value={post.categoryId}
                                    onChange={e => {
                                        const cat = categories.find(c => c.id === e.target.value);
                                        setPost({...post, categoryId: e.target.value, categoryName: cat?.name || ''});
                                    }}
                                >
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">URL Slug</label>
                                <input 
                                    className="w-full border-gray-300 rounded-lg text-sm bg-gray-50"
                                    value={post.slug}
                                    onChange={e => setPost({...post, slug: e.target.value.toLowerCase().replace(/\s+/g, '-')})}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Banner Image */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="font-bold text-gray-900 mb-4 flex items-center"><ImageIcon className="w-4 h-4 mr-2" /> Banner Image</h3>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:bg-gray-50 transition relative overflow-hidden h-40 flex items-center justify-center">
                            {post.featuredImage ? (
                                <>
                                    <img src={post.featuredImage} className="absolute inset-0 w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <button onClick={() => setPost({...post, featuredImage: ''})} className="bg-white text-red-600 p-2 rounded-full shadow-sm"><Trash2 className="w-4 h-4"/></button>
                                    </div>
                                </>
                            ) : (
                                <div className="pointer-events-none">
                                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                    <span className="text-xs text-gray-500">1300 x 650 Recommended</span>
                                </div>
                            )}
                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={e => handleImageUpload(e, 'banner')} />
                        </div>
                    </div>

                    {/* SEO Panel */}
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="font-bold text-gray-900 mb-4 flex items-center"><Search className="w-4 h-4 mr-2" /> SEO Metadata</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Meta Title</label>
                                <input 
                                    className="w-full border-gray-300 rounded-lg text-sm"
                                    value={post.seo.metaTitle}
                                    onChange={e => setPost({...post, seo: {...post.seo, metaTitle: e.target.value}})}
                                    placeholder="Google Search Title"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Meta Description</label>
                                <textarea 
                                    className="w-full border-gray-300 rounded-lg text-sm h-24"
                                    value={post.seo.metaDescription}
                                    onChange={e => setPost({...post, seo: {...post.seo, metaDescription: e.target.value}})}
                                    placeholder="Search Engine Description..."
                                />
                            </div>
                            <label className="flex items-center space-x-2 text-sm cursor-pointer">
                                <input type="checkbox" checked={post.seo.noIndex} onChange={e => setPost({...post, seo: {...post.seo, noIndex: e.target.checked}})} className="rounded text-red-600 focus:ring-red-500" />
                                <span>No-Index (Hide from Google)</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- 3. CATEGORIES MANAGER ---

const CategoriesManager = ({ categories, reload }: { categories: BlogCategory[], reload: () => void }) => {
    const [editingCat, setEditingCat] = useState<Partial<BlogCategory> | null>(null);
    const { showNotification } = useNotification();

    const handleSave = async () => {
        if (!editingCat?.name) return;
        const slug = editingCat.slug || editingCat.name.toLowerCase().replace(/\s+/g, '-');
        await CMSService.saveBlogCategory({ ...editingCat, slug, status: editingCat.status || 'active', count: editingCat.count || 0 } as BlogCategory);
        showNotification('success', 'Saved', 'Category updated.');
        setEditingCat(null);
        reload();
    };

    const handleDelete = async (id: string) => {
        if (confirm('Delete this category?')) {
            await CMSService.deleteBlogCategory(id);
            showNotification('info', 'Deleted', 'Category removed.');
            reload();
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-gray-900">Blog Categories</h3>
                <button onClick={() => setEditingCat({ name: '', description: '', status: 'active' })} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" /> Add Category
                </button>
            </div>

            {editingCat && (
                <div className="mb-8 bg-gray-50 p-6 rounded-xl border border-gray-200 animate-fade-in">
                    <h4 className="font-bold text-sm text-gray-700 mb-4">{editingCat.id ? 'Edit Category' : 'New Category'}</h4>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
                            <input className="w-full border-gray-300 rounded-lg" value={editingCat.name} onChange={e => setEditingCat({...editingCat, name: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Slug</label>
                            <input className="w-full border-gray-300 rounded-lg" value={editingCat.slug} onChange={e => setEditingCat({...editingCat, slug: e.target.value})} placeholder="Auto-generated" />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                            <input className="w-full border-gray-300 rounded-lg" value={editingCat.description} onChange={e => setEditingCat({...editingCat, description: e.target.value})} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setEditingCat(null)} className="px-4 py-2 text-gray-600 bg-white border border-gray-300 rounded-lg">Cancel</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Save Category</button>
                    </div>
                </div>
            )}

            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500"><tr><th className="px-6 py-3">Name</th><th className="px-6 py-3">Slug</th><th className="px-6 py-3">Posts</th><th className="px-6 py-3">Status</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y">
                    {categories.map(cat => (
                        <tr key={cat.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{cat.name}</td>
                            <td className="px-6 py-4 text-gray-500">{cat.slug}</td>
                            <td className="px-6 py-4">{cat.count}</td>
                            <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs uppercase ${cat.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{cat.status}</span></td>
                            <td className="px-6 py-4 text-right space-x-2">
                                <button onClick={() => setEditingCat(cat)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"><Edit2 className="w-4 h-4" /></button>
                                <button onClick={() => handleDelete(cat.id)} className="text-red-600 hover:bg-red-50 p-1.5 rounded"><Trash2 className="w-4 h-4" /></button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// --- 4. BLOG SETTINGS ---

const BlogSettingsForm = ({ settings, reload }: { settings: BlogSettings, reload: () => void }) => {
    const [formData, setFormData] = useState(settings);
    const { showNotification } = useNotification();

    const handleSave = async () => {
        await CMSService.updateBlogSettings(formData);
        showNotification('success', 'Updated', 'Blog settings saved.');
        reload();
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
            <h3 className="font-bold text-lg text-gray-900 mb-6">Global Blog Configuration</h3>
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Blog Page Title</label>
                    <input className="w-full border-gray-300 rounded-lg" value={formData.pageTitle} onChange={e => setFormData({...formData, pageTitle: e.target.value})} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Meta Description (Global)</label>
                    <textarea className="w-full border-gray-300 rounded-lg h-24" value={formData.metaDescription} onChange={e => setFormData({...formData, metaDescription: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Posts Per Page</label>
                        <input type="number" className="w-full border-gray-300 rounded-lg" value={formData.postsPerPage} onChange={e => setFormData({...formData, postsPerPage: parseInt(e.target.value)})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Default Banner URL</label>
                        <input className="w-full border-gray-300 rounded-lg" value={formData.bannerImage} onChange={e => setFormData({...formData, bannerImage: e.target.value})} />
                    </div>
                </div>
                <div className="flex space-x-6 pt-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" checked={formData.showAuthor} onChange={e => setFormData({...formData, showAuthor: e.target.checked})} className="rounded text-blue-600" />
                        <span className="text-sm font-medium text-gray-700">Show Author Info</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="checkbox" checked={formData.showDate} onChange={e => setFormData({...formData, showDate: e.target.checked})} className="rounded text-blue-600" />
                        <span className="text-sm font-medium text-gray-700">Show Publish Date</span>
                    </label>
                </div>
                <div className="pt-4 flex justify-end">
                    <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-sm transition-transform active:scale-95">
                        Save Configuration
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BlogManagement;
