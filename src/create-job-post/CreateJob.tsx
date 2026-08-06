

import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import { AdminService } from '../services/admin';
import { categoriesApi } from '../services/categories';
import { jobsApi } from '../services/jobs';
import { Job, ListingCategory, UploadedFile, BudgetAdvice, Plan, PaymentGateway } from '../types';
import { Briefcase, DollarSign, FileText, FileImage, FileVideo, ExternalLink, CheckCircle, Upload, X, Crown, Sparkles, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FilePickerModal from '../dashboard/shared/FilePickerModal';
import { AdvisorService } from '../services/ai/advisor.service';
import ClauseSuggester from '../components/governance/ClauseSuggester';
import { useCurrency } from '../context/CurrencyContext';
import { WalletService } from '../services/wallet';
import { formsApi } from '../services/forms';
import { plansApi } from '../services/plans';
import { JobsService } from '../services/jobs';
import { getUserFacingPaymentMethodName } from '../utils/paymentGatewayDisplay';
import {
    encodeJobAttachment,
    isSameJobAttachment,
    normalizeJobAttachmentPayload,
    parseJobAttachment
} from '../utils/jobAttachments';

const DEFAULT_JOB_STEPS = [
    { id: 'overview', label: 'Job Overview', enabled: true },
    { id: 'budget', label: 'Budget & Timeline', enabled: true },
    { id: 'description', label: 'Description', enabled: true },
    { id: 'attachments', label: 'Attachments', enabled: true },
    { id: 'plan', label: 'Plan', enabled: true },
    { id: 'review', label: 'Review', enabled: true }
];

const DEFAULT_JOB_FORM = {
    layout: {
        titleCreate: 'Create Job Post',
        titleEdit: 'Edit Job Post',
        sectionGap: 24,
        cardPadding: 32
    },
    steps: DEFAULT_JOB_STEPS,
    labels: {
        titleLabel: 'Job Title',
        categoryLabel: 'Category',
        subcategoryLabel: 'Subcategory',
        budgetTitle: 'Budget & Timeline',
        descriptionLabel: 'Job Description',
        attachmentsTitle: 'Attachments',
        planTitle: 'Plan Selection'
    },
    controls: {
        showBudgetAdvice: true,
        showAttachments: true,
        showPlanStep: true
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

const buildJobSteps = (config: any) => {
    const cfgSteps = Array.isArray(config?.steps) ? config.steps : [];
    const baseMap = new Map(DEFAULT_JOB_STEPS.map((s) => [s.id, s]));
    let merged = cfgSteps.length
        ? cfgSteps
            .map((step: any) => {
                const base = baseMap.get(step.id);
                if (!base) return null;
                return { ...base, ...step };
            })
            .filter(Boolean)
        : DEFAULT_JOB_STEPS;

    DEFAULT_JOB_STEPS.forEach((step) => {
        if (!merged.find((s: any) => s.id === step.id)) merged.push(step);
    });

    const controls = config?.controls || {};
    merged = merged.map((step: any) => {
        if (step.id === 'attachments' && controls.showAttachments === false) {
            return { ...step, enabled: false };
        }
        if (step.id === 'plan' && controls.showPlanStep === false) {
            return { ...step, enabled: false };
        }
        return step;
    });

    const enabledSteps = merged.filter((s: any) => s.enabled !== false);
    return enabledSteps.length ? enabledSteps : DEFAULT_JOB_STEPS;
};

type CreateJobProps = {
    jobId?: string;
    mode?: 'create' | 'edit';
    redirectOnSuccess?: string;
};

const normalizeJobTypeLabel = (value?: string) => {
    const v = (value || '').toString().toLowerCase();
    if (v.includes('hour')) return 'Hourly';
    if (v.includes('contract')) return 'Contract';
    return 'Fixed Price';
};

const normalizeExperienceLabel = (value?: string) => {
    const v = (value || '').toString().toLowerCase();
    if (v.includes('entry')) return 'Entry';
    if (v.includes('expert')) return 'Expert';
    if (v.includes('inter')) return 'Intermediate';
    return 'Intermediate';
};

const normalizeVisibilityValue = (value?: string) => {
    const v = (value || '').toString().toLowerCase();
    if (v.includes('invite')) return 'invite';
    return 'public';
};

const normalizeBudgetInput = (value: any) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return `${value}`;
    if (typeof value === 'object') {
        const amount = value.amount ?? value.value ?? value.minAmount ?? value.maxAmount;
        const min = value.minAmount ?? value.min ?? value.minimum;
        const max = value.maxAmount ?? value.max ?? value.maximum;
        if (min !== undefined && max !== undefined) return `${min} - ${max}`;
        if (amount !== undefined) return `${amount}`;
    }
    return '';
};

const CreateJob: React.FC<CreateJobProps> = ({ jobId, mode = 'create', redirectOnSuccess }) => {
    const { user } = useUser();
    const { showNotification } = useNotification();
    const navigate = useNavigate();
    const { formatPrice } = useCurrency();
    
    // Steps Configuration
    const [steps, setSteps] = useState<any[]>(DEFAULT_JOB_STEPS);
    const [currentStep, setCurrentStep] = useState(1);
    const [formConfig, setFormConfig] = useState<any>(DEFAULT_JOB_FORM);
    
    // Data State
    const [categories, setCategories] = useState<ListingCategory[]>([]);
    const [availableSubs, setAvailableSubs] = useState<ListingCategory['subcategories']>([]);
    type JobDraft = Partial<Job> & { categoryId?: string | null };
    const [job, setJob] = useState<JobDraft>({
        title: '',
        category: '',
        subcategory: '',
        type: 'Fixed Price',
        experienceLevel: 'Intermediate',
        visibility: 'public',
        budget: '',
        duration: '',
        description: '',
        tags: [],
        attachments: [],
        isFeatured: false,
        status: 'draft'
    });
    const [draftId, setDraftId] = useState<string | null>(null);
    const [autoSaving, setAutoSaving] = useState(false);
    const autoSaveTimer = useRef<number | null>(null);
    const [jobLoading, setJobLoading] = useState(false);
    const [jobLoadError, setJobLoadError] = useState<string | null>(null);
    const isEditMode = mode === 'edit' || Boolean(jobId);

    useEffect(() => {
        let active = true;
        const loadFormConfig = async () => {
            try {
                const cfg = await formsApi.getConfig();
                if (!active) return;
                const jobCfg = deepMergeReplaceArrays(DEFAULT_JOB_FORM, cfg?.job || {});
                setFormConfig(jobCfg);
                setSteps(buildJobSteps(jobCfg));
            } catch (error) {
                if (active) {
                    setFormConfig(DEFAULT_JOB_FORM);
                    setSteps(buildJobSteps(DEFAULT_JOB_FORM));
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
    const [tagInput, setTagInput] = useState('');
    const [selectedPlanId, setSelectedPlanId] = useState<string>('');
    const [plans, setPlans] = useState<Plan[]>([]);
    const [plansLoading, setPlansLoading] = useState(false);
    const [walletBalance, setWalletBalance] = useState<number | null>(null);
    const [walletLoading, setWalletLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<string>('wallet');
    const [fundingGateways, setFundingGateways] = useState<PaymentGateway[]>([]);
    const [fundingLoading, setFundingLoading] = useState(false);

    const labels = formConfig?.labels || {};
    const controls = formConfig?.controls || {};
    const layout = formConfig?.layout || {};
    const customBlocksMap = formConfig?.customBlocks || {};
    const customFieldsMap = formConfig?.customFields || {};
    const sectionGap = Number(layout.sectionGap ?? 24);
    const cardPadding = Number(layout.cardPadding ?? 32);
    const stackStyle: React.CSSProperties = { gap: `${sectionGap}px` };
    const pageTitle = job?.id ? (layout.titleEdit || 'Edit Job Post') : (layout.titleCreate || 'Create Job Post');
    const showBudgetAdvice = controls.showBudgetAdvice !== false;
    const showAttachments = controls.showAttachments !== false;
    const showPlanStep = controls.showPlanStep !== false;
    const currentStepId = steps[currentStep - 1]?.id || 'overview';

    const getCustomFieldValue = (key: string) => {
        const meta = (job.meta as any) || {};
        const fields = meta.customFields || meta.formFields || {};
        return fields?.[key] ?? '';
    };

    const setCustomFieldValue = (key: string, value: any) => {
        setJob((prev) => {
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

    const resolveCategoryId = (value?: string) => {
        const raw = (value || '').toString();
        if (!raw) return null;
        const byId = categories.find((c) => c.id === raw);
        if (byId) return byId.id;
        const byName = categories.find((c) => c.name === raw);
        return byName?.id || null;
    };

    
    // AI Budget State
    const [budgetAdvice, setBudgetAdvice] = useState<BudgetAdvice | null>(null);
    const [isOptimizingBudget, setIsOptimizingBudget] = useState(false);

    useEffect(() => {
        const loadCategories = async () => {
            try {
                const data = await categoriesApi.getJobCategories();
                setCategories(data.categories || []);
            } catch (error) {
                try {
                    const adminCats = await AdminService.getJobCategories();
                    setCategories(adminCats || []);
                } catch (err) {
                    console.warn('Failed to load job categories:', err);
                    setCategories([]);
                }
            }
        };
        loadCategories();
    }, []);

    useEffect(() => {
        if (!categories.length) return;
        const current = String(job.category || '');
        const resolved =
            categories.find((c) => c.id === current) ||
            categories.find((c) => c.id === job.categoryId) ||
            categories.find((c) => c.name === current);
        if (!resolved) return;
        if (resolved.name !== current || !job.categoryId) {
            setJob((prev) => ({ ...prev, category: resolved.name, categoryId: resolved.id }));
        }
    }, [categories, job.category, job.categoryId]);

    // Keep subcategory options in sync with selected category (parity with Create Gig).
    useEffect(() => {
        const cat =
            categories.find((c) => c.name === job.category) ||
            categories.find((c) => c.id === job.categoryId) ||
            categories.find((c) => c.id === String(job.category || ''));
        const subs = Array.isArray(cat?.subcategories) ? cat!.subcategories : [];
        setAvailableSubs(subs);
        if (!job.subcategory) return;
        const stillValid = subs.some(
            (s) => s.name === job.subcategory || s.id === job.subcategory || s.slug === job.subcategory
        );
        if (!stillValid) {
            setJob((prev) => ({ ...prev, subcategory: '' }));
        }
    }, [categories, job.category, job.categoryId, job.subcategory]);

    useEffect(() => {
        const stored = sessionStorage.getItem('ai_job_brief');
        if (isEditMode) return;
        if (!stored) return;
        try {
            const brief = JSON.parse(stored);
            setJob((prev) => ({
                ...prev,
                title: brief.title || prev.title || '',
                description: brief.description || prev.description || '',
                tags: Array.isArray(brief.tags) && brief.tags.length > 0 ? brief.tags : prev.tags || [],
                budget: brief.budget || prev.budget || '',
                duration: brief.timeline || prev.duration || ''
            }));
        } catch (error) {
            console.error('Failed to load AI brief:', error);
        } finally {
            sessionStorage.removeItem('ai_job_brief');
        }
    }, []);

    useEffect(() => {
        const loadPlans = async () => {
            setPlansLoading(true);
            try {
                const data = await plansApi.listPlans({ type: 'employer' });
                const employerPlans = (data || []).filter((plan) => {
                    const isActive = plan.isActive ?? (plan as any).is_active ?? false;
                    return plan.type === 'employer' && isActive;
                });
                setPlans(employerPlans);
                if (!selectedPlanId && employerPlans.length > 0) {
                    const popular = employerPlans.find((plan) => plan.isPopular) || employerPlans[0];
                    setSelectedPlanId(popular.id);
                }
            } catch (error) {
                console.error('Failed to load plans:', error);
                setPlans([]);
            } finally {
                setPlansLoading(false);
            }
        };

        loadPlans();
    }, []);

    useEffect(() => {
        if (!jobId) return;
        let mounted = true;
        const loadJob = async () => {
            setJobLoading(true);
            setJobLoadError(null);
            try {
                const data = await JobsService.getById(jobId);
                if (!mounted || !data) return;
                const nextJob: JobDraft = {
                    ...data,
                    id: data.id,
                    title: data.title || '',
                    description: data.description || '',
                    category: data.category || '',
                    categoryId: (data as any).categoryId || null,
                    subcategory: data.subcategory || '',
                    type: normalizeJobTypeLabel(String((data as any).type || '')),
                    experienceLevel: normalizeExperienceLabel((data as any).experienceLevel || (data as any).experience_level),
                    visibility: normalizeVisibilityValue((data as any).visibility || ''),
                    budget: normalizeBudgetInput((data as any).budget),
                    duration: data.duration || '',
                    tags: Array.isArray(data.tags) ? data.tags : [],
                    attachments: Array.isArray((data as any).attachments) ? (data as any).attachments : []
                };
                setJob(nextJob);
                setDraftId(data.id);
            } catch (err: any) {
                if (!mounted) return;
                setJobLoadError(err?.message || 'Failed to load job.');
            } finally {
                if (mounted) setJobLoading(false);
            }
        };
        loadJob();
        return () => {
            mounted = false;
        };
    }, [jobId]);

    const refreshWallet = async () => {
        setWalletLoading(true);
        try {
            const wallet = await WalletService.getWallet();
            setWalletBalance(Number(wallet.available_balance ?? 0));
        } catch (error) {
            console.error('Failed to load wallet:', error);
            setWalletBalance(null);
        } finally {
            setWalletLoading(false);
        }
    };

    useEffect(() => {
        if (!user) return;
        refreshWallet();
    }, [user]);

    useEffect(() => {
        if (!user) return;
        const loadGateways = async () => {
            setFundingLoading(true);
            try {
                const gateways = await WalletService.getFundingGateways();
                const compatible = gateways.filter((gw: any) => {
                    const currencies = Array.isArray(gw.supported_currencies || gw.supportedCurrencies) ? (gw.supported_currencies || gw.supportedCurrencies) : [];
                    if (currencies.length === 0) return true;
                    const planCurrency = (plans.find((p) => p.id === selectedPlanId)?.currency || 'USD').toUpperCase();
                    return currencies.map((c: string) => c.toUpperCase()).includes(planCurrency);
                });
                setFundingGateways(compatible);
                if (paymentMethod !== 'wallet' && compatible.length > 0 && !compatible.find((gw: any) => gw.id === paymentMethod)) {
                    setPaymentMethod('wallet');
                }
            } catch (error) {
                setFundingGateways([]);
            } finally {
                setFundingLoading(false);
            }
        };
        loadGateways();
    }, [user, selectedPlanId, plans, paymentMethod]);

    // --- Handlers ---

    const handleOptimizeBudget = async () => {
        if (!job.title || !job.category) {
            showNotification('alert', 'Missing Info', 'Please add a title and category first.');
            return;
        }
        setIsOptimizingBudget(true);
        try {
            const advice = await AdvisorService.optimizeBudget(job.title, job.description || 'General');
            setBudgetAdvice(advice);
              if (advice && (advice as any).recommendedRange) {
                  if(!job.budget) setJob(prev => ({ ...prev, budget: (advice as any).recommendedRange }));
              }
        } catch (e) {
            console.error(e);
        } finally {
            setIsOptimizingBudget(false);
        }
    };

    const handleAddClause = (text: string) => {
        const currentDesc = job.description || '';
        const newDesc = currentDesc + (currentDesc ? '\n\n' : '') + `**Legal Clause:** ${text}`;
        setJob({ ...job, description: newDesc });
        showNotification('success', 'Clause Added', 'The clause has been appended to your description.');
    };

    const handleNext = () => {
        // Validation per step
        if (currentStepId === 'overview') {
            if (!job.title || !job.category) {
                showNotification('alert', 'Required Fields', 'Please fill in Job Title and Category.');
                return;
            }
            if (availableSubs.length > 0 && !(job.subcategory && String(job.subcategory).trim())) {
                showNotification('alert', 'Required Fields', 'Please select a Job Subcategory.');
                return;
            }
        }
        if (currentStepId === 'budget') {
            if (!job.budget || !job.duration) {
                showNotification('alert', 'Required Fields', 'Please specify Budget and Duration.');
                return;
            }
        }
        if (currentStepId === 'description') {
            const trimmedTag = tagInput.trim();
            const existingTags = job.tags || [];
            const nextTags = trimmedTag && !existingTags.includes(trimmedTag)
                ? [...existingTags, trimmedTag].slice(0, 10)
                : existingTags;

            if (trimmedTag && !existingTags.includes(trimmedTag)) {
                setJob((prev) => ({ ...prev, tags: nextTags }));
                setTagInput('');
            }

            if (!job.description || nextTags.length < 1) {
                showNotification('alert', 'Required Fields', 'Description and at least 1 skill tag are required.');
                return;
            }
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

    const handlePublish = async () => {
        const selectedPlan = showPlanStep ? plans.find((plan) => plan.id === selectedPlanId) : null;
        if (!isEditMode && selectedPlan && selectedPlan.price > 0) {
            const hasWalletFunds = walletBalance !== null && walletBalance >= selectedPlan.price;
            if (paymentMethod === 'wallet' || hasWalletFunds) {
                if (walletBalance === null) {
                    showNotification('alert', 'Payment Required', 'Unable to confirm wallet balance. Please reload and try again.');
                    return;
                }
                if (walletBalance < selectedPlan.price) {
                    showNotification('alert', 'Payment Required', 'Please fund your wallet to pay the plan fee before submitting.');
                    return;
                }
            } else {
                try {
                    const result = await WalletService.initiateTopup({
                        amount: Number(selectedPlan.price || 0),
                        currency: selectedPlan.currency || 'USD',
                        provider: paymentMethod || 'auto'
                    });
                    const redirectUrl = result.redirect_url || result.redirectUrl;
                    if (redirectUrl) {
                        window.open(redirectUrl, '_blank');
                        showNotification('info', 'Payment Started', 'Complete the payment in the new tab, then refresh your wallet balance and submit again.');
                    } else {
                        showNotification('info', 'Payment Started', 'Complete the payment, then refresh your wallet balance and submit again.');
                    }
                } catch (error: any) {
                    showNotification('alert', 'Payment Failed', error?.message || 'Unable to initiate payment.');
                }
                return;
            }
        }
        try {
            const persistJob = async () => {
                const budgetNumbers = String(job.budget || '').match(/[\d.]+/g)?.map(Number) || [];
                const budgetPayload = job.budget
                    ? {
                        type: job.type === 'Hourly' ? 'hourly' : 'fixed',
                        amount: budgetNumbers[0] || 0,
                        minAmount: budgetNumbers[0],
                        maxAmount: budgetNumbers[1]
                      }
                    : undefined;
                const payload: any = {
                    ...job,
                    budget: budgetPayload,
                    attachments: normalizeJobAttachmentPayload(job.attachments || []),
                    categoryId: resolveCategoryId(String(job.category || '')) ?? job.categoryId ?? null,
                    plan_id: selectedPlan?.id,
                    plan_name: selectedPlan?.name,
                    plan_price: selectedPlan?.price,
                    plan_interval: selectedPlan?.interval,
                    isFeatured: Boolean(
                      (selectedPlan?.features || []).some((feature: any) => {
                        if (!feature?.included) return false;
                        const code = String(feature?.code || '').trim().toLowerCase();
                        const name = String(feature?.name || '').trim().toLowerCase();
                        return (
                          code === 'featured_jobs' ||
                          code === 'featured_job_cards' ||
                          name.includes('featured job')
                        );
                      })
                    )
                };
                if (!isEditMode) {
                    payload.status = 'draft';
                    payload.adminStatus = job.adminStatus || 'pending';
                    payload.isVisible = false;
                    payload.isActive = false;
                }
                if (job.id || draftId) {
                    const existingId = job.id || draftId!;
                    await jobsApi.updateJob(existingId, payload);
                    return existingId;
                }
                const created = await jobsApi.createJob(payload);
                if (created?.id) {
                    setDraftId(created.id);
                    setJob((prev) => ({ ...prev, id: created.id }));
                    return created.id;
                }
                return Math.random().toString(36).substr(2, 9);
            };

            const id = await persistJob();
            const currentStatus = (job.status || '').toString().toLowerCase();
            const shouldSubmit = !isEditMode || ['draft', 'rejected', 'submitted', 'under_review'].includes(currentStatus);
            if (shouldSubmit) {
                await jobsApi.submitJob(id, selectedPlan?.id ? { planId: selectedPlan.id } : undefined);
                if (selectedPlan?.price && selectedPlan.price > 0) {
                    await refreshWallet();
                }
            }

            showNotification('success', 'Job Posted!', 'Your job is under review and will be live shortly.');
            navigate(redirectOnSuccess || '/client/dashboard');
        } catch (error) {
            const message =
                (error as any)?.response?.data?.error ||
                (error as any)?.message ||
                'Failed to post job.';
            showNotification('alert', 'Error', message);
        }
    };

    const hasDraftContent = () => {
        return Boolean(
            (job.title && job.title.trim()) ||
            (job.category && job.category.trim()) ||
            (job.description && job.description.trim()) ||
            (job.budget && job.budget.toString().trim()) ||
            (job.duration && job.duration.toString().trim()) ||
            (job.tags && job.tags.length) ||
            (job.attachments && job.attachments.length)
        );
    };

    const saveDraft = async (isAuto = false) => {
        if (!user || !hasDraftContent()) return;
        try {
            setAutoSaving(true);
            const budgetNumbers = String(job.budget || '').match(/[\d.]+/g)?.map(Number) || [];
            const budgetPayload = job.budget
                ? {
                    type: job.type === 'Hourly' ? 'hourly' : 'fixed',
                    amount: budgetNumbers[0] || 0,
                    minAmount: budgetNumbers[0],
                    maxAmount: budgetNumbers[1]
                  }
                : undefined;
            const payload: any = {
                ...job,
                budget: budgetPayload,
                attachments: normalizeJobAttachmentPayload(job.attachments || []),
                categoryId: resolveCategoryId(String(job.category || '')) ?? job.categoryId ?? null,
                ...(isEditMode
                    ? {}
                    : {
                        status: 'draft',
                        adminStatus: job.adminStatus || 'pending',
                        isVisible: false,
                        isActive: false
                      })
            };
            if (job.id || draftId) {
                const existingId = job.id || draftId!;
                await jobsApi.updateJob(existingId, payload);
            } else {
                const created = await jobsApi.createJob(payload);
                if (created?.id) {
                    setDraftId(created.id);
                    setJob((prev) => ({ ...prev, id: created.id }));
                }
            }
            if (!isAuto) {
                showNotification('success', 'Draft Saved', 'Your job draft has been saved.');
            }
        } catch (error) {
            if (!isAuto) {
                showNotification('alert', 'Error', 'Failed to save draft.');
            }
            console.warn('Auto-save job failed:', error);
        } finally {
            setAutoSaving(false);
        }
    };

    useEffect(() => {
        if (!user) return;
        if (!hasDraftContent()) return;
        if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = window.setTimeout(() => {
            saveDraft(true);
        }, 1200);
        return () => {
            if (autoSaveTimer.current) window.clearTimeout(autoSaveTimer.current);
        };
    }, [job, user?.id]);

    const pushTag = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        if (job.tags && job.tags.length >= 10) return;
        if ((job.tags || []).includes(trimmed)) return;
        setJob({ ...job, tags: [...(job.tags || []), trimmed] });
        setTagInput('');
    };

    const addTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            pushTag(tagInput);
        }
    };

    const removeTag = (tag: string) => {
        setJob({ ...job, tags: job.tags?.filter(t => t !== tag) });
    };

    const handleFileSelect = (file: UploadedFile) => {
        const encoded = encodeJobAttachment(file);
        setJob(prev => ({
            ...prev,
            attachments: (prev.attachments || []).some((existing) => isSameJobAttachment(existing, encoded))
                ? prev.attachments || []
                : [...(prev.attachments || []), encoded]
        }));
        setIsFilePickerOpen(false);
    };

    if (isEditMode && jobLoading && !job?.id) {
        return <div className="p-8 text-gray-500">Loading job...</div>;
    }

    if (isEditMode && jobLoadError) {
        return (
            <div className="p-6 bg-red-50 border border-red-100 rounded-xl text-red-700">
                {jobLoadError}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 pt-20 pb-12 px-4">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">{pageTitle}</h1>
                    <div className="flex items-center justify-between relative">
                        <div className="absolute left-0 top-1/2 w-full h-1 bg-gray-200 -z-10 rounded"></div>
                        {steps.map((step, idx) => (
                            <div key={step.id || idx} className={`flex flex-col items-center bg-gray-50 px-2 ${currentStep > idx + 1 ? 'text-green-600' : currentStep === idx + 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-2 transition-colors ${
                                    currentStep > idx + 1 ? 'bg-green-100' : currentStep === idx + 1 ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200'
                                }`}>
                                    {currentStep > idx + 1 ? <CheckCircle className="w-5 h-5" /> : idx + 1}
                                </div>
                                <span className="text-xs font-medium hidden sm:block">{step.label || `Step ${idx + 1}`}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div style={{ padding: cardPadding }}>
                        {currentStepId === 'overview' && (
                            <div className="flex flex-col animate-fade-in" style={stackStyle}>
                                {renderCustomBlocks(currentStepId)}
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-1">{labels.titleLabel || 'Job Title'}</label>
                                    <div className="relative">
                                        <input 
                                            className="w-full border-gray-300 rounded-xl p-3 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                                            placeholder="e.g. Senior React Developer for Fintech App"
                                            value={job.title}
                                            onChange={e => setJob({...job, title: e.target.value})}
                                        />
                                        <div className="absolute right-3 top-3 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded flex items-center">
                                            <Sparkles className="w-3 h-3 mr-1" /> AI Optimized
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">We've optimized your title for better visibility.</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-1">{labels.categoryLabel || 'Category'}</label>
                                        <select 
                                            className="w-full border-gray-300 rounded-xl p-3 shadow-sm bg-white"
                                            value={job.category}
                                            onChange={e => setJob({ ...job, category: e.target.value, subcategory: '' })}
                                        >
                                            <option value="">Select Category</option>
                                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-1">{labels.subcategoryLabel || 'Subcategory'}</label>
                                        <select
                                            className="w-full border-gray-300 rounded-xl p-3 shadow-sm bg-white disabled:bg-gray-50 disabled:text-gray-400"
                                            value={job.subcategory || ''}
                                            onChange={e => setJob({ ...job, subcategory: e.target.value })}
                                            disabled={!availableSubs.length}
                                        >
                                            <option value="">{availableSubs.length ? 'Select Subcategory' : 'Select a category first'}</option>
                                            {availableSubs.map((s) => (
                                                <option key={s.id || s.slug || s.name} value={s.name}>{s.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-1">Job Type</label>
                                        <div className="flex bg-gray-100 p-1 rounded-xl">
                                            {['Fixed Price', 'Hourly', 'Contract'].map(type => (
                                                <button
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setJob({...job, type: type as string})}
                                                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${job.type === type ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-1">Experience Level</label>
                                        <select 
                                            className="w-full border-gray-300 rounded-xl p-3 shadow-sm bg-white"
                                            value={job.experienceLevel}
                                            onChange={e => setJob({...job, experienceLevel: e.target.value as string})}
                                        >
                                            <option>Entry</option>
                                            <option>Intermediate</option>
                                            <option>Expert</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-1">Visibility</label>
                                        <select 
                                            className="w-full border-gray-300 rounded-xl p-3 shadow-sm bg-white"
                                            value={job.visibility}
                                            onChange={e => setJob({...job, visibility: e.target.value as string})}
                                        >
                                            <option value="public">Public (Anyone can apply)</option>
                                            <option value="invite">Invite Only (Private)</option>
                                        </select>
                                    </div>
                                </div>
                                {renderCustomFields(currentStepId)}
                            </div>
                        )}

                        {currentStepId === 'budget' && (
                            <div className="flex flex-col animate-fade-in" style={stackStyle}>
                                {renderCustomBlocks(currentStepId)}
                                <h3 className="text-lg font-bold text-gray-900">{labels.budgetTitle || 'Budget & Timeline'}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                                        <div className="flex justify-between items-center mb-4">
                                            <div className="flex items-center text-blue-900">
                                                <DollarSign className="w-5 h-5 mr-2" />
                                                <h3 className="font-bold">Budget</h3>
                                            </div>
                                            {showBudgetAdvice && (
                                                <button 
                                                    onClick={handleOptimizeBudget}
                                                    disabled={isOptimizingBudget}
                                                    className="text-xs bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-full flex items-center hover:bg-blue-50 transition"
                                                >
                                                    {isOptimizingBudget ? <Loader2 className="w-3 h-3 animate-spin mr-1"/> : <Sparkles className="w-3 h-3 mr-1"/>}
                                                    Optimize
                                                </button>
                                            )}
                                        </div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Range</label>
                                        <input 
                                            className="w-full border-gray-300 rounded-lg p-3"
                                            placeholder={job.type === 'Hourly' ? "$20 - $50 /hr" : "$500 - $1000"}
                                            value={job.budget}
                                            onChange={e => setJob({...job, budget: e.target.value})}
                                        />
                                        
                                        {showBudgetAdvice && budgetAdvice && (
                                            <div className="mt-4 bg-indigo-50 border border-indigo-100 p-3 rounded-lg text-sm animate-fade-in">
                                                <div className="flex items-center text-indigo-700 font-bold mb-1">
                                                    <Sparkles className="w-4 h-4 mr-1 text-yellow-500" />
                                                    AI Suggestion: {budgetAdvice.recommendedRange}
                                                </div>
                                                <p className="text-indigo-600 text-xs mb-2">Success Probability: {budgetAdvice.successProbability}%</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                                        <div className="flex items-center mb-4 text-purple-900">
                                            <Briefcase className="w-5 h-5 mr-2" />
                                            <h3 className="font-bold">Timeline</h3>
                                        </div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Estimated Duration</label>
                                        <select 
                                            className="w-full border-gray-300 rounded-lg p-3 bg-white"
                                            value={job.duration}
                                            onChange={e => setJob({...job, duration: e.target.value})}
                                        >
                                            <option value="">Select Duration</option>
                                            <option>Less than 1 month</option>
                                            <option>1 to 3 months</option>
                                            <option>3 to 6 months</option>
                                            <option>More than 6 months</option>
                                        </select>
                                    </div>
                                </div>
                                {renderCustomFields(currentStepId)}
                            </div>
                        )}

                        {currentStepId === 'description' && (
                            <div className="flex flex-col animate-fade-in" style={stackStyle}>
                                {renderCustomBlocks(currentStepId)}
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-1">{labels.descriptionLabel || 'Job Description'}</label>
                                    <textarea 
                                        className="w-full h-64 border-gray-300 rounded-xl p-4 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                        placeholder="Clearly describe the scope, deliverables, and expectations..."
                                        value={job.description}
                                        onChange={e => setJob({...job, description: e.target.value})}
                                    />
                                </div>
                                
                                {/* AI Clause Suggester */}
                                <ClauseSuggester 
                                    jobDescription={job.description || ''} 
                                    jobType={job.type || 'Fixed Price'} 
                                    onAddClause={handleAddClause}
                                />

                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-1">Required Skills</label>
                                    <div className="relative">
                                        <input 
                                            className="w-full border-gray-300 rounded-xl p-3 shadow-sm pr-20"
                                            placeholder="Type skill and press Enter..."
                                            value={tagInput}
                                            onChange={e => setTagInput(e.target.value)}
                                            onKeyDown={addTag}
                                            onBlur={() => pushTag(tagInput)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => pushTag(tagInput)}
                                            className="absolute right-2 top-2 text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md hover:bg-blue-100"
                                        >
                                            Add
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">Max 10 • press Enter or click Add</p>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {job.tags?.map((tag, i) => (
                                            <span key={i} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm font-medium flex items-center">
                                                {tag}
                                                <button onClick={() => removeTag(tag)} className="ml-2 text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                {renderCustomFields(currentStepId)}
                            </div>
                        )}

                        {['attachments', 'plan', 'review'].includes(currentStepId) && (
                             <div className="flex flex-col animate-fade-in py-8" style={stackStyle}>
                                {currentStepId === 'attachments' && (
                                    <div className="space-y-6">
                                        {renderCustomBlocks(currentStepId)}
                                        {!showAttachments && (
                                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                                                {labels.attachmentsTitle || 'Attachments'} are disabled by the admin.
                                            </div>
                                        )}
                                        {showAttachments && (
                                            <>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900">{labels.attachmentsTitle || 'Attachments'}</h3>
                                                <p className="text-sm text-gray-500">Attach specs, briefs, or reference files.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setIsFilePickerOpen(true)}
                                                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 shadow-sm flex items-center"
                                            >
                                                <Upload className="w-4 h-4 mr-2" /> Add Files
                                            </button>
                                        </div>

                                        {Array.isArray(job.attachments) && job.attachments.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {job.attachments.map((value, idx) => {
                                                    const attachment = parseJobAttachment(value);
                                                    const url = attachment.url;
                                                    const label = attachment.name;
                                                    return (
                                                        <div key={`${attachment.raw}-${idx}`} className="bg-white border border-gray-200 rounded-xl p-4">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="flex items-start gap-3 min-w-0">
                                                                    {attachment.kind === 'image' && url ? (
                                                                        <img
                                                                            src={url}
                                                                            alt={label}
                                                                            className="w-16 h-16 rounded-lg object-cover border"
                                                                        />
                                                                    ) : attachment.kind === 'video' && url ? (
                                                                        <video
                                                                            src={url}
                                                                            poster={attachment.thumbnailUrl}
                                                                            className="w-20 h-16 rounded-lg object-cover border bg-gray-900"
                                                                            muted
                                                                            playsInline
                                                                            autoPlay
                                                                            loop
                                                                            controls
                                                                            preload="metadata"
                                                                        />
                                                                    ) : attachment.kind === 'pdf' && url ? (
                                                                        <div className="w-16 h-16 rounded-lg border bg-red-50 flex items-center justify-center">
                                                                            <FileText className="w-5 h-5 text-red-500" />
                                                                        </div>
                                                                    ) : (
                                                                        <div className="w-16 h-16 rounded-lg border bg-gray-50 flex items-center justify-center">
                                                                            {attachment.kind === 'image' ? (
                                                                                <FileImage className="w-5 h-5 text-gray-400" />
                                                                            ) : attachment.kind === 'video' ? (
                                                                                <FileVideo className="w-5 h-5 text-gray-400" />
                                                                            ) : (
                                                                                <FileText className="w-5 h-5 text-gray-400" />
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                    <div className="text-sm text-gray-700 min-w-0">
                                                                        <div className="font-semibold truncate max-w-[220px]" title={label}>
                                                                            {label}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500 capitalize">
                                                                            {attachment.kind === 'pdf' ? 'PDF' : attachment.kind}
                                                                        </div>
                                                                        {url ? (
                                                                            <a
                                                                                href={url}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                                                            >
                                                                                <ExternalLink className="w-3 h-3" /> Open file
                                                                            </a>
                                                                        ) : (
                                                                            <div className="text-xs text-gray-400">
                                                                                Preview unavailable
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setJob((prev) => ({
                                                                            ...prev,
                                                                            attachments: (prev.attachments || []).filter((a) => a !== value)
                                                                        }))
                                                                    }
                                                                    className="text-red-500 hover:text-red-700 text-sm"
                                                                >
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-center text-gray-400 border border-dashed border-gray-300 rounded-xl p-8">
                                                <Upload className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                                                <p>No attachments yet. Add files from Uploaded Files.</p>
                                            </div>
                                        )}
                                            </>
                                        )}
                                    </div>
                                )}
                                {currentStepId === 'plan' && (
                                    <div className="space-y-6">
                                        {renderCustomBlocks(currentStepId)}
                                        {!showPlanStep && (
                                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                                                {labels.planTitle || 'Plan Selection'} is disabled by the admin.
                                            </div>
                                        )}
                                        {showPlanStep && (
                                            <>
                                                <div className="text-center">
                                                    <Crown className="w-12 h-12 mx-auto text-yellow-500 mb-3" />
                                                    <h3 className="text-lg font-bold text-gray-900">{labels.planTitle || 'Choose a Plan'}</h3>
                                                    <p className="text-sm text-gray-500">Select a plan from admin-configured options.</p>
                                                </div>
                                        {(() => {
                                            const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
                                            if (!selectedPlan || selectedPlan.price <= 0) return null;
                                            return (
                                            <div className="space-y-3">
                                                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                                    <div>
                                                        Wallet balance:{' '}
                                                        <span className="font-semibold text-gray-900">
                                                            {walletLoading ? 'Loading...' : formatPrice(walletBalance || 0)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={refreshWallet}
                                                            className="text-xs font-semibold text-blue-600 hover:underline"
                                                        >
                                                            Refresh wallet
                                                        </button>
                                                        <a
                                                            href="/client/dashboard?tab=wallet"
                                                            className="text-blue-600 font-semibold text-xs hover:underline"
                                                        >
                                                            Fund Wallet
                                                        </a>
                                                    </div>
                                                </div>
                                                <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="text-sm font-semibold text-gray-900">Payment method</p>
                                                            <p className="text-xs text-gray-500">Select how you want to pay for this plan.</p>
                                                        </div>
                                                        <span className="text-xs font-semibold text-gray-700">
                                                            {formatPrice(selectedPlan.price)} / {selectedPlan.interval}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPaymentMethod('wallet')}
                                                            className={`border rounded-xl p-3 text-left transition ${
                                                                paymentMethod === 'wallet'
                                                                    ? 'border-blue-600 ring-2 ring-blue-100 bg-blue-50'
                                                                    : 'border-gray-200 hover:border-gray-300'
                                                            }`}
                                                        >
                                                            <div className="text-sm font-semibold text-gray-900">Wallet balance</div>
                                                            <div className="text-xs text-gray-500">Use available wallet funds.</div>
                                                        </button>
                                                        {fundingLoading ? (
                                                            <div className="border border-gray-200 rounded-xl p-3 text-xs text-gray-500 flex items-center justify-center">
                                                                Loading payment methods...
                                                            </div>
                                                        ) : fundingGateways.length === 0 ? (
                                                            <div className="border border-gray-200 rounded-xl p-3 text-xs text-gray-500 flex items-center justify-center">
                                                                No active payment gateways.
                                                            </div>
                                                        ) : (
                                                            fundingGateways.map((gateway) => {
                                                                const gatewayDisplayName = getUserFacingPaymentMethodName(gateway);
                                                                return (
                                                                    <button
                                                                        key={gateway.id}
                                                                        type="button"
                                                                        onClick={() => setPaymentMethod(gateway.id)}
                                                                        className={`border rounded-xl p-3 text-left transition ${
                                                                            paymentMethod === gateway.id
                                                                                ? 'border-blue-600 ring-2 ring-blue-100 bg-blue-50'
                                                                                : 'border-gray-200 hover:border-gray-300'
                                                                        }`}
                                                                    >
                                                                        <div className="text-sm font-semibold text-gray-900">
                                                                            {gatewayDisplayName}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500">
                                                                            Pay via {gatewayDisplayName}.
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-gray-500">
                                                        Gateway payments fund your wallet first. After payment, refresh your wallet balance and submit again.
                                                    </p>
                                                </div>
                                            </div>
                                            );
                                        })()}
                                        {plansLoading ? (
                                            <div className="text-center text-gray-400 py-10">
                                                <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
                                                Loading plans...
                                            </div>
                                        ) : plans.length > 0 ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {plans.map((plan) => (
                                                    <button
                                                        key={plan.id}
                                                        type="button"
                                                        onClick={() => setSelectedPlanId(plan.id)}
                                                        className={`border rounded-xl p-5 text-left transition ${
                                                            selectedPlanId === plan.id
                                                                ? 'border-blue-600 ring-2 ring-blue-100 bg-blue-50'
                                                                : 'border-gray-200 hover:border-gray-300'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <h4 className="text-base font-bold text-gray-900">{plan.name}</h4>
                                                                {plan.isPopular && (
                                                                    <span className="text-[10px] uppercase font-bold text-yellow-600">Popular</span>
                                                                )}
                                                            </div>
                                                            <span className="text-sm font-semibold text-gray-700">
                                                                {formatPrice(plan.price)} / {plan.interval}
                                                            </span>
                                                        </div>
                                                        {Array.isArray(plan.features) && plan.features.length > 0 && (
                                                            <ul className="text-xs text-gray-600 mt-3 space-y-1">
                                                                {plan.features.slice(0, 4).map((feature) => (
                                                                    <li key={feature.id}>
                                                                        {feature.included ? '•' : '×'} {feature.name}
                                                                        {feature.limit ? ` (${feature.limit})` : ''}
                                                                    </li>
                                                                ))}
                                                                {plan.features.length > 4 && (
                                                                    <li className="text-gray-400">+{plan.features.length - 4} more</li>
                                                                )}
                                                            </ul>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center text-gray-400 border border-dashed border-gray-300 rounded-xl p-8">
                                                <Crown className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                                                <p>No employer plans are active yet.</p>
                                                <p className="text-xs mt-1">Ask admin to enable plans in Gigs & Jobs.</p>
                                            </div>
                                        )}
                                            </>
                                        )}
                                        {renderCustomFields(currentStepId)}
                                    </div>
                                )}
                                {currentStepId === 'review' && (
                                    <div className="text-center space-y-4">
                                        {renderCustomBlocks(currentStepId)}
                                        <div>
                                            <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4"/>
                                            <p>Review Module Placeholder</p>
                                        </div>
                                        {renderCustomFields(currentStepId)}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer Controls */}
                    <div className="bg-gray-50 px-8 py-4 border-t border-gray-200 flex justify-between items-center">
                        <button 
                            onClick={handleBack}
                            disabled={currentStep === 1}
                            className="text-gray-600 hover:text-gray-900 font-medium px-4 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center"
                        >
                            <ChevronLeft className="w-4 h-4 mr-2" /> Back
                        </button>
                        <div className="flex gap-3">
                            <button
                                onClick={() => saveDraft(false)}
                                className="text-gray-500 hover:text-gray-700 font-medium px-4 py-2 text-sm"
                            >
                                {autoSaving ? 'Saving…' : 'Save Draft'}
                            </button>
                            <button 
                                onClick={handleNext}
                                className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition flex items-center"
                            >
            {currentStep === steps.length ? (isEditMode ? 'Save Changes' : 'Submit Job') : 'Next Step'}
                                {currentStep !== steps.length && <ChevronRight className="w-4 h-4 ml-2" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelect={handleFileSelect}
                acceptedTypes="image/*,video/*,.pdf,.doc,.docx"
                filterType="all"
                role="employer"
            />
        </div>
    );
};

export default CreateJob;
