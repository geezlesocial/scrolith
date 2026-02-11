
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, Save, ArrowLeft, Image as ImageIcon, Link as LinkIcon, Eye, Upload, X, Code, Bold, Italic, List, Video, Folder, Globe, Settings, Mail, Underline, ListOrdered, Quote, Heading1, Heading2, Pilcrow } from 'lucide-react';
import { StaticPage, PageCategory, MediaItem, ContentBlock, BlogCategory, BlogSettings, AnswersPageConfig, GuidesPageConfig, HirePageConfig, FreelancerPageConfig } from '../../types';
import { CMSService } from '../../services/cms';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import FilePickerModal from '../shared/FilePickerModal';
import AuthPagesManager from './AuthPagesManager';
import SystemMessagesManager from './SystemMessagesManager';

type ContentEditorMode = 'html' | 'plain';

const escapeHtml = (value: string) =>
    String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const decodeEntities = (value: string) => {
    if (typeof window === 'undefined') return value;
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
};

const htmlToPlainText = (html: string) => {
    const source = String(html || '').replace(/\r\n/g, '\n');
    const withBreaks = source
        .replace(/<\s*br\s*\/?\s*>/gi, '\n')
        .replace(/<\s*\/\s*(p|div|h1|h2|h3|h4|h5|h6|blockquote|pre)\s*>/gi, '\n')
        .replace(/<\s*li[^>]*>/gi, '\n- ')
        .replace(/<\s*\/\s*li\s*>/gi, '');
    const withoutTags = withBreaks.replace(/<[^>]*>/g, '');
    return decodeEntities(withoutTags)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const autoLinkText = (text: string) =>
    text.replace(
        /((https?:\/\/|www\.)[^\s<]+)/gi,
        (match) => `<a href="${match.startsWith('http') ? match : `https://${match}`}" target="_blank" rel="noopener noreferrer">${match}</a>`
    );

const formatInlinePlainText = (line: string) => {
    let output = escapeHtml(line);
    output = output.replace(/`([^`]+)`/g, '<code>$1</code>');
    output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    output = output.replace(/__([^_]+)__/g, '<u>$1</u>');
    output = autoLinkText(output);
    return output;
};

const plainTextToHtml = (plainText: string) => {
    const lines = String(plainText || '').replace(/\r\n/g, '\n').split('\n');
    const html: string[] = [];
    let ulItems: string[] = [];
    let olItems: string[] = [];

    const flushUl = () => {
        if (!ulItems.length) return;
        html.push(`<ul>\n${ulItems.map((item) => `  <li>${item}</li>`).join('\n')}\n</ul>`);
        ulItems = [];
    };
    const flushOl = () => {
        if (!olItems.length) return;
        html.push(`<ol>\n${olItems.map((item) => `  <li>${item}</li>`).join('\n')}\n</ol>`);
        olItems = [];
    };
    const flushLists = () => {
        flushUl();
        flushOl();
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            flushLists();
            continue;
        }

        if (/^[-*]\s+/.test(line)) {
            flushOl();
            ulItems.push(formatInlinePlainText(line.replace(/^[-*]\s+/, '')));
            continue;
        }
        if (/^\d+\.\s+/.test(line)) {
            flushUl();
            olItems.push(formatInlinePlainText(line.replace(/^\d+\.\s+/, '')));
            continue;
        }

        flushLists();
        if (/^###\s+/.test(line)) {
            html.push(`<h3>${formatInlinePlainText(line.replace(/^###\s+/, ''))}</h3>`);
        } else if (/^##\s+/.test(line)) {
            html.push(`<h2>${formatInlinePlainText(line.replace(/^##\s+/, ''))}</h2>`);
        } else if (/^#\s+/.test(line)) {
            html.push(`<h1>${formatInlinePlainText(line.replace(/^#\s+/, ''))}</h1>`);
        } else if (/^>\s+/.test(line)) {
            html.push(`<blockquote>${formatInlinePlainText(line.replace(/^>\s+/, ''))}</blockquote>`);
        } else {
            html.push(`<p>${formatInlinePlainText(line)}</p>`);
        }
    }

    flushLists();
    if (!html.length) return '<p></p>';
    return html.join('\n');
};

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
    const [view, setView] = useState<'list' | 'editor' | 'categories' | 'auth-pages' | 'system-messages' | 'answers' | 'guides' | 'hire' | 'freelancer'>('list');
    const [editingPage, setEditingPage] = useState<StaticPage | null>(null);
    const [editorMode, setEditorMode] = useState<ContentEditorMode>('html');
    const [plainTextDraft, setPlainTextDraft] = useState('');
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [filePickerType, setFilePickerType] = useState<'image' | 'video'>('image');
    const { showNotification } = useNotification();
    const { socket } = useSocket();

    // Editor Refs
    const contentRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (!socket) return;
        const handleRefresh = () => loadData();
        socket.on('cms:pages_updated', handleRefresh);
        socket.on('cms:page_updated', handleRefresh);
        socket.on('cms:page_deleted', handleRefresh);
        socket.on('cms:categories_updated', handleRefresh);
        socket.on('cms:category_updated', handleRefresh);
        socket.on('cms:category_deleted', handleRefresh);
        return () => {
            socket.off('cms:pages_updated', handleRefresh);
            socket.off('cms:page_updated', handleRefresh);
            socket.off('cms:page_deleted', handleRefresh);
            socket.off('cms:categories_updated', handleRefresh);
            socket.off('cms:category_updated', handleRefresh);
            socket.off('cms:category_deleted', handleRefresh);
        };
    }, [socket]);

    const loadData = async () => {
        try {
            const [p, c] = await Promise.all([CMSService.getPages(), CMSService.getPageCategories()]);
            setPages(p);
            setCategories(c);
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to load CMS pages.');
            setPages([]);
            setCategories([]);
        }
    };

    // --- Page Actions ---

    const handleCreate = () => {
        const initialContent = '<p>Start writing your page content here...</p>';
        setEditingPage({
            id: Math.random().toString(36).substr(2, 9),
            title: '',
            slug: '',
            content: initialContent,
            blocks: [],
            status: 'DRAFT',
            visibility: 'public',
            updatedAt: new Date().toISOString(),
            categoryId: categories[0]?.id || '',
            seo: { metaTitle: '', metaDescription: '', metaKeywords: [] },
            images: [],
            videos: []
        });
        setEditorMode('html');
        setPlainTextDraft(htmlToPlainText(initialContent));
        setView('editor');
    };

    const handleEdit = (page: StaticPage) => {
        const content = String(page?.content || '<p></p>');
        setEditingPage({ 
            ...page, 
            content,
            seo: page.seo || { metaTitle: '', metaDescription: '' },
            images: page.images || [],
            videos: page.videos || []
        });
        setPlainTextDraft(htmlToPlainText(content));
        setEditorMode('html');
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

    const handlePreview = async () => {
        if (!editingPage || !editingPage.title) {
            showNotification('alert', 'Error', 'Page Title is required to preview.');
            return;
        }

        const slug = editingPage.slug || editingPage.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        const payload = { ...editingPage, slug };

        try {
            setIsPreviewing(true);
            const saved = await CMSService.savePage(payload);
            setEditingPage({ ...payload, ...(saved || {}) });
            showNotification('success', 'Preview Ready', 'Opening preview in a new tab.');
            const previewSlug = saved?.slug || payload.slug;
            window.open(`/p/${previewSlug}`, '_blank', 'noopener,noreferrer');
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to prepare preview.');
        } finally {
            setIsPreviewing(false);
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

    const updateContentFromPlainText = (value: string) => {
        if (!editingPage) return;
        setPlainTextDraft(value);
        setEditingPage({ ...editingPage, content: plainTextToHtml(value) });
    };

    const insertTextAtSelection = (before: string, after: string = '', fallbackText = 'Content') => {
        if (!contentRef.current || !editingPage) return;
        const textarea = contentRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const source = editorMode === 'plain' ? plainTextDraft : editingPage.content;
        const selected = source.substring(start, end) || fallbackText;
        const next = `${source.substring(0, start)}${before}${selected}${after}${source.substring(end)}`;
        if (editorMode === 'plain') {
            updateContentFromPlainText(next);
        } else {
            setEditingPage({ ...editingPage, content: next });
        }
        setTimeout(() => {
            textarea.focus();
            const cursorStart = start + before.length;
            const cursorEnd = cursorStart + selected.length;
            textarea.setSelectionRange(cursorStart, cursorEnd);
        }, 0);
    };

    const insertTag = (tag: string) => {
        if (!editingPage) return;
        const htmlActions: Record<string, () => void> = {
            b: () => insertTextAtSelection('<strong>', '</strong>', 'Bold text'),
            i: () => insertTextAtSelection('<em>', '</em>', 'Italic text'),
            u: () => insertTextAtSelection('<u>', '</u>', 'Underlined text'),
            p: () => insertTextAtSelection('<p>', '</p>', 'Paragraph text'),
            h1: () => insertTextAtSelection('<h1>', '</h1>', 'Main heading'),
            h2: () => insertTextAtSelection('<h2>', '</h2>', 'Section heading'),
            ul: () => insertTextAtSelection('<ul>\n  <li>', '</li>\n</ul>', 'List item'),
            ol: () => insertTextAtSelection('<ol>\n  <li>', '</li>\n</ol>', 'List item'),
            quote: () => insertTextAtSelection('<blockquote>', '</blockquote>', 'Quote'),
            code: () => insertTextAtSelection('<pre><code>', '</code></pre>', 'Code snippet'),
            a: () => insertTextAtSelection('<a href="https://" target="_blank" rel="noopener noreferrer">', '</a>', 'Link text'),
            img: () => insertTextAtSelection('<img src="URL_HERE" alt="Image" class="w-full rounded-lg my-4" />', '', ''),
            video: () => insertTextAtSelection('<video src="VIDEO_URL_HERE" controls class="w-full rounded-lg my-4"></video>', '', '')
        };

        const plainActions: Record<string, () => void> = {
            b: () => insertTextAtSelection('**', '**', 'bold text'),
            i: () => insertTextAtSelection('*', '*', 'italic text'),
            u: () => insertTextAtSelection('__', '__', 'underlined text'),
            p: () => insertTextAtSelection('', '', 'Paragraph text'),
            h1: () => insertTextAtSelection('# ', '', 'Main heading'),
            h2: () => insertTextAtSelection('## ', '', 'Section heading'),
            ul: () => insertTextAtSelection('- ', '', 'List item'),
            ol: () => insertTextAtSelection('1. ', '', 'List item'),
            quote: () => insertTextAtSelection('> ', '', 'Quote'),
            code: () => insertTextAtSelection('`', '`', 'code'),
            a: () => insertTextAtSelection('[', '](https://example.com)', 'Link text'),
            img: () => insertTextAtSelection('[Image: ', '](https://image-url)', 'alt text'),
            video: () => insertTextAtSelection('[Video: ', '](https://video-url)', 'title')
        };

        const actions = editorMode === 'plain' ? plainActions : htmlActions;
        actions[tag]?.();
    };

    const switchEditorMode = (mode: ContentEditorMode) => {
        if (!editingPage) return;
        if (mode === editorMode) return;
        if (mode === 'plain') {
            setPlainTextDraft(htmlToPlainText(editingPage.content));
            setEditorMode('plain');
            return;
        }
        setEditingPage({ ...editingPage, content: plainTextToHtml(plainTextDraft) });
        setEditorMode('html');
    };

    const openFilePicker = (type: 'image' | 'video') => {
        setFilePickerType(type);
        setIsFilePickerOpen(true);
    };

    const handleFilePicked = (file: { url: string; name: string; type?: string }) => {
        if (!editingPage || !file?.url) return;
        const imageSnippet = `<img src="${file.url}" alt="${escapeHtml(file.name || 'Image')}" class="w-full rounded-lg my-4" />`;
        const videoSnippet = `<video src="${file.url}" controls class="w-full rounded-lg my-4"></video>`;
        if (filePickerType === 'image') {
            const nextImages = [...(editingPage.images || []), file.url];
            setEditingPage({
                ...editingPage,
                images: nextImages,
                content:
                    editorMode === 'plain'
                        ? plainTextToHtml(`${plainTextDraft}\n[Image: ${file.name || 'Image'}](${file.url})`.trim())
                        : `${editingPage.content}\n${imageSnippet}`.trim()
            });
            if (editorMode === 'plain') {
                setPlainTextDraft(`${plainTextDraft}\n[Image: ${file.name || 'Image'}](${file.url})`.trim());
            }
        } else {
            const nextVideos = [...(editingPage.videos || []), file.url];
            setEditingPage({
                ...editingPage,
                videos: nextVideos,
                content:
                    editorMode === 'plain'
                        ? plainTextToHtml(`${plainTextDraft}\n[Video: ${file.name || 'Video'}](${file.url})`.trim())
                        : `${editingPage.content}\n${videoSnippet}`.trim()
            });
            if (editorMode === 'plain') {
                setPlainTextDraft(`${plainTextDraft}\n[Video: ${file.name || 'Video'}](${file.url})`.trim());
            }
        }
        showNotification('success', 'Media Added', 'File added from Uploaded Files.');
    };

    const handleFilesPicked = (files: { url: string; name: string }[]) => {
        if (!editingPage) return;
        if (filePickerType !== 'image') {
            if (files[0]) handleFilePicked(files[0]);
            return;
        }
        const urls = files.map((f) => f.url).filter(Boolean);
        const newContent = files.reduce((acc, f) => (
            `${acc}\n<img src="${f.url}" alt="${f.name || 'Image'}" class="w-full rounded-lg my-4" />`
        ), editingPage.content).trim();
        const plainAppend = files.map((f) => `[Image: ${f.name || 'Image'}](${f.url})`).join('\n');
        const nextPlain = `${plainTextDraft}\n${plainAppend}`.trim();
        setEditingPage({
            ...editingPage,
            images: [...(editingPage.images || []), ...urls],
            content: editorMode === 'plain' ? plainTextToHtml(nextPlain) : newContent
        });
        if (editorMode === 'plain') setPlainTextDraft(nextPlain);
        if (files.length > 0) showNotification('success', 'Media Added', 'Files added from Uploaded Files.');
    };

    // --- Render ---
    const editorPlainText = editingPage
        ? (editorMode === 'plain' ? plainTextDraft : htmlToPlainText(editingPage.content))
        : '';
    const wordCount = editorPlainText ? editorPlainText.split(/\s+/).filter(Boolean).length : 0;
    const charCount = editorPlainText.length;
    const readingMinutes = wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 220)) : 0;

    return view === 'categories' ? (
        <CategoryManager categories={categories} reload={loadData} setView={setView} />
    ) : view === 'editor' && editingPage ? (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in">
                <FilePickerModal
                    isOpen={isFilePickerOpen}
                    onClose={() => setIsFilePickerOpen(false)}
                    onSelect={handleFilePicked}
                    onSelectMultiple={handleFilesPicked}
                    allowUpload
                    multiple={filePickerType === 'image'}
                    filterType={filePickerType}
                    acceptedTypes={filePickerType === 'image' ? 'image/*' : 'video/*'}
                    role="admin"
                    visibility="public"
                    title={filePickerType === 'image' ? 'Select Images' : 'Select Video'}
                />
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-900 flex items-center">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pages
                    </button>
                    <h2 className="text-xl font-bold">{editingPage.id ? 'Edit Page' : 'New Page'}</h2>
                    <div className="flex space-x-3">
                        <button
                            onClick={handlePreview}
                            disabled={isPreviewing}
                            className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50 flex items-center disabled:opacity-60"
                        >
                            <Eye className="w-4 h-4 mr-2" /> {isPreviewing ? 'Preparing...' : 'Preview'}
                        </button>
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
                                <div className="flex items-center space-x-2">
                                    <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white">
                                        <button
                                            type="button"
                                            onClick={() => switchEditorMode('html')}
                                            className={`px-2 py-1 text-xs rounded-md transition-colors ${editorMode === 'html' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                                        >
                                            Rich HTML
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => switchEditorMode('plain')}
                                            className={`px-2 py-1 text-xs rounded-md transition-colors ${editorMode === 'plain' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                                        >
                                            Plain Text
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="mb-2 flex flex-wrap items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-2">
                                <button type="button" onClick={() => insertTag('h1')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Heading 1"><Heading1 className="w-4 h-4" /></button>
                                <button type="button" onClick={() => insertTag('h2')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Heading 2"><Heading2 className="w-4 h-4" /></button>
                                <button type="button" onClick={() => insertTag('p')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Paragraph"><Pilcrow className="w-4 h-4" /></button>
                                <div className="mx-1 h-4 w-px bg-gray-300" />
                                <button type="button" onClick={() => insertTag('b')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Bold"><Bold className="w-4 h-4" /></button>
                                <button type="button" onClick={() => insertTag('i')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Italic"><Italic className="w-4 h-4" /></button>
                                <button type="button" onClick={() => insertTag('u')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Underline"><Underline className="w-4 h-4" /></button>
                                <button type="button" onClick={() => insertTag('code')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Code"><Code className="w-4 h-4" /></button>
                                <div className="mx-1 h-4 w-px bg-gray-300" />
                                <button type="button" onClick={() => insertTag('ul')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Bulleted list"><List className="w-4 h-4" /></button>
                                <button type="button" onClick={() => insertTag('ol')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Numbered list"><ListOrdered className="w-4 h-4" /></button>
                                <button type="button" onClick={() => insertTag('quote')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Quote"><Quote className="w-4 h-4" /></button>
                                <button type="button" onClick={() => insertTag('a')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Link"><LinkIcon className="w-4 h-4" /></button>
                                <button type="button" onClick={() => insertTag('img')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Image tag"><ImageIcon className="w-4 h-4" /></button>
                                <button type="button" onClick={() => insertTag('video')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Video tag"><Video className="w-4 h-4" /></button>
                            </div>
                            <textarea 
                                ref={contentRef}
                                className={`w-full border-gray-300 rounded-lg p-4 text-sm h-[420px] focus:ring-blue-500 focus:border-blue-500 ${editorMode === 'html' ? 'font-mono' : 'font-sans'}`}
                                value={editorMode === 'plain' ? plainTextDraft : editingPage.content}
                                onChange={e => {
                                    const next = e.target.value;
                                    if (editorMode === 'plain') {
                                        updateContentFromPlainText(next);
                                    } else {
                                        setEditingPage({ ...editingPage, content: next });
                                    }
                                }}
                                placeholder={editorMode === 'plain' ? 'Write naturally in plain text. Use # headings, - lists, and paste URLs.' : '<p>Start writing your page content here...</p>'}
                            />
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                <span className="rounded bg-gray-100 px-2 py-1">Words: {wordCount}</span>
                                <span className="rounded bg-gray-100 px-2 py-1">Characters: {charCount}</span>
                                <span className="rounded bg-gray-100 px-2 py-1">Reading time: {readingMinutes} min</span>
                                <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">
                                    {editorMode === 'plain'
                                        ? 'Plain text is converted to clean blog-friendly HTML in real time.'
                                        : 'Editing raw HTML. Changes are reflected in live preview immediately.'}
                                </span>
                            </div>
                            <div className="mt-4 rounded-lg border border-gray-200 bg-white">
                                <div className="border-b border-gray-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                    Live Preview
                                </div>
                                <div
                                    className="prose prose-sm max-w-none px-4 py-4 max-h-64 overflow-auto"
                                    dangerouslySetInnerHTML={{ __html: editingPage.content || '<p class="text-gray-400">Nothing to preview yet.</p>' }}
                                />
                            </div>
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
                                        onChange={e => setEditingPage({ ...editingPage, status: e.target.value as string })}
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

                            <div className="grid grid-cols-1 gap-2">
                                <button
                                    type="button"
                                    onClick={() => openFilePicker('image')}
                                    className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 transition"
                                >
                                    <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                                    <span className="text-xs text-gray-500">Add Image from Uploaded Files</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openFilePicker('video')}
                                    className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 transition"
                                >
                                    <Video className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                                    <span className="text-xs text-gray-500">Add Video from Uploaded Files</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
    ) : view === 'auth-pages' ? (
        <AuthPagesManager setView={setView} />
    ) : view === 'system-messages' ? (
        <SystemMessagesManager setView={setView} />
    ) : view === 'answers' ? (
        <AnswersPageManager setView={setView} />
    ) : view === 'guides' ? (
        <GuidesPageManager setView={setView} />
    ) : view === 'hire' ? (
        <HirePageManager setView={setView} />
    ) : view === 'freelancer' ? (
        <FreelancerPageManager setView={setView} />
    ) : (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900">CMS Pages</h2>
                <div className="flex space-x-2">
                    <button onClick={() => setView('categories')} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center shadow-sm">
                        <Folder className="w-4 h-4 mr-2" /> Manage Categories
                    </button>
                    <button onClick={() => setView('auth-pages')} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center shadow-sm">
                        <Settings className="w-4 h-4 mr-2" /> Auth Pages
                    </button>
                    <button onClick={() => setView('system-messages')} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center shadow-sm">
                        <Mail className="w-4 h-4 mr-2" /> System Messages
                    </button>
                    <button onClick={() => setView('answers')} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center shadow-sm">
                        <Code className="w-4 h-4 mr-2" /> Answers Page
                    </button>
                    <button onClick={() => setView('guides')} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center shadow-sm">
                        <Globe className="w-4 h-4 mr-2" /> Guides Page
                    </button>
                    <button onClick={() => setView('hire')} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center shadow-sm">
                        <Settings className="w-4 h-4 mr-2" /> Hire Page
                    </button>
                    <button onClick={() => setView('freelancer')} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center shadow-sm">
                        <Settings className="w-4 h-4 mr-2" /> Freelancer Page
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
                                <td className="px-6 py-4 text-gray-500">{new Date(page.updatedAt || (page as unknown as Record<string, unknown>)['updated_at']).toLocaleDateString()}</td>
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

    const handleLogoSelect = (file: { url: string }) => {
        if (!editingCat || !file?.url) return;
        setEditingCat({ ...editingCat, image: file.url });
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelect={handleLogoSelect}
                allowUpload
                filterType="image"
                acceptedTypes="image/*"
                role="admin"
                visibility="public"
                title="Select Category Logo"
            />
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
                        <button
                            type="button"
                            onClick={() => setIsFilePickerOpen(true)}
                            className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            <Upload className="w-4 h-4 mr-2 text-gray-500" />
                            <span className="text-sm">Select Logo from Uploaded Files</span>
                        </button>
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

// --- Answers Page Manager ---

const AnswersPageManager = ({ setView }: { setView: (v: any) => void }) => {
    const { showNotification } = useNotification();
    const { socket } = useSocket();
    const [config, setConfig] = useState<AnswersPageConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [heroPickerOpen, setHeroPickerOpen] = useState(false);

    const fallback: AnswersPageConfig = {
        hero: {
            title: 'Scrolith Answers',
            subtitle: 'Get expert answers and AI-powered insights for your business challenges.',
            primaryCtaLabel: 'Ask a Question',
            primaryCtaUrl: '#ask-ai',
            backgroundImage: '',
            badgeLabel: 'AI Powered'
        },
        ai: { enabled: true, allowGuest: true, disclaimer: 'AI responses are for informational purposes only.' },
        categories: [],
        featuredQuestions: [],
        faq: [],
        updated_at: new Date().toISOString()
    };

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await CMSService.getAnswersPageConfig();
            setConfig(data || fallback);
        } catch (e) {
            setConfig(fallback);
            showNotification('alert', 'Error', 'Failed to load Answers page config.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConfig();
    }, []);

    useEffect(() => {
        if (!socket) return;
        const refresh = () => loadConfig();
        socket.on('cms:answers_updated', refresh);
        return () => {
            socket.off('cms:answers_updated', refresh);
        };
    }, [socket]);

    const updateConfig = (updates: Partial<AnswersPageConfig>) => {
        setConfig((prev) => ({ ...(prev || fallback), ...updates }));
    };

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);
        try {
            const saved = await CMSService.saveAnswersPageConfig({ ...config, updated_at: new Date().toISOString() });
            setConfig(saved);
            showNotification('success', 'Saved', 'Answers page updated.');
        } catch (e) {
            showNotification('alert', 'Error', 'Failed to save Answers page.');
        } finally {
            setSaving(false);
        }
    };

    const onHeroSelect = (file: { url: string }) => {
        if (!config) return;
        updateConfig({ hero: { ...config.hero, backgroundImage: file.url } });
    };

    if (loading || !config) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="text-gray-500">Loading Answers page settings...</div>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in space-y-6">
            <FilePickerModal
                isOpen={heroPickerOpen}
                onClose={() => setHeroPickerOpen(false)}
                onSelect={onHeroSelect}
                allowUpload
                filterType="image"
                acceptedTypes="image/*"
                role="admin"
                visibility="public"
                title="Select Answers Hero Background"
            />

            <div className="flex justify-between items-center border-b pb-4">
                <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-900 flex items-center">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pages
                </button>
                <h2 className="text-xl font-bold">Answers Page</h2>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 shadow-sm disabled:opacity-60"
                >
                    <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save'}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">Hero</h3>
                    <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.title} onChange={e => updateConfig({ hero: { ...config.hero, title: e.target.value } })} placeholder="Hero Title" />
                    <textarea className="w-full border-gray-300 rounded-lg p-2.5 h-24" value={config.hero.subtitle} onChange={e => updateConfig({ hero: { ...config.hero, subtitle: e.target.value } })} placeholder="Hero Subtitle" />
                    <div className="grid grid-cols-2 gap-3">
                        <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.primaryCtaLabel || ''} onChange={e => updateConfig({ hero: { ...config.hero, primaryCtaLabel: e.target.value } })} placeholder="CTA Label" />
                        <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.primaryCtaUrl || ''} onChange={e => updateConfig({ hero: { ...config.hero, primaryCtaUrl: e.target.value } })} placeholder="CTA URL" />
                    </div>
                    <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.badgeLabel || ''} onChange={e => updateConfig({ hero: { ...config.hero, badgeLabel: e.target.value } })} placeholder="Badge Label" />
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setHeroPickerOpen(true)} className="px-4 py-2 border rounded-lg text-sm">
                            Select Background Image
                        </button>
                        {config.hero.backgroundImage ? <span className="text-xs text-gray-500">Image selected</span> : null}
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">AI Settings</h3>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={config.ai.enabled} onChange={e => updateConfig({ ai: { ...config.ai, enabled: e.target.checked } })} />
                        Enable AI Answers
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={config.ai.allowGuest} onChange={e => updateConfig({ ai: { ...config.ai, allowGuest: e.target.checked } })} />
                        Allow Guests to Use AI
                    </label>
                    <textarea className="w-full border-gray-300 rounded-lg p-2.5 h-24" value={config.ai.disclaimer || ''} onChange={e => updateConfig({ ai: { ...config.ai, disclaimer: e.target.value } })} placeholder="AI Disclaimer" />
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Categories</h3>
                    <button
                        onClick={() => updateConfig({ categories: [...config.categories, { id: `cat-${Date.now()}`, label: '', description: '' }] })}
                        className="text-sm text-blue-600"
                    >
                        + Add Category
                    </button>
                </div>
                {config.categories.map((cat, idx) => (
                    <div key={cat.id} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input className="border rounded-lg p-2" value={cat.label} onChange={e => {
                            const next = [...config.categories];
                            next[idx] = { ...cat, label: e.target.value };
                            updateConfig({ categories: next });
                        }} placeholder="Label" />
                        <input className="border rounded-lg p-2 md:col-span-2" value={cat.description || ''} onChange={e => {
                            const next = [...config.categories];
                            next[idx] = { ...cat, description: e.target.value };
                            updateConfig({ categories: next });
                        }} placeholder="Description" />
                        <button className="text-xs text-red-500 md:col-span-3 text-left" onClick={() => updateConfig({ categories: config.categories.filter((_, i) => i !== idx) })}>Remove</button>
                    </div>
                ))}
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Featured Questions</h3>
                    <button
                        onClick={() => updateConfig({ featuredQuestions: [...config.featuredQuestions, { id: `q-${Date.now()}`, question: '', tags: [] }] })}
                        className="text-sm text-blue-600"
                    >
                        + Add Question
                    </button>
                </div>
                {config.featuredQuestions.map((q, idx) => (
                    <div key={q.id} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input className="border rounded-lg p-2 md:col-span-2" value={q.question} onChange={e => {
                            const next = [...config.featuredQuestions];
                            next[idx] = { ...q, question: e.target.value };
                            updateConfig({ featuredQuestions: next });
                        }} placeholder="Question" />
                        <input className="border rounded-lg p-2" value={(q.tags || []).join(', ')} onChange={e => {
                            const next = [...config.featuredQuestions];
                            next[idx] = { ...q, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) };
                            updateConfig({ featuredQuestions: next });
                        }} placeholder="Tags (comma separated)" />
                        <button className="text-xs text-red-500 md:col-span-3 text-left" onClick={() => updateConfig({ featuredQuestions: config.featuredQuestions.filter((_, i) => i !== idx) })}>Remove</button>
                    </div>
                ))}
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">FAQ</h3>
                    <button
                        onClick={() => updateConfig({ faq: [...config.faq, { id: `faq-${Date.now()}`, question: '', answer: '' }] })}
                        className="text-sm text-blue-600"
                    >
                        + Add FAQ
                    </button>
                </div>
                {config.faq.map((item, idx) => (
                    <div key={item.id} className="grid grid-cols-1 gap-2">
                        <input className="border rounded-lg p-2" value={item.question} onChange={e => {
                            const next = [...config.faq];
                            next[idx] = { ...item, question: e.target.value };
                            updateConfig({ faq: next });
                        }} placeholder="Question" />
                        <textarea className="border rounded-lg p-2 h-20" value={item.answer} onChange={e => {
                            const next = [...config.faq];
                            next[idx] = { ...item, answer: e.target.value };
                            updateConfig({ faq: next });
                        }} placeholder="Answer" />
                        <button className="text-xs text-red-500 text-left" onClick={() => updateConfig({ faq: config.faq.filter((_, i) => i !== idx) })}>Remove</button>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Guides Page Manager ---

const GuidesPageManager = ({ setView }: { setView: (v: any) => void }) => {
    const { showNotification } = useNotification();
    const { socket } = useSocket();
    const [config, setConfig] = useState<GuidesPageConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [heroPickerOpen, setHeroPickerOpen] = useState(false);
    const [coverPickerOpen, setCoverPickerOpen] = useState(false);
    const [coverIndex, setCoverIndex] = useState<number | null>(null);

    const fallback: GuidesPageConfig = {
        hero: {
            title: 'Scrolith Guides',
            subtitle: 'In-depth, professional guides for founders, freelancers, and teams.',
            primaryCtaLabel: 'Explore Guides',
            primaryCtaUrl: '#guides',
            backgroundImage: '',
            badgeLabel: 'Deep Dives'
        },
        ai: { enabled: true, allowGuest: true, disclaimer: 'AI guides are drafts. Validate facts.' },
        topics: [],
        featuredGuides: [],
        callToAction: { title: 'Need a tailored guide?', subtitle: 'Generate a custom playbook.', ctaLabel: 'Generate Guide', ctaUrl: '#ai-guide-builder' },
        updated_at: new Date().toISOString()
    };

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await CMSService.getGuidesPageConfig();
            setConfig(data || fallback);
        } catch (e) {
            setConfig(fallback);
            showNotification('alert', 'Error', 'Failed to load Guides page config.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConfig();
    }, []);

    useEffect(() => {
        if (!socket) return;
        const refresh = () => loadConfig();
        socket.on('cms:guides_updated', refresh);
        return () => {
            socket.off('cms:guides_updated', refresh);
        };
    }, [socket]);

    const updateConfig = (updates: Partial<GuidesPageConfig>) => {
        setConfig((prev) => ({ ...(prev || fallback), ...updates }));
    };

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);
        try {
            const saved = await CMSService.saveGuidesPageConfig({ ...config, updated_at: new Date().toISOString() });
            setConfig(saved);
            showNotification('success', 'Saved', 'Guides page updated.');
        } catch (e) {
            showNotification('alert', 'Error', 'Failed to save Guides page.');
        } finally {
            setSaving(false);
        }
    };

    const onHeroSelect = (file: { url: string }) => {
        if (!config) return;
        updateConfig({ hero: { ...config.hero, backgroundImage: file.url } });
    };

    const onCoverSelect = (file: { url: string }) => {
        if (!config || coverIndex === null) return;
        const next = [...config.featuredGuides];
        next[coverIndex] = { ...next[coverIndex], coverImage: file.url };
        updateConfig({ featuredGuides: next });
    };

    if (loading || !config) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="text-gray-500">Loading Guides page settings...</div>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in space-y-6">
            <FilePickerModal
                isOpen={heroPickerOpen}
                onClose={() => setHeroPickerOpen(false)}
                onSelect={onHeroSelect}
                allowUpload
                filterType="image"
                acceptedTypes="image/*"
                role="admin"
                visibility="public"
                title="Select Guides Hero Background"
            />
            <FilePickerModal
                isOpen={coverPickerOpen}
                onClose={() => setCoverPickerOpen(false)}
                onSelect={onCoverSelect}
                allowUpload
                filterType="image"
                acceptedTypes="image/*"
                role="admin"
                visibility="public"
                title="Select Guide Cover Image"
            />

            <div className="flex justify-between items-center border-b pb-4">
                <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-900 flex items-center">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pages
                </button>
                <h2 className="text-xl font-bold">Guides Page</h2>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 shadow-sm disabled:opacity-60"
                >
                    <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save'}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">Hero</h3>
                    <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.title} onChange={e => updateConfig({ hero: { ...config.hero, title: e.target.value } })} placeholder="Hero Title" />
                    <textarea className="w-full border-gray-300 rounded-lg p-2.5 h-24" value={config.hero.subtitle} onChange={e => updateConfig({ hero: { ...config.hero, subtitle: e.target.value } })} placeholder="Hero Subtitle" />
                    <div className="grid grid-cols-2 gap-3">
                        <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.primaryCtaLabel || ''} onChange={e => updateConfig({ hero: { ...config.hero, primaryCtaLabel: e.target.value } })} placeholder="CTA Label" />
                        <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.primaryCtaUrl || ''} onChange={e => updateConfig({ hero: { ...config.hero, primaryCtaUrl: e.target.value } })} placeholder="CTA URL" />
                    </div>
                    <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.badgeLabel || ''} onChange={e => updateConfig({ hero: { ...config.hero, badgeLabel: e.target.value } })} placeholder="Badge Label" />
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setHeroPickerOpen(true)} className="px-4 py-2 border rounded-lg text-sm">
                            Select Background Image
                        </button>
                        {config.hero.backgroundImage ? <span className="text-xs text-gray-500">Image selected</span> : null}
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">AI Settings</h3>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={config.ai.enabled} onChange={e => updateConfig({ ai: { ...config.ai, enabled: e.target.checked } })} />
                        Enable AI Guides
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={config.ai.allowGuest} onChange={e => updateConfig({ ai: { ...config.ai, allowGuest: e.target.checked } })} />
                        Allow Guests to Use AI
                    </label>
                    <textarea className="w-full border-gray-300 rounded-lg p-2.5 h-24" value={config.ai.disclaimer || ''} onChange={e => updateConfig({ ai: { ...config.ai, disclaimer: e.target.value } })} placeholder="AI Disclaimer" />
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Topics</h3>
                    <button
                        onClick={() => updateConfig({ topics: [...config.topics, { id: `topic-${Date.now()}`, label: '', description: '' }] })}
                        className="text-sm text-blue-600"
                    >
                        + Add Topic
                    </button>
                </div>
                {config.topics.map((topic, idx) => (
                    <div key={topic.id} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input className="border rounded-lg p-2" value={topic.label} onChange={e => {
                            const next = [...config.topics];
                            next[idx] = { ...topic, label: e.target.value };
                            updateConfig({ topics: next });
                        }} placeholder="Label" />
                        <input className="border rounded-lg p-2 md:col-span-2" value={topic.description || ''} onChange={e => {
                            const next = [...config.topics];
                            next[idx] = { ...topic, description: e.target.value };
                            updateConfig({ topics: next });
                        }} placeholder="Description" />
                        <button className="text-xs text-red-500 md:col-span-3 text-left" onClick={() => updateConfig({ topics: config.topics.filter((_, i) => i !== idx) })}>Remove</button>
                    </div>
                ))}
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Featured Guides</h3>
                    <button
                        onClick={() => updateConfig({ featuredGuides: [...config.featuredGuides, { id: `guide-${Date.now()}`, title: '', excerpt: '', category: '', readTime: '', coverImage: '' }] })}
                        className="text-sm text-blue-600"
                    >
                        + Add Guide
                    </button>
                </div>
                {config.featuredGuides.map((guide, idx) => (
                    <div key={guide.id} className="grid grid-cols-1 md:grid-cols-2 gap-2 border border-gray-200 rounded-lg p-3">
                        <input className="border rounded-lg p-2" value={guide.title} onChange={e => {
                            const next = [...config.featuredGuides];
                            next[idx] = { ...guide, title: e.target.value };
                            updateConfig({ featuredGuides: next });
                        }} placeholder="Title" />
                        <input className="border rounded-lg p-2" value={guide.category || ''} onChange={e => {
                            const next = [...config.featuredGuides];
                            next[idx] = { ...guide, category: e.target.value };
                            updateConfig({ featuredGuides: next });
                        }} placeholder="Category" />
                        <textarea className="border rounded-lg p-2 md:col-span-2 h-20" value={guide.excerpt} onChange={e => {
                            const next = [...config.featuredGuides];
                            next[idx] = { ...guide, excerpt: e.target.value };
                            updateConfig({ featuredGuides: next });
                        }} placeholder="Excerpt" />
                        <div className="flex items-center gap-2">
                            <input className="border rounded-lg p-2 flex-1" value={guide.readTime || ''} onChange={e => {
                                const next = [...config.featuredGuides];
                                next[idx] = { ...guide, readTime: e.target.value };
                                updateConfig({ featuredGuides: next });
                            }} placeholder="Read Time" />
                            <button
                                type="button"
                                onClick={() => {
                                    setCoverIndex(idx);
                                    setCoverPickerOpen(true);
                                }}
                                className="px-3 py-2 border rounded-lg text-sm"
                            >
                                Cover Image
                            </button>
                        </div>
                        <button className="text-xs text-red-500 md:col-span-2 text-left" onClick={() => updateConfig({ featuredGuides: config.featuredGuides.filter((_, i) => i !== idx) })}>Remove</button>
                    </div>
                ))}
            </div>

            <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Call to Action</h3>
                <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.callToAction?.title || ''} onChange={e => updateConfig({ callToAction: { ...(config.callToAction || {}), title: e.target.value } })} placeholder="CTA Title" />
                <textarea className="w-full border-gray-300 rounded-lg p-2.5 h-20" value={config.callToAction?.subtitle || ''} onChange={e => updateConfig({ callToAction: { ...(config.callToAction || {}), subtitle: e.target.value } })} placeholder="CTA Subtitle" />
                <div className="grid grid-cols-2 gap-3">
                    <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.callToAction?.ctaLabel || ''} onChange={e => updateConfig({ callToAction: { ...(config.callToAction || {}), ctaLabel: e.target.value } })} placeholder="CTA Label" />
                    <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.callToAction?.ctaUrl || ''} onChange={e => updateConfig({ callToAction: { ...(config.callToAction || {}), ctaUrl: e.target.value } })} placeholder="CTA URL" />
                </div>
            </div>
        </div>
    );
};

// --- Hire Page Manager ---

const HirePageManager = ({ setView }: { setView: (v: any) => void }) => {
    const { showNotification } = useNotification();
    const { socket } = useSocket();
    const [config, setConfig] = useState<HirePageConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [heroPickerOpen, setHeroPickerOpen] = useState(false);

    const fallback: HirePageConfig = {
        hero: {
            title: 'I am seeking to hire',
            subtitle: 'We’re looking for proven freelance talent and a premium business solution to drive results.',
            primaryCtaLabel: 'Post a Project',
            primaryCtaUrl: '/create-job',
            secondaryCtaLabel: 'Browse Talent',
            secondaryCtaUrl: '/browse',
            backgroundImage: '',
            badgeLabel: 'Premium Hiring'
        },
        ai: { enabled: true, allowGuest: true, disclaimer: 'AI recommendations are advisory.' },
        highlights: [],
        steps: [],
        testimonials: [],
        updated_at: new Date().toISOString()
    };

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await CMSService.getHirePageConfig();
            setConfig(data || fallback);
        } catch (e) {
            setConfig(fallback);
            showNotification('alert', 'Error', 'Failed to load Hire page config.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConfig();
    }, []);

    useEffect(() => {
        if (!socket) return;
        const refresh = () => loadConfig();
        socket.on('cms:hire_updated', refresh);
        return () => {
            socket.off('cms:hire_updated', refresh);
        };
    }, [socket]);

    const updateConfig = (updates: Partial<HirePageConfig>) => {
        setConfig((prev) => ({ ...(prev || fallback), ...updates }));
    };

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);
        try {
            const saved = await CMSService.saveHirePageConfig({ ...config, updated_at: new Date().toISOString() });
            setConfig(saved);
            showNotification('success', 'Saved', 'Hire page updated.');
        } catch (e) {
            showNotification('alert', 'Error', 'Failed to save Hire page.');
        } finally {
            setSaving(false);
        }
    };

    const onHeroSelect = (file: { url: string }) => {
        if (!config) return;
        updateConfig({ hero: { ...config.hero, backgroundImage: file.url } });
    };

    if (loading || !config) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="text-gray-500">Loading Hire page settings...</div>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in space-y-6">
            <FilePickerModal
                isOpen={heroPickerOpen}
                onClose={() => setHeroPickerOpen(false)}
                onSelect={onHeroSelect}
                allowUpload
                filterType="image"
                acceptedTypes="image/*"
                role="admin"
                visibility="public"
                title="Select Hire Hero Background"
            />
            <div className="flex justify-between items-center border-b pb-4">
                <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-900 flex items-center">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pages
                </button>
                <h2 className="text-xl font-bold">Hire Page</h2>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 shadow-sm disabled:opacity-60"
                >
                    <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save'}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">Hero</h3>
                    <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.title} onChange={e => updateConfig({ hero: { ...config.hero, title: e.target.value } })} placeholder="Hero Title" />
                    <textarea className="w-full border-gray-300 rounded-lg p-2.5 h-24" value={config.hero.subtitle} onChange={e => updateConfig({ hero: { ...config.hero, subtitle: e.target.value } })} placeholder="Hero Subtitle" />
                    <div className="grid grid-cols-2 gap-3">
                        <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.primaryCtaLabel || ''} onChange={e => updateConfig({ hero: { ...config.hero, primaryCtaLabel: e.target.value } })} placeholder="Primary CTA Label" />
                        <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.primaryCtaUrl || ''} onChange={e => updateConfig({ hero: { ...config.hero, primaryCtaUrl: e.target.value } })} placeholder="Primary CTA URL" />
                        <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.secondaryCtaLabel || ''} onChange={e => updateConfig({ hero: { ...config.hero, secondaryCtaLabel: e.target.value } })} placeholder="Secondary CTA Label" />
                        <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.secondaryCtaUrl || ''} onChange={e => updateConfig({ hero: { ...config.hero, secondaryCtaUrl: e.target.value } })} placeholder="Secondary CTA URL" />
                    </div>
                    <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.badgeLabel || ''} onChange={e => updateConfig({ hero: { ...config.hero, badgeLabel: e.target.value } })} placeholder="Badge Label" />
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setHeroPickerOpen(true)} className="px-4 py-2 border rounded-lg text-sm">
                            Select Background Image
                        </button>
                        {config.hero.backgroundImage ? <span className="text-xs text-gray-500">Image selected</span> : null}
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">AI Settings</h3>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={config.ai.enabled} onChange={e => updateConfig({ ai: { ...config.ai, enabled: e.target.checked } })} />
                        Enable AI Matching
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={config.ai.allowGuest} onChange={e => updateConfig({ ai: { ...config.ai, allowGuest: e.target.checked } })} />
                        Allow Guests to Use AI
                    </label>
                    <textarea className="w-full border-gray-300 rounded-lg p-2.5 h-24" value={config.ai.disclaimer || ''} onChange={e => updateConfig({ ai: { ...config.ai, disclaimer: e.target.value } })} placeholder="AI Disclaimer" />
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Highlights</h3>
                    <button onClick={() => updateConfig({ highlights: [...config.highlights, { id: `h-${Date.now()}`, title: '', description: '' }] })} className="text-sm text-blue-600">
                        + Add Highlight
                    </button>
                </div>
                {config.highlights.map((item, idx) => (
                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input className="border rounded-lg p-2" value={item.title} onChange={e => {
                            const next = [...config.highlights];
                            next[idx] = { ...item, title: e.target.value };
                            updateConfig({ highlights: next });
                        }} placeholder="Title" />
                        <input className="border rounded-lg p-2 md:col-span-2" value={item.description || ''} onChange={e => {
                            const next = [...config.highlights];
                            next[idx] = { ...item, description: e.target.value };
                            updateConfig({ highlights: next });
                        }} placeholder="Description" />
                        <button className="text-xs text-red-500 md:col-span-3 text-left" onClick={() => updateConfig({ highlights: config.highlights.filter((_, i) => i !== idx) })}>Remove</button>
                    </div>
                ))}
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Steps</h3>
                    <button onClick={() => updateConfig({ steps: [...config.steps, { id: `s-${Date.now()}`, title: '', description: '' }] })} className="text-sm text-blue-600">
                        + Add Step
                    </button>
                </div>
                {config.steps.map((item, idx) => (
                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input className="border rounded-lg p-2" value={item.title} onChange={e => {
                            const next = [...config.steps];
                            next[idx] = { ...item, title: e.target.value };
                            updateConfig({ steps: next });
                        }} placeholder="Title" />
                        <input className="border rounded-lg p-2 md:col-span-2" value={item.description || ''} onChange={e => {
                            const next = [...config.steps];
                            next[idx] = { ...item, description: e.target.value };
                            updateConfig({ steps: next });
                        }} placeholder="Description" />
                        <button className="text-xs text-red-500 md:col-span-3 text-left" onClick={() => updateConfig({ steps: config.steps.filter((_, i) => i !== idx) })}>Remove</button>
                    </div>
                ))}
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Testimonials</h3>
                    <button onClick={() => updateConfig({ testimonials: [...config.testimonials, { id: `t-${Date.now()}`, name: '', role: '', quote: '' }] })} className="text-sm text-blue-600">
                        + Add Testimonial
                    </button>
                </div>
                {config.testimonials.map((item, idx) => (
                    <div key={item.id} className="grid grid-cols-1 gap-2 border border-gray-200 rounded-lg p-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <input className="border rounded-lg p-2" value={item.name} onChange={e => {
                                const next = [...config.testimonials];
                                next[idx] = { ...item, name: e.target.value };
                                updateConfig({ testimonials: next });
                            }} placeholder="Name" />
                            <input className="border rounded-lg p-2" value={item.role || ''} onChange={e => {
                                const next = [...config.testimonials];
                                next[idx] = { ...item, role: e.target.value };
                                updateConfig({ testimonials: next });
                            }} placeholder="Role/Company" />
                        </div>
                        <textarea className="border rounded-lg p-2 h-20" value={item.quote} onChange={e => {
                            const next = [...config.testimonials];
                            next[idx] = { ...item, quote: e.target.value };
                            updateConfig({ testimonials: next });
                        }} placeholder="Quote" />
                        <button className="text-xs text-red-500 text-left" onClick={() => updateConfig({ testimonials: config.testimonials.filter((_, i) => i !== idx) })}>Remove</button>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Freelancer Page Manager ---

const FreelancerPageManager = ({ setView }: { setView: (v: any) => void }) => {
    const { showNotification } = useNotification();
    const { socket } = useSocket();
    const [config, setConfig] = useState<FreelancerPageConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [heroPickerOpen, setHeroPickerOpen] = useState(false);

    const fallback: FreelancerPageConfig = {
        hero: {
            title: 'Professional Freelancer for Strategic Business Projects',
            subtitle: 'I deliver premium freelance and agency-level services for strategic business projects—combining expert execution with scalable solutions tailored to your goals.',
            primaryCtaLabel: 'Join as Pro Freelancer',
            primaryCtaUrl: '/auth/signup',
            secondaryCtaLabel: 'View Opportunities',
            secondaryCtaUrl: '/browse-jobs',
            backgroundImage: '',
            badgeLabel: 'Elite Talent'
        },
        ai: { enabled: true, allowGuest: true, disclaimer: 'AI assistance supports positioning and proposals.' },
        services: [],
        proof: [],
        callToAction: { title: 'Ready to deliver premium outcomes?', subtitle: 'Set up your elite freelancer profile.', ctaLabel: 'Create Profile', ctaUrl: '/profile/edit' },
        updated_at: new Date().toISOString()
    };

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await CMSService.getFreelancerPageConfig();
            setConfig(data || fallback);
        } catch (e) {
            setConfig(fallback);
            showNotification('alert', 'Error', 'Failed to load Freelancer page config.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadConfig();
    }, []);

    useEffect(() => {
        if (!socket) return;
        const refresh = () => loadConfig();
        socket.on('cms:freelancer_updated', refresh);
        return () => {
            socket.off('cms:freelancer_updated', refresh);
        };
    }, [socket]);

    const updateConfig = (updates: Partial<FreelancerPageConfig>) => {
        setConfig((prev) => ({ ...(prev || fallback), ...updates }));
    };

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);
        try {
            const saved = await CMSService.saveFreelancerPageConfig({ ...config, updated_at: new Date().toISOString() });
            setConfig(saved);
            showNotification('success', 'Saved', 'Freelancer page updated.');
        } catch (e) {
            showNotification('alert', 'Error', 'Failed to save Freelancer page.');
        } finally {
            setSaving(false);
        }
    };

    const onHeroSelect = (file: { url: string }) => {
        if (!config) return;
        updateConfig({ hero: { ...config.hero, backgroundImage: file.url } });
    };

    if (loading || !config) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="text-gray-500">Loading Freelancer page settings...</div>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in space-y-6">
            <FilePickerModal
                isOpen={heroPickerOpen}
                onClose={() => setHeroPickerOpen(false)}
                onSelect={onHeroSelect}
                allowUpload
                filterType="image"
                acceptedTypes="image/*"
                role="admin"
                visibility="public"
                title="Select Freelancer Hero Background"
            />
            <div className="flex justify-between items-center border-b pb-4">
                <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-900 flex items-center">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pages
                </button>
                <h2 className="text-xl font-bold">Freelancer Page</h2>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 shadow-sm disabled:opacity-60"
                >
                    <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save'}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">Hero</h3>
                    <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.title} onChange={e => updateConfig({ hero: { ...config.hero, title: e.target.value } })} placeholder="Hero Title" />
                    <textarea className="w-full border-gray-300 rounded-lg p-2.5 h-24" value={config.hero.subtitle} onChange={e => updateConfig({ hero: { ...config.hero, subtitle: e.target.value } })} placeholder="Hero Subtitle" />
                    <div className="grid grid-cols-2 gap-3">
                        <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.primaryCtaLabel || ''} onChange={e => updateConfig({ hero: { ...config.hero, primaryCtaLabel: e.target.value } })} placeholder="Primary CTA Label" />
                        <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.primaryCtaUrl || ''} onChange={e => updateConfig({ hero: { ...config.hero, primaryCtaUrl: e.target.value } })} placeholder="Primary CTA URL" />
                        <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.secondaryCtaLabel || ''} onChange={e => updateConfig({ hero: { ...config.hero, secondaryCtaLabel: e.target.value } })} placeholder="Secondary CTA Label" />
                        <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.secondaryCtaUrl || ''} onChange={e => updateConfig({ hero: { ...config.hero, secondaryCtaUrl: e.target.value } })} placeholder="Secondary CTA URL" />
                    </div>
                    <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.hero.badgeLabel || ''} onChange={e => updateConfig({ hero: { ...config.hero, badgeLabel: e.target.value } })} placeholder="Badge Label" />
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setHeroPickerOpen(true)} className="px-4 py-2 border rounded-lg text-sm">
                            Select Background Image
                        </button>
                        {config.hero.backgroundImage ? <span className="text-xs text-gray-500">Image selected</span> : null}
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">AI Settings</h3>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={config.ai.enabled} onChange={e => updateConfig({ ai: { ...config.ai, enabled: e.target.checked } })} />
                        Enable AI Assistance
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={config.ai.allowGuest} onChange={e => updateConfig({ ai: { ...config.ai, allowGuest: e.target.checked } })} />
                        Allow Guests to Use AI
                    </label>
                    <textarea className="w-full border-gray-300 rounded-lg p-2.5 h-24" value={config.ai.disclaimer || ''} onChange={e => updateConfig({ ai: { ...config.ai, disclaimer: e.target.value } })} placeholder="AI Disclaimer" />
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Services</h3>
                    <button onClick={() => updateConfig({ services: [...config.services, { id: `svc-${Date.now()}`, title: '', description: '' }] })} className="text-sm text-blue-600">
                        + Add Service
                    </button>
                </div>
                {config.services.map((svc, idx) => (
                    <div key={svc.id} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input className="border rounded-lg p-2" value={svc.title} onChange={e => {
                            const next = [...config.services];
                            next[idx] = { ...svc, title: e.target.value };
                            updateConfig({ services: next });
                        }} placeholder="Title" />
                        <input className="border rounded-lg p-2 md:col-span-2" value={svc.description || ''} onChange={e => {
                            const next = [...config.services];
                            next[idx] = { ...svc, description: e.target.value };
                            updateConfig({ services: next });
                        }} placeholder="Description" />
                        <button className="text-xs text-red-500 md:col-span-3 text-left" onClick={() => updateConfig({ services: config.services.filter((_, i) => i !== idx) })}>Remove</button>
                    </div>
                ))}
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Proof</h3>
                    <button onClick={() => updateConfig({ proof: [...config.proof, { id: `p-${Date.now()}`, metric: '', label: '' }] })} className="text-sm text-blue-600">
                        + Add Proof
                    </button>
                </div>
                {config.proof.map((item, idx) => (
                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input className="border rounded-lg p-2" value={item.metric} onChange={e => {
                            const next = [...config.proof];
                            next[idx] = { ...item, metric: e.target.value };
                            updateConfig({ proof: next });
                        }} placeholder="Metric" />
                        <input className="border rounded-lg p-2" value={item.label} onChange={e => {
                            const next = [...config.proof];
                            next[idx] = { ...item, label: e.target.value };
                            updateConfig({ proof: next });
                        }} placeholder="Label" />
                        <button className="text-xs text-red-500 md:col-span-2 text-left" onClick={() => updateConfig({ proof: config.proof.filter((_, i) => i !== idx) })}>Remove</button>
                    </div>
                ))}
            </div>

            <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Call to Action</h3>
                <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.callToAction?.title || ''} onChange={e => updateConfig({ callToAction: { ...(config.callToAction || {}), title: e.target.value } })} placeholder="CTA Title" />
                <textarea className="w-full border-gray-300 rounded-lg p-2.5 h-20" value={config.callToAction?.subtitle || ''} onChange={e => updateConfig({ callToAction: { ...(config.callToAction || {}), subtitle: e.target.value } })} placeholder="CTA Subtitle" />
                <div className="grid grid-cols-2 gap-3">
                    <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.callToAction?.ctaLabel || ''} onChange={e => updateConfig({ callToAction: { ...(config.callToAction || {}), ctaLabel: e.target.value } })} placeholder="CTA Label" />
                    <input className="w-full border-gray-300 rounded-lg p-2.5" value={config.callToAction?.ctaUrl || ''} onChange={e => updateConfig({ callToAction: { ...(config.callToAction || {}), ctaUrl: e.target.value } })} placeholder="CTA URL" />
                </div>
            </div>
        </div>
    );
};

export default CMSPages;



