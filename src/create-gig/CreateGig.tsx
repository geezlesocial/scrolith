
import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import { AdminService } from '../services/admin';
import { gigsApi } from '../services/gigs';
import api from '../services/api';
import { categoriesApi } from '../services/categories';
import { Gig, ListingCategory, GigPackage, GigExtra, UploadedFile, GigFAQ, GigRequirement } from '../types';
import { CheckCircle, X, Trash2, Plus, Sparkles, ChevronRight, ChevronLeft, Image as ImageIcon, Video, HelpCircle, Loader2, Save, FileText } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import FilePickerModal from '../dashboard/shared/FilePickerModal';
import RichTextEditor from '../components/RichTextEditor';
import { formsApi } from '../services/forms';

const DEFAULT_GIG_STEPS = [
    { id: 'overview', label: 'Overview', enabled: true },
    { id: 'pricing', label: 'Scope & Pricing', enabled: true },
    { id: 'description', label: 'Description', enabled: true },
    { id: 'requirements', label: 'Requirements', enabled: true },
    { id: 'gallery', label: 'Gallery', enabled: true },
    { id: 'publish', label: 'Publish', enabled: true }
];

const DEFAULT_GIG_FORM = {
    layout: {
        titleCreate: 'Create New Gig',
        titleEdit: 'Edit Gig',
        sectionGap: 24,
        cardPadding: 32
    },
    steps: DEFAULT_GIG_STEPS,
    labels: {
        titleLabel: 'Gig Title',
        categoryLabel: 'Category',
        subcategoryLabel: 'Subcategory',
        pricingTitle: 'Scope & Pricing',
        extrasTitle: 'Gig Extras',
        faqTitle: 'FAQs',
        descriptionLabel: 'Gig Description',
        requirementsTitle: 'Requirements',
        galleryTitle: 'Gallery'
    },
    controls: {
        showAI: true,
        showPackages: true,
        showPackageFeatures: true,
        showExtras: true,
        showFAQs: true,
        showRequirements: true,
        showGalleryImages: true,
        showGalleryVideos: true,
        showGalleryDocs: true
    },
    customBlocks: {},
    customFields: {}
};

const isPlainObject = (v: any) => v && typeof v === 'object' && !Array.isArray(v);

const deepMergeReplaceArrays = (existing: any, incoming: any): any => {
    if (incoming === undefined) return existing;
    if (Array.isArray(incoming)) return incoming;
    if (!isPlainObject(incoming)) return incoming;
    const out: any = { ...(isPlainObject(existing) ? existing : {}) };
    for (const key of Object.keys(incoming)) {
        out[key] = deepMergeReplaceArrays(existing ? existing[key] : undefined, incoming[key]);
    }
    return out;
};

const buildGigSteps = (config: any) => {
    const cfgSteps = Array.isArray(config?.steps) ? config.steps : [];
    const baseMap = new Map(DEFAULT_GIG_STEPS.map((s) => [s.id, s]));
    let merged = cfgSteps.length
        ? cfgSteps
            .map((step: any) => {
                const base = baseMap.get(step.id);
                if (!base) return null;
                return { ...base, ...step };
            })
            .filter(Boolean)
        : DEFAULT_GIG_STEPS;

    DEFAULT_GIG_STEPS.forEach((step) => {
        if (!merged.find((s: any) => s.id === step.id)) merged.push(step);
    });

    const controls = config?.controls || {};
    merged = merged.map((step: any) => {
        if (step.id === 'requirements' && controls.showRequirements === false) {
            return { ...step, enabled: false };
        }
        if (step.id === 'gallery' && controls.showGalleryImages === false && controls.showGalleryVideos === false && controls.showGalleryDocs === false) {
            return { ...step, enabled: false };
        }
        return step;
    });

    const enabledSteps = merged.filter((s: any) => s.enabled !== false);
    return enabledSteps.length ? enabledSteps : DEFAULT_GIG_STEPS;
};

const CreateGig = () => {
    const { user } = useUser();
    const { showNotification } = useNotification();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const gigId = searchParams.get('id') || searchParams.get('edit');
    const isEditMode = !!gigId;
    
    // Steps: Overview, Pricing, Description, Requirements, Gallery, Publish
    const [steps, setSteps] = useState<any[]>(DEFAULT_GIG_STEPS);
    const [currentStep, setCurrentStep] = useState(1);
    const [formConfig, setFormConfig] = useState<any>(DEFAULT_GIG_FORM);
    
    // AI Generation State
    const [isAIGenerating, setIsAIGenerating] = useState(false);
    const [showAIModal, setShowAIModal] = useState(searchParams.get('mode') === 'ai');
    const [aiPrompt, setAiPrompt] = useState('');

    // Data State
    const [categories, setCategories] = useState<ListingCategory[]>([]);
    const [availableSubs, setAvailableSubs] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(true);
    
    const [gig, setGig] = useState<Partial<Gig>>({
        title: '',
        category: '',
        subcategory: '',
        price: 0,
        pricingMode: 'packages',
        packages: [
            { name: 'Basic', description: '', deliveryDays: 3, revisions: 1, price: 0, features: [] },
            { name: 'Standard', description: '', deliveryDays: 5, revisions: 3, price: 0, features: [] },
            { name: 'Premium', description: '', deliveryDays: 7, revisions: -1, price: 0, features: [] }
        ],
        description: '',
        faqs: [],
        requirements: [],
        images: [],
        videos: [],
        documents: [],
        image: '',
        status: 'draft', 
        adminStatus: 'pending'
    });
    const [draftId, setDraftId] = useState<string | null>(gigId || null);
    const [autoSaving, setAutoSaving] = useState(false);
    const autoSaveTimer = useRef<number | null>(null);

    useEffect(() => {
        let active = true;
        const loadFormConfig = async () => {
            try {
                const cfg = await formsApi.getConfig();
                if (!active) return;
                const gigCfg = deepMergeReplaceArrays(DEFAULT_GIG_FORM, cfg?.gig || {});
                setFormConfig(gigCfg);
                setSteps(buildGigSteps(gigCfg));
            } catch (error) {
                // fall back to defaults
                if (active) {
                    setFormConfig(DEFAULT_GIG_FORM);
                    setSteps(buildGigSteps(DEFAULT_GIG_FORM));
                }
            }
        };
        loadFormConfig();
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (currentStep > steps.length) {
            setCurrentStep(steps.length || 1);
        }
    }, [steps.length]);

    // UI State
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [filePickerMode, setFilePickerMode] = useState<'image' | 'video' | 'document'>('image');
    const statusLower = String(gig.status || '').toLowerCase();
    const adminLower = String(gig.adminStatus || '').toLowerCase();
    const isApproved = adminLower === 'approved' || statusLower === 'active';
    const isPending = adminLower === 'pending' && statusLower !== 'draft' && statusLower !== 'rejected';
    const needsReview = !isApproved && !isPending;

    const labels = formConfig?.labels || {};
    const controls = formConfig?.controls || {};
    const layout = formConfig?.layout || {};
    const customBlocksMap = formConfig?.customBlocks || {};
    const customFieldsMap = formConfig?.customFields || {};
    const sectionGap = Number(layout.sectionGap ?? 24);
    const cardPadding = Number(layout.cardPadding ?? 32);
    const stackStyle: React.CSSProperties = { gap: `${sectionGap}px` };
    const pageTitle = isEditMode ? (layout.titleEdit || 'Edit Gig') : (layout.titleCreate || 'Create New Gig');
    const showAI = controls.showAI !== false;
    const showPackages = controls.showPackages !== false;
    const showPackageFeatures = controls.showPackageFeatures !== false;
    const showExtras = controls.showExtras !== false;
    const showFAQs = controls.showFAQs !== false;
    const showRequirements = controls.showRequirements !== false;
    const showGalleryImages = controls.showGalleryImages !== false;
    const showGalleryVideos = controls.showGalleryVideos !== false;
    const showGalleryDocs = controls.showGalleryDocs !== false;
    const currentStepId = steps[currentStep - 1]?.id || 'overview';

    const getCustomFieldValue = (key: string) => {
        const meta = (gig.meta as any) || {};
        const fields = meta.customFields || meta.formFields || {};
        return fields?.[key] ?? '';
    };

    const setCustomFieldValue = (key: string, value: any) => {
        setGig((prev) => {
            const meta = { ...(prev.meta as any) };
            const existing = meta.customFields || meta.formFields || {};
            meta.customFields = { ...existing, [key]: value };
            return { ...prev, meta };
        });
    };

    const validateCustomFields = (stepId: string) => {
        const fields = Array.isArray(customFieldsMap?.[stepId]) ? customFieldsMap[stepId] : [];
        for (const field of fields) {
            if (!field || field.required !== true) continue;
            const key = field.key || field.name || field.id;
            if (!key) continue;
            const value = getCustomFieldValue(key);
            const isEmpty =
                field.type === 'checkbox'
                    ? value !== true
                    : value === undefined || value === null || String(value).trim() === '';
            if (isEmpty) {
                showNotification('alert', 'Required', `${field.label || key} is required.`);
                return false;
            }
        }
        return true;
    };

    const renderCustomBlocks = (stepId: string) => {
        const blocks = Array.isArray(customBlocksMap?.[stepId]) ? customBlocksMap[stepId] : [];
        if (!blocks.length) return null;
        return (
            <div className="space-y-3">
                {blocks.map((block: any, idx: number) => {
                    const key = block.id || `${stepId}-block-${idx}`;
                    const type = (block.type || 'text').toString().toLowerCase();
                    const content = block.content ?? block.text ?? '';
                    if (type === 'divider') {
                        return <hr key={key} className="border-gray-200" />;
                    }
                    if (type === 'spacer') {
                        const height = Number(block.height || 16);
                        return <div key={key} style={{ height }} />;
                    }
                    if (type === 'heading') {
                        return <h3 key={key} className="text-lg font-bold text-gray-900">{content}</h3>;
                    }
                    if (type === 'note') {
                        const tone = (block.tone || 'info').toString().toLowerCase();
                        const toneClass =
                            tone === 'success'
                                ? 'bg-green-50 border-green-200 text-green-800'
                                : tone === 'warning'
                                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                                    : tone === 'danger'
                                        ? 'bg-red-50 border-red-200 text-red-800'
                                        : 'bg-blue-50 border-blue-200 text-blue-800';
                        return (
                            <div key={key} className={`rounded-lg border p-3 text-sm ${toneClass}`}>
                                {content}
                            </div>
                        );
                    }
                    if (type === 'html') {
                        return (
                            <div
                                key={key}
                                className="prose prose-sm max-w-none text-gray-700"
                                dangerouslySetInnerHTML={{ __html: String(content || '') }}
                            />
                        );
                    }
                    return (
                        <p key={key} className="text-sm text-gray-600">{content}</p>
                    );
                })}
            </div>
        );
    };

    const renderCustomFields = (stepId: string) => {
        const fields = Array.isArray(customFieldsMap?.[stepId]) ? customFieldsMap[stepId] : [];
        if (!fields.length) return null;
        return (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="font-bold text-gray-900 mb-3">Additional Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fields.map((field: any, idx: number) => {
                        const key = field.key || field.name || field.id || `${stepId}-field-${idx}`;
                        const type = (field.type || 'text').toString().toLowerCase();
                        const label = field.label || key;
                        const placeholder = field.placeholder || '';
                        const value = getCustomFieldValue(key);
                        if (type === 'textarea') {
                            return (
                                <label key={key} className="flex flex-col text-sm text-gray-700 md:col-span-2">
                                    <span className="font-semibold mb-1">{label}{field.required ? ' *' : ''}</span>
                                    <textarea
                                        className="border rounded-lg p-2"
                                        rows={4}
                                        placeholder={placeholder}
                                        value={value}
                                        onChange={(e) => setCustomFieldValue(key, e.target.value)}
                                    />
                                </label>
                            );
                        }
                        if (type === 'select') {
                            const options = Array.isArray(field.options) ? field.options : [];
                            return (
                                <label key={key} className="flex flex-col text-sm text-gray-700">
                                    <span className="font-semibold mb-1">{label}{field.required ? ' *' : ''}</span>
                                    <select
                                        className="border rounded-lg p-2 bg-white"
                                        value={value}
                                        onChange={(e) => setCustomFieldValue(key, e.target.value)}
                                    >
                                        <option value="">Select</option>
                                        {options.map((opt: any, optIdx: number) => {
                                            const optValue = opt?.value ?? opt?.label ?? opt;
                                            const optLabel = opt?.label ?? opt?.value ?? opt;
                                            return <option key={`${key}-${optIdx}`} value={optValue}>{optLabel}</option>;
                                        })}
                                    </select>
                                </label>
                            );
                        }
                        if (type === 'checkbox') {
                            return (
                                <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(value)}
                                        onChange={(e) => setCustomFieldValue(key, e.target.checked)}
                                    />
                                    <span className="font-semibold">{label}{field.required ? ' *' : ''}</span>
                                </label>
                            );
                        }
                        return (
                            <label key={key} className="flex flex-col text-sm text-gray-700">
                                <span className="font-semibold mb-1">{label}{field.required ? ' *' : ''}</span>
                                <input
                                    type={type === 'number' ? 'number' : 'text'}
                                    className="border rounded-lg p-2"
                                    placeholder={placeholder}
                                    value={value}
                                    onChange={(e) => setCustomFieldValue(key, e.target.value)}
                                />
                            </label>
                        );
                    })}
                </div>
            </div>
        );
    };

    useEffect(() => {
        const init = async () => {
            try {
                // Prefer public categories (DB-backed), fall back to admin endpoint if needed
                try {
                    const publicCats = await categoriesApi.getGigCategories();
                    setCategories(publicCats.categories || [] as any);
                } catch (publicErr) {
                    console.warn('Public categories fetch failed, falling back to admin categories:', publicErr);
                    try {
                        const cats = await AdminService.getGigCategories();
                        setCategories(cats);
                    } catch (adminCatErr) {
                        console.error('Admin getGigCategories failed too:', adminCatErr);
                        throw adminCatErr; // will be caught by outer try/catch
                    }
                }

                if (isEditMode) {
                    // Fetch existing gig
                    try {
                        const resp = await api.get(`/gigs/${encodeURIComponent(gigId || '')}`);
                        const payload = resp.data?.data ?? resp.data;
                        const existing = payload || null;
                        if (existing) {
                            setGig((prev) => ({
                                ...prev,
                                ...existing,
                                pricingMode: existing?.pricingMode ?? existing?.pricing_mode ?? prev.pricingMode,
                                packages: Array.isArray(existing?.packages) && existing.packages.length
                                    ? existing.packages.map((pkg: any, idx: number) => ({
                                        name: pkg?.name || prev.packages?.[idx]?.name || `Package ${idx + 1}`,
                                        description: pkg?.description ?? '',
                                        deliveryDays: pkg?.deliveryDays ?? pkg?.delivery_days ?? 0,
                                        revisions: pkg?.revisions ?? 0,
                                        price: Number(pkg?.price ?? 0),
                                        features: Array.isArray(pkg?.features) ? pkg.features : []
                                    }))
                                    : prev.packages,
                                extras: Array.isArray(existing?.extras)
                                    ? existing.extras.map((extra: any) => ({
                                        ...extra,
                                        additional_days: extra?.additional_days ?? extra?.additionalDays ?? 0,
                                        applies_to: extra?.applies_to ?? extra?.appliesTo ?? 'all'
                                    }))
                                    : prev.extras,
                                faqs: Array.isArray(existing?.faqs) ? existing.faqs : prev.faqs,
                                requirements: Array.isArray(existing?.requirements) ? existing.requirements : prev.requirements,
                                price: existing?.price?.amount ?? existing?.price ?? prev.price,
                                images: existing?.images || existing?.media || prev.images,
                                videos: existing?.videos || prev.videos,
                                documents: existing?.documents || prev.documents,
                                image: existing?.image ?? existing?.images?.[0] ?? prev.image
                            }));
                            setDraftId(existing.id || gigId);
                        } else {
                            showNotification('alert', 'Error', 'Gig not found');
                            navigate('/freelancer/dashboard');
                        }
                    } catch (gErr) {
                        console.warn('Failed to load admin gigs:', gErr);
                        showNotification('alert', 'Error', 'Unable to load gig for editing.');
                        navigate('/freelancer/dashboard');
                    }
                } else if (searchParams.get('mode') === 'ai_draft') {
                 // Load AI draft from session storage
                 const draft = sessionStorage.getItem('ai_job_brief'); // Reusing brief logic or new
                 if(draft) {
                     // logic to parse draft
                 }
            }
            } catch (error) {
                console.error('Failed to initialize CreateGig data:', error);
                showNotification('alert', 'Error', 'Failed to load categories. Please try again later.');
                setCategories([]);
            } finally {
                setLoadingData(false);
            }
        };
        init();
    }, [gigId]);

    // Update subcategories when category changes
    useEffect(() => {
        const cat = categories.find(c => c.name === gig.category);
        setAvailableSubs(cat ? cat.subcategories : []);
    }, [gig.category, categories]);

    const handleAIGenerate = async () => {
        if (!aiPrompt.trim()) return;
        setIsAIGenerating(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 1500)); // Mock delay
            
            const generatedGig: Partial<Gig> = {
                title: `I will ${aiPrompt.toLowerCase()} professionally`,
                description: `<p>I am an expert in ${aiPrompt}. I will provide high-quality results tailored to your needs.</p><ul><li>Professional Quality</li><li>Fast Delivery</li></ul>`,
                category: categories[0]?.name || 'General',
                price: 50,
                packages: [
                    { name: 'Basic', description: 'Starter package', deliveryDays: 2, revisions: 1, price: 50, features: ['Initial Concept'] },
                    { name: 'Standard', description: 'Standard package', deliveryDays: 4, revisions: 3, price: 100, features: ['Source File'] },
                    { name: 'Premium', description: 'Premium package', deliveryDays: 7, revisions: -1, price: 200, features: ['VIP Support'] }
                ]
            };
            
            setGig(prev => ({ ...prev, ...generatedGig }));
            setShowAIModal(false);
            showNotification('success', 'Gig Generated', 'AI has drafted your details.');
        } catch (error) {
            showNotification('alert', 'Error', 'AI generation failed.');
        } finally {
            setIsAIGenerating(false);
        }
    };

    const handleNext = () => {
        if (currentStepId === 'overview' && (!gig.title || !gig.category)) {
            showNotification('alert', 'Required', 'Title and Category are required.');
            return;
        }
        if (currentStepId === 'description' && !gig.description) {
            showNotification('alert', 'Required', 'Description is required.');
            return;
        }
        if (!validateCustomFields(currentStepId)) {
            return;
        }
        
        if (currentStep < steps.length) setCurrentStep(c => c + 1);
        else handlePublish();
    };

    const handleBack = () => {
        if (currentStep > 1) setCurrentStep(c => c - 1);
    };

    const buildGigPayload = (includeStatus: boolean) => {
        const selectedCategory = categories.find(
            (cat) => cat.name === gig.category || cat.id === gig.category
        );
        const payload: any = {
            title: gig.title,
            description: gig.description,
            category: gig.category,
            subcategory: gig.subcategory,
            price: typeof gig.price === 'number' ? gig.price : Number(gig.price || 0),
            pricingMode: gig.pricingMode,
            packages: gig.packages || [],
            extras: gig.extras || [],
            faqs: gig.faqs || [],
            requirements: gig.requirements || [],
            images: gig.images || [],
            videos: gig.videos || [],
            documents: gig.documents || [],
            tags: gig.tags || [],
            meta: gig.meta,
            image: gig.image || (gig.images && gig.images.length ? gig.images[0] : undefined)
        };
        if (selectedCategory?.id) payload.categoryId = selectedCategory.id;
        if (gig.deliveryTime !== undefined) payload.deliveryTime = gig.deliveryTime;
        if (gig.revisions !== undefined) payload.revisions = gig.revisions;
        if (includeStatus) {
            payload.status = 'draft';
            payload.adminStatus = gig.adminStatus || 'pending';
            payload.isVisible = false;
            payload.isActive = false;
        }
        return payload;
    };

    const handlePublish = async () => {
        try {
            let id = gig.id || draftId || undefined;
            if (id) {
                await gigsApi.updateGig(id, buildGigPayload(false));
            } else {
                const created = await gigsApi.createGig(buildGigPayload(true));
                if (created?.id) {
                    id = created.id;
                    setDraftId(created.id);
                    setGig((prev) => ({ ...prev, id: created.id }));
                }
            }

            if (needsReview && id) {
                await gigsApi.submitGig(id);
                showNotification('success', 'Submitted', 'Gig submitted for review.');
            } else {
                showNotification('success', 'Updated', isPending ? 'Changes saved. Gig is still under review.' : 'Gig updated successfully.');
            }

            navigate('/freelancer/dashboard?tab=my-gigs');
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to save gig.');
        }
    };

    const saveDraftNow = async () => {
        if (!user || !hasDraftContent()) {
            showNotification('alert', 'Draft', 'Add at least a title or category before saving.');
            return;
        }
        try {
            setAutoSaving(true);
            const existingId = gig.id || draftId || undefined;
            if (existingId) {
                await gigsApi.updateGig(existingId, buildGigPayload(false));
                showNotification('success', 'Saved', 'Your gig changes have been saved.');
            } else {
                const created = await gigsApi.createGig(buildGigPayload(true));
                if (created?.id) {
                    setDraftId(created.id);
                    setGig((prev) => ({ ...prev, id: created.id }));
                }
                showNotification('success', 'Draft Saved', 'Your gig draft has been saved.');
            }
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to save draft.');
        } finally {
            setAutoSaving(false);
        }
    };

    const hasDraftContent = () => {
        return Boolean(
            (gig.title && gig.title.trim()) ||
            (gig.category && gig.category.trim()) ||
            (gig.subcategory && gig.subcategory.trim()) ||
            (gig.description && gig.description.toString().trim()) ||
            (gig.images && gig.images.length) ||
            (gig.videos && gig.videos.length) ||
            (gig.documents && gig.documents.length) ||
            (gig.packages && gig.packages.length && gig.packages.some(p => Number(p.price) > 0))
        );
    };

    useEffect(() => {
        if (loadingData || !user) return;
        if (!hasDraftContent()) return;

        if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = window.setTimeout(async () => {
            try {
                setAutoSaving(true);
                const existingId = gig.id || draftId || undefined;
                if (existingId) {
                    await gigsApi.updateGig(existingId, buildGigPayload(false));
                } else {
                    const created = await gigsApi.createGig(buildGigPayload(true));
                    if (created?.id) {
                        setDraftId(created.id);
                        setGig((prev) => ({ ...prev, id: created.id }));
                    }
                }
            } catch (error) {
                console.warn('Auto-save gig failed:', error);
            } finally {
                setAutoSaving(false);
            }
        }, 1200);

        return () => {
            if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
        };
    }, [gig, user?.id, loadingData]);

    const updatePackage = (idx: number, field: keyof GigPackage, val: any) => {
        const pkgs = [...(gig.packages || [])];
        pkgs[idx] = { ...pkgs[idx], [field]: val };
        const price = idx === 0 && field === 'price' ? Number(val) : gig.price;
        setGig({ ...gig, packages: pkgs, price });
    };

    const addPackageFeature = (pkgIdx: number) => {
        const pkgs = [...(gig.packages || [])];
        const features = Array.isArray(pkgs[pkgIdx]?.features) ? [...(pkgs[pkgIdx]?.features || [])] : [];
        pkgs[pkgIdx] = { ...pkgs[pkgIdx], features: [...features, ''] };
        setGig({ ...gig, packages: pkgs });
    };

    const updatePackageFeature = (pkgIdx: number, featureIdx: number, value: string) => {
        const pkgs = [...(gig.packages || [])];
        const features = Array.isArray(pkgs[pkgIdx]?.features) ? [...(pkgs[pkgIdx]?.features || [])] : [];
        features[featureIdx] = value;
        pkgs[pkgIdx] = { ...pkgs[pkgIdx], features };
        setGig({ ...gig, packages: pkgs });
    };

    const removePackageFeature = (pkgIdx: number, featureIdx: number) => {
        const pkgs = [...(gig.packages || [])];
        const features = Array.isArray(pkgs[pkgIdx]?.features) ? [...(pkgs[pkgIdx]?.features || [])] : [];
        pkgs[pkgIdx] = { ...pkgs[pkgIdx], features: features.filter((_, idx) => idx !== featureIdx) };
        setGig({ ...gig, packages: pkgs });
    };

    const addExtra = () =>
        setGig({
            ...gig,
            extras: [
                ...(gig.extras || []),
                { id: Date.now().toString(), title: '', description: '', price: 0, additional_days: 0, applies_to: 'all' }
            ]
        });

    const removeExtra = (idx: number) =>
        setGig({ ...gig, extras: gig.extras?.filter((_, i) => i !== idx) });

    const updateExtra = (idx: number, field: keyof GigExtra, val: any) => {
        const newExtras = [...(gig.extras || [])];
        newExtras[idx] = { ...newExtras[idx], [field]: val };
        setGig({ ...gig, extras: newExtras });
    };

    const addFAQ = () =>
        setGig({ ...gig, faqs: [...(gig.faqs || []), { id: Date.now().toString(), question: '', answer: '' }] });

    const removeFAQ = (idx: number) =>
        setGig({ ...gig, faqs: gig.faqs?.filter((_, i) => i !== idx) });

    const updateFAQ = (idx: number, field: keyof GigFAQ, val: string) => {
        const newFaqs = [...(gig.faqs || [])];
        newFaqs[idx] = { ...newFaqs[idx], [field]: val };
        setGig({ ...gig, faqs: newFaqs });
    };

    const addReq = () =>
        setGig({
            ...gig,
            requirements: [...(gig.requirements || []), { id: Date.now().toString(), question: '', type: 'text', required: true }]
        });

    const removeReq = (idx: number) =>
        setGig({ ...gig, requirements: gig.requirements?.filter((_, i) => i !== idx) });

    const updateReq = (idx: number, field: keyof GigRequirement, val: any) => {
        const newReqs = [...(gig.requirements || [])];
        if (field === 'type') {
            if (val === 'file') {
                newReqs[idx] = {
                    ...newReqs[idx],
                    type: 'file',
                    fileTypes: Array.isArray(newReqs[idx].fileTypes) && newReqs[idx].fileTypes?.length ? newReqs[idx].fileTypes : ['images'],
                    maxFiles: newReqs[idx].maxFiles ?? 1
                };
            } else {
                const { fileTypes, maxFiles, ...rest } = newReqs[idx] as any;
                newReqs[idx] = { ...rest, type: 'text' };
            }
        } else {
            newReqs[idx] = { ...newReqs[idx], [field]: val };
        }
        setGig({ ...gig, requirements: newReqs });
    };

    const requirementFileTypes = [
        { value: 'images', label: 'Images (JPG, PNG)' },
        { value: 'pdf', label: 'PDF' },
        { value: 'doc', label: 'DOC/DOCX' },
        { value: 'zip', label: 'ZIP' },
        { value: 'other', label: 'Other' }
    ];

    const toggleRequirementFileType = (idx: number, fileType: string) => {
        const newReqs = [...(gig.requirements || [])];
        const current = Array.isArray(newReqs[idx]?.fileTypes) ? [...(newReqs[idx]?.fileTypes || [])] : [];
        const next = current.includes(fileType) ? current.filter(t => t !== fileType) : [...current, fileType];
        newReqs[idx] = { ...newReqs[idx], fileTypes: next };
        setGig({ ...gig, requirements: newReqs });
    };

    const updateRequirementMaxFiles = (idx: number, value: number | null) => {
        const newReqs = [...(gig.requirements || [])];
        newReqs[idx] = { ...newReqs[idx], maxFiles: value ?? undefined };
        setGig({ ...gig, requirements: newReqs });
    };

    const handleFileSelect = (file: UploadedFile) => {
        if (filePickerMode === 'image') {
            const currentImages = gig.images || [];
            if (currentImages.length >= 6) {
                showNotification('alert', 'Limit Reached', 'Max 6 images allowed.');
                return;
            }
            const image = !gig.image ? file.url : gig.image;
            setGig(prev => ({ ...prev, image, images: [...(prev.images || []), file.url] }));
        } else if (filePickerMode === 'video') {
            // Replace existing video to ensure only "a Video" (singular)
            setGig(prev => ({ ...prev, videos: [file.url] }));
        } else if (filePickerMode === 'document') {
            const currentDocs = gig.documents || [];
            if (currentDocs.length >= 2) {
                 showNotification('alert', 'Limit Reached', 'Max 2 documents allowed.');
                 return;
            }
            setGig(prev => ({ ...prev, documents: [...(prev.documents || []), file.url] }));
        }
        setIsFilePickerOpen(false);
    };

    const getAcceptedTypes = () => {
        if (filePickerMode === 'image') return "image/*";
        if (filePickerMode === 'video') return "video/*";
        if (filePickerMode === 'document') return ".pdf,.doc,.docx,.txt";
        return "*";
    };

    if (loadingData) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-600"/></div>;

    return (
        <div className="min-h-screen bg-gray-50 pt-20 pb-12 px-4">
            <div className="max-w-5xl mx-auto">
                <div className="mb-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">{pageTitle}</h1>
                    </div>
                    {!isEditMode && showAI && (
                        <button 
                            onClick={() => setShowAIModal(true)}
                            className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-bold flex items-center hover:bg-indigo-200 transition"
                        >
                            <Sparkles className="w-4 h-4 mr-2" /> AI Assistant
                        </button>
                    )}
                </div>

                {/* Progress Steps */}
                <div className="flex items-center justify-between relative overflow-x-auto pb-4 mb-4">
                    <div className="absolute left-0 top-4 w-full h-1 bg-gray-200 -z-10 rounded"></div>
                    {steps.map((step, idx) => (
                        <div key={step.id || idx} className={`flex flex-col items-center bg-gray-50 px-4 min-w-[100px] ${currentStep > idx + 1 ? 'text-green-600' : currentStep === idx + 1 ? 'text-indigo-600' : 'text-gray-400'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-2 transition-colors ${
                                currentStep > idx + 1 ? 'bg-green-100' : currentStep === idx + 1 ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-200'
                            }`}>
                                {currentStep > idx + 1 ? <CheckCircle className="w-5 h-5" /> : idx + 1}
                            </div>
                            <span className="text-xs font-medium text-center whitespace-nowrap">{step.label || `Step ${idx + 1}`}</span>
                        </div>
                    ))}
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[600px] flex flex-col">
                    <div className="flex-1" style={{ padding: cardPadding }}>
                        
                        {/* STEP 1: OVERVIEW */}
                        {currentStepId === 'overview' && (
                            <div className="max-w-2xl mx-auto flex flex-col animate-fade-in" style={stackStyle}>
                                {renderCustomBlocks(currentStepId)}
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-1">{labels.titleLabel || 'Gig Title'}</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-3 text-gray-500 font-medium">I will</span>
                                        <input 
                                            className="w-full pl-14 border-gray-300 rounded-xl p-3 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" 
                                            placeholder="do something I'm really good at"
                                            value={gig.title?.startsWith('I will ') ? gig.title.replace('I will ', '') : gig.title}
                                            onChange={e => setGig({...gig, title: `I will ${e.target.value}`})}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-1">{labels.categoryLabel || 'Category'}</label>
                                        <select 
                                            className="w-full border-gray-300 rounded-xl p-3 shadow-sm bg-white"
                                            value={gig.category}
                                            onChange={e => setGig({...gig, category: e.target.value, subcategory: ''})}
                                        >
                                            <option value="">Select Category</option>
                                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-1">{labels.subcategoryLabel || 'Subcategory'}</label>
                                        <select 
                                            className="w-full border-gray-300 rounded-xl p-3 shadow-sm bg-white"
                                            value={gig.subcategory}
                                            onChange={e => setGig({...gig, subcategory: e.target.value})}
                                            disabled={!availableSubs.length}
                                        >
                                            <option value="">Select Subcategory</option>
                                            {availableSubs.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {renderCustomFields(currentStepId)}
                            </div>
                        )}

                        {/* STEP 2: PRICING */}
                        {currentStepId === 'pricing' && (
                            <div className="flex flex-col animate-fade-in" style={stackStyle}>
                                {renderCustomBlocks(currentStepId)}
                                <div className="flex items-center justify-between">
                                    <h3 className="text-lg font-bold text-gray-900">{labels.pricingTitle || 'Scope & Pricing'}</h3>
                                </div>

                                {showPackages ? (
                                    <div className="overflow-x-auto border rounded-xl shadow-sm">
                                        <table className="w-full text-sm border-collapse">
                                            <thead>
                                                <tr className="bg-gray-50 text-left">
                                                    <th className="p-4 w-1/4 border-r font-medium text-gray-500 uppercase text-xs tracking-wider"></th>
                                                    {(gig.packages || []).map((pkg, i) => (
                                                        <th key={i} className="p-3 border-r last:border-r-0 text-center bg-gray-50">
                                                            <input
                                                                className="w-full border border-gray-300 rounded-lg px-2 py-1 text-center text-sm font-bold text-gray-900 bg-white"
                                                                value={pkg.name || ''}
                                                                onChange={(e) => updatePackage(i, 'name', e.target.value)}
                                                                placeholder={`Package ${i + 1}`}
                                                            />
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td className="p-4 border-r border-t font-medium text-gray-700 bg-gray-50">Description</td>
                                                    {gig.packages?.map((pkg, i) => (
                                                        <td key={i} className="p-2 border-r border-t last:border-r-0">
                                                            <textarea className="w-full border-gray-200 rounded-lg text-sm p-3 min-h-[100px]" value={pkg.description} onChange={(e) => updatePackage(i, 'description', e.target.value)} />
                                                        </td>
                                                    ))}
                                                </tr>
                                                <tr>
                                                    <td className="p-4 border-r border-t font-medium text-gray-700 bg-gray-50">Delivery (Days)</td>
                                                    {gig.packages?.map((pkg, i) => (
                                                        <td key={i} className="p-2 border-r border-t last:border-r-0">
                                                            <input type="number" className="w-full border-gray-200 rounded-lg p-2 text-center" value={pkg.deliveryDays} onChange={(e) => updatePackage(i, 'deliveryDays', parseInt(e.target.value))} />
                                                        </td>
                                                    ))}
                                                </tr>
                                                <tr>
                                                    <td className="p-4 border-r border-t font-medium text-gray-700 bg-gray-50">Revisions</td>
                                                    {gig.packages?.map((pkg, i) => (
                                                        <td key={i} className="p-2 border-r border-t last:border-r-0">
                                                            <input
                                                                type="number"
                                                                className="w-full border-gray-200 rounded-lg p-2 text-center"
                                                                value={pkg.revisions}
                                                                onChange={(e) => updatePackage(i, 'revisions', parseInt(e.target.value))}
                                                            />
                                                            <div className="text-[10px] text-gray-400 mt-1">Use -1 for unlimited</div>
                                                        </td>
                                                    ))}
                                                </tr>
                                                <tr>
                                                    <td className="p-4 border-r border-t font-medium text-gray-700 bg-gray-50">Price ($)</td>
                                                    {gig.packages?.map((pkg, i) => (
                                                        <td key={i} className="p-2 border-r border-t last:border-r-0">
                                                            <input type="number" className="w-full border-gray-200 rounded-lg p-2 font-bold text-center" value={pkg.price} onChange={(e) => updatePackage(i, 'price', parseInt(e.target.value))} />
                                                        </td>
                                                    ))}
                                                </tr>
                                                {showPackageFeatures && (
                                                    <tr>
                                                        <td className="p-4 border-r border-t font-medium text-gray-700 bg-gray-50">Features</td>
                                                        {gig.packages?.map((pkg, pkgIdx) => (
                                                            <td key={pkgIdx} className="p-2 border-r border-t last:border-r-0 align-top">
                                                                <div className="space-y-2">
                                                                    {(pkg.features || []).map((feature, fIdx) => (
                                                                        <div key={fIdx} className="flex items-center gap-2">
                                                                            <input
                                                                                className="flex-1 border border-gray-300 rounded-lg p-2 text-sm"
                                                                                placeholder="Feature"
                                                                                value={feature}
                                                                                onChange={(e) => updatePackageFeature(pkgIdx, fIdx, e.target.value)}
                                                                            />
                                                                            <button
                                                                                onClick={() => removePackageFeature(pkgIdx, fIdx)}
                                                                                className="text-gray-400 hover:text-red-500"
                                                                                title="Remove feature"
                                                                            >
                                                                                <X className="w-4 h-4" />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                    <button
                                                                        onClick={() => addPackageFeature(pkgIdx)}
                                                                        className="text-xs text-indigo-600 font-semibold hover:underline flex items-center"
                                                                    >
                                                                        <Plus className="w-3 h-3 mr-1" /> Add Feature
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        ))}
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="bg-white border border-gray-200 rounded-xl p-4 max-w-md">
                                        <label className="block text-sm font-bold text-gray-900 mb-2">Base Price ($)</label>
                                        <input
                                            type="number"
                                            className="w-full border border-gray-300 rounded-lg p-2"
                                            value={Number(gig.price ?? 0)}
                                            onChange={(e) => {
                                                const val = Number(e.target.value || 0);
                                                const pkgs = [...(gig.packages || [])];
                                                if (pkgs[0]) pkgs[0] = { ...pkgs[0], price: val };
                                                setGig({ ...gig, price: val, packages: pkgs });
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Package features are shown in the pricing table now */}

                                {showExtras && (
                                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="font-bold text-gray-900">{labels.extrasTitle || 'Gig Extras'}</h3>
                                            <button
                                                onClick={addExtra}
                                                className="text-xs text-indigo-600 font-semibold hover:underline flex items-center"
                                            >
                                                <Plus className="w-3 h-3 mr-1" /> Add Extra
                                            </button>
                                        </div>
                                        <div className="space-y-4">
                                            {(gig.extras || []).map((extra, idx) => (
                                                <div key={idx} className="border border-gray-200 rounded-lg p-3 relative">
                                                    <button
                                                        onClick={() => removeExtra(idx)}
                                                        className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                                                        title="Remove extra"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
                                                            <input
                                                                className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                                                                value={extra.title}
                                                                onChange={(e) => updateExtra(idx, 'title', e.target.value)}
                                                                placeholder="Extra title"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-600 mb-1">Price ($)</label>
                                                            <input
                                                                type="number"
                                                                className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                                                                value={extra.price}
                                                                onChange={(e) => updateExtra(idx, 'price', Number(e.target.value))}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="mt-3">
                                                        <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                                                        <textarea
                                                            className="w-full border border-gray-300 rounded-lg p-2 text-sm min-h-[80px]"
                                                            value={extra.description}
                                                            onChange={(e) => updateExtra(idx, 'description', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-600 mb-1">Additional Days</label>
                                                            <input
                                                                type="number"
                                                                className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                                                                value={(extra as any).additional_days ?? (extra as any).additionalDays ?? 0}
                                                                onChange={(e) => updateExtra(idx, 'additional_days' as keyof GigExtra, Number(e.target.value))}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-600 mb-1">Applies To</label>
                                                            <select
                                                                className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white"
                                                                value={(extra as any).applies_to ?? (extra as any).appliesTo ?? 'all'}
                                                                onChange={(e) => updateExtra(idx, 'applies_to' as keyof GigExtra, e.target.value)}
                                                            >
                                                                <option value="all">All Packages</option>
                                                                <option value="basic">Basic</option>
                                                                <option value="standard">Standard</option>
                                                                <option value="premium">Premium</option>
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {(gig.extras || []).length === 0 && (
                                                <div className="text-sm text-gray-500">No extras added yet.</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {renderCustomFields(currentStepId)}
                            </div>
                        )}

                        {/* STEP 3: DESCRIPTION */}
                        {currentStepId === 'description' && (
                            <div className="max-w-3xl mx-auto flex flex-col animate-fade-in" style={stackStyle}>
                                {renderCustomBlocks(currentStepId)}
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">{labels.descriptionLabel || 'Gig Description'}</label>
                                    <RichTextEditor 
                                        value={gig.description || ''} 
                                        onChange={(val) => setGig({...gig, description: val})} 
                                        placeholder="Describe your gig in detail..." 
                                        height="300px" 
                                    />
                                </div>
                                <div className="bg-indigo-50 p-4 rounded-lg flex items-start">
                                    <Sparkles className="w-5 h-5 text-indigo-600 mr-3 mt-0.5" />
                                    <div>
                                        <h4 className="text-sm font-bold text-indigo-900">AI Tip</h4>
                                        <p className="text-xs text-indigo-700">Use formatting to make your description easy to read. Highlight key benefits.</p>
                                    </div>
                                </div>
                                {showFAQs && (
                                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="font-bold text-gray-900">{labels.faqTitle || 'FAQs'}</h3>
                                            <button
                                                onClick={addFAQ}
                                                className="text-xs text-indigo-600 font-semibold hover:underline flex items-center"
                                            >
                                                <Plus className="w-3 h-3 mr-1" /> Add FAQ
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {(gig.faqs || []).map((faq, idx) => (
                                                <div key={idx} className="border border-gray-200 rounded-lg p-3 relative">
                                                    <button
                                                        onClick={() => removeFAQ(idx)}
                                                        className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                                                        title="Remove FAQ"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                    <div className="mb-2">
                                                        <label className="block text-xs font-semibold text-gray-600 mb-1">Question</label>
                                                        <input
                                                            className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                                                            value={faq.question}
                                                            onChange={(e) => updateFAQ(idx, 'question', e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-gray-600 mb-1">Answer</label>
                                                        <textarea
                                                            className="w-full border border-gray-300 rounded-lg p-2 text-sm min-h-[90px]"
                                                            value={faq.answer}
                                                            onChange={(e) => updateFAQ(idx, 'answer', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                            {(gig.faqs || []).length === 0 && (
                                                <div className="text-sm text-gray-500">No FAQs added yet.</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {renderCustomFields(currentStepId)}
                            </div>
                        )}

                        {/* STEP 4: REQUIREMENTS */}
                        {currentStepId === 'requirements' && (
                            <div className="max-w-3xl mx-auto flex flex-col animate-fade-in" style={stackStyle}>
                                {renderCustomBlocks(currentStepId)}
                                {!showRequirements && (
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                                        {labels.requirementsTitle || 'Requirements'} are disabled by the admin.
                                    </div>
                                )}

                                {showRequirements && (
                                    <>
                                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-start">
                                            <HelpCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5" />
                                            <p className="text-sm text-blue-800">Tell buyers what you need to start the order.</p>
                                        </div>

                                        {(gig.requirements || []).map((req, i) => (
                                            <div key={i} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm relative">
                                                <button
                                                    onClick={() => removeReq(i)}
                                                    className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                                                    <div className="md:col-span-2">
                                                        <label className="block text-xs font-semibold text-gray-600 mb-1">Question</label>
                                                        <input
                                                            className="w-full border-gray-300 rounded-lg text-sm font-medium p-2"
                                                            value={req.question}
                                                            onChange={e => updateReq(i, 'question', e.target.value)}
                                                            placeholder="Requirement question..."
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
                                                        <select
                                                            className="w-full border-gray-300 rounded-lg p-2 text-sm bg-white"
                                                            value={req.type}
                                                            onChange={(e) => updateReq(i, 'type', e.target.value)}
                                                        >
                                                            <option value="text">Text</option>
                                                            <option value="file">File Upload</option>
                                                        </select>
                                                    </div>
                                                    <div className="flex items-center gap-2 pt-6">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded"
                                                            checked={Boolean(req.required)}
                                                            onChange={(e) => updateReq(i, 'required', e.target.checked)}
                                                        />
                                                        <span className="text-sm text-gray-600">Required</span>
                                                    </div>
                                                </div>

                                                {req.type === 'file' && (
                                                    <div className="border-t border-gray-100 pt-3 mt-2 space-y-3">
                                                        <div>
                                                            <label className="block text-xs font-semibold text-gray-600 mb-1">Allowed File Types</label>
                                                            <div className="flex flex-wrap gap-2">
                                                                {requirementFileTypes.map((opt) => {
                                                                    const active = Array.isArray(req.fileTypes) && req.fileTypes.includes(opt.value);
                                                                    return (
                                                                        <button
                                                                            key={opt.value}
                                                                            type="button"
                                                                            onClick={() => toggleRequirementFileType(i, opt.value)}
                                                                            className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                                                                                active ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-600'
                                                                            }`}
                                                                        >
                                                                            {opt.label}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="block text-xs font-semibold text-gray-600 mb-1">Max Files</label>
                                                                <input
                                                                    type="number"
                                                                    min={1}
                                                                    className="w-full border-gray-300 rounded-lg p-2 text-sm"
                                                                    value={req.maxFiles ?? ''}
                                                                    onChange={(e) => updateRequirementMaxFiles(i, e.target.value ? Number(e.target.value) : null)}
                                                                    placeholder="1"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        <button
                                            onClick={addReq}
                                            className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-500 hover:text-indigo-600 font-medium transition flex items-center justify-center"
                                        >
                                            <Plus className="w-4 h-4 mr-2" /> Add Requirement
                                        </button>
                                    </>
                                )}
                                {renderCustomFields(currentStepId)}
                            </div>
                        )}

                        {/* STEP 5: GALLERY */}
                        {currentStepId === 'gallery' && (
                            <div className="max-w-4xl mx-auto flex flex-col animate-fade-in" style={stackStyle}>
                                {renderCustomBlocks(currentStepId)}
                                {!showGalleryImages && !showGalleryVideos && !showGalleryDocs && (
                                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                                        {labels.galleryTitle || 'Gallery'} is disabled by the admin.
                                    </div>
                                )}
                                {/* Images Section */}
                                {showGalleryImages && (
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900 mb-4">Gig Images (Max 6)</h3>
                                        <div className="grid grid-cols-3 gap-6">
                                            {(gig.images || []).map((img, i) => (
                                                <div key={i} className="aspect-[4/3] relative rounded-xl overflow-hidden border border-gray-200 group">
                                                    <img src={img} className="w-full h-full object-cover" />
                                                    <button 
                                                        onClick={() => setGig({...gig, images: gig.images?.filter((_, idx) => idx !== i)})}
                                                        className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow hover:bg-red-700 opacity-0 group-hover:opacity-100 transition"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            {(gig.images?.length || 0) < 6 && (
                                                <div 
                                                    onClick={() => { setFilePickerMode('image'); setIsFilePickerOpen(true); }}
                                                    className="aspect-[4/3] border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition text-gray-400 hover:text-indigo-600 hover:border-indigo-300"
                                                >
                                                    <ImageIcon className="w-8 h-8 mb-2" />
                                                    <span className="text-xs font-medium">Add Image</span>
                                                    <span className="text-[10px] mt-1">From Uploads</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Video Section */}
                                {showGalleryVideos && (
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900 mb-4">Gig Video (Max 1)</h3>
                                        {gig.videos && gig.videos.length > 0 ? (
                                            <div className="aspect-video relative rounded-xl overflow-hidden border border-gray-200 bg-black w-full max-w-md">
                                                <video src={gig.videos[0]} controls className="w-full h-full" />
                                                <button 
                                                    onClick={() => setGig({...gig, videos: []})}
                                                    className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow hover:bg-red-700"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div 
                                                onClick={() => { setFilePickerMode('video'); setIsFilePickerOpen(true); }}
                                                className="aspect-video border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition text-gray-400 hover:text-indigo-600 hover:border-indigo-300 w-full max-w-md"
                                            >
                                                <Video className="w-8 h-8 mb-2" />
                                                <span className="text-xs font-medium">Add Video</span>
                                                <span className="text-[10px] mt-1">MP4, MOV (Max 50MB)</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Documents Section (New) */}
                                {showGalleryDocs && (
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900 mb-4">Documents (Max 2)</h3>
                                        <p className="text-xs text-gray-500 mb-4">Upload PDFs for additional context, portfolio samples, or requirements.</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {(gig.documents || []).map((doc, i) => (
                                                <div key={i} className="flex items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                    <FileText className="w-5 h-5 text-red-500 mr-3" />
                                                    <span className="text-sm text-gray-700 flex-1 truncate">Document {i + 1}</span>
                                                    <button 
                                                        onClick={() => setGig({...gig, documents: gig.documents?.filter((_, idx) => idx !== i)})}
                                                        className="text-gray-400 hover:text-red-600 p-1"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            {(gig.documents?.length || 0) < 2 && (
                                                <button 
                                                    onClick={() => { setFilePickerMode('document'); setIsFilePickerOpen(true); }}
                                                    className="flex items-center justify-center p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition"
                                                >
                                                    <Plus className="w-4 h-4 mr-2" /> Add PDF
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {renderCustomFields(currentStepId)}
                            </div>
                        )}

                        {/* STEP 6: PUBLISH */}
                        {currentStepId === 'publish' && (
                            <div className="max-w-lg mx-auto text-center py-12 animate-fade-in">
                                {renderCustomBlocks(currentStepId)}
                                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <CheckCircle className="w-12 h-12 text-green-600" />
                                </div>
                                <h2 className="text-3xl font-bold text-gray-900 mb-2">Ready to Launch!</h2>
                                <p className="text-gray-600 mb-8">
                                    {needsReview
                                        ? 'Your gig is ready. It will be reviewed by our team shortly after submission.'
                                        : 'Your changes are ready. They will update your gig immediately.'}
                                </p>
                                <div className="flex justify-center gap-4">
                                     {needsReview && (
                                         <button
                                             onClick={saveDraftNow}
                                             className="px-6 py-3 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50"
                                         >
                                             {autoSaving ? 'Saving...' : 'Save as Draft'}
                                         </button>
                                     )}
                                     <button onClick={handlePublish} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg flex items-center">
                                         <Save className="w-4 h-4 mr-2" /> {needsReview ? 'Submit Gig' : 'Save Changes'}
                                     </button>
                                </div>
                                {renderCustomFields(currentStepId)}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="bg-gray-50 px-8 py-4 border-t border-gray-200 flex justify-between items-center mt-auto">
                        <button 
                            onClick={handleBack}
                            disabled={currentStep === 1}
                            className="text-gray-600 hover:text-gray-900 font-medium px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center"
                        >
                            <ChevronLeft className="w-4 h-4 mr-2" /> Back
                        </button>
                        {currentStep < steps.length && (
                            <button 
                                onClick={handleNext}
                                className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 transition flex items-center"
                            >
                                Next Step <ChevronRight className="w-4 h-4 ml-2" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* AI Modal */}
            {showAIModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-8">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-900 flex items-center">
                                <Sparkles className="w-6 h-6 mr-2 text-indigo-600" /> AI Gig Generator
                            </h3>
                            <button onClick={() => setShowAIModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <textarea 
                            className="w-full border border-gray-300 rounded-xl p-4 mb-6 h-32 focus:ring-2 focus:ring-indigo-500"
                            placeholder="I want to offer..."
                            value={aiPrompt}
                            onChange={e => setAiPrompt(e.target.value)}
                        />
                        <button 
                            onClick={handleAIGenerate}
                            disabled={isAIGenerating || !aiPrompt}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl shadow-lg transition flex justify-center items-center disabled:opacity-70"
                        >
                            {isAIGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Generate My Gig'}
                        </button>
                    </div>
                </div>
            )}

            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelect={handleFileSelect}
                acceptedTypes={getAcceptedTypes()}
                title={`Select ${filePickerMode === 'image' ? 'Image' : filePickerMode === 'video' ? 'Video' : 'Document'}`}
                filterType={filePickerMode === 'image' ? 'image' : filePickerMode === 'video' ? 'video' : 'document'}
            />
        </div>
    );
};

export default CreateGig;
