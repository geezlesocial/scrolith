

import React, { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import { AdminService } from '../services/admin';
import { Job, ListingCategory, UploadedFile, BudgetAdvice, Plan } from '../types';
import { Briefcase, DollarSign, FileText, CheckCircle, Upload, X, Crown, Sparkles, ChevronRight, ChevronLeft, Loader2, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FilePickerModal from '../dashboard/shared/FilePickerModal';
import { AdvisorService } from '../services/ai/advisor.service';
import ClauseSuggester from '../components/governance/ClauseSuggester';
import { useCurrency } from '../context/CurrencyContext';
import { WalletService } from '../services/wallet';

const CreateJob = () => {
    const { user } = useUser();
    const { showNotification } = useNotification();
    const navigate = useNavigate();
    const { formatPrice } = useCurrency();
    
    // Steps Configuration
    const steps = ['Job Overview', 'Budget & Timeline', 'Description', 'Attachments', 'Plan', 'Review'];
    const [currentStep, setCurrentStep] = useState(1);
    
    // Data State
    const [categories, setCategories] = useState<ListingCategory[]>([]);
    const [job, setJob] = useState<Partial<Job>>({
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

    // UI State
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [tagInput, setTagInput] = useState('');
    const [selectedPlanId, setSelectedPlanId] = useState<string>('');
    const [plans, setPlans] = useState<Plan[]>([]);
    const [plansLoading, setPlansLoading] = useState(false);
    const [walletBalance, setWalletBalance] = useState<number | null>(null);
    const [walletLoading, setWalletLoading] = useState(false);
    
    // AI Budget State
    const [budgetAdvice, setBudgetAdvice] = useState<BudgetAdvice | null>(null);
    const [isOptimizingBudget, setIsOptimizingBudget] = useState(false);

    useEffect(() => {
        AdminService.getJobCategories().then(setCategories);
    }, []);

    useEffect(() => {
        const stored = sessionStorage.getItem('ai_job_brief');
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
                const data = await AdminService.getPlans();
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
        if (!user) return;
        const loadWallet = async () => {
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
        loadWallet();
    }, [user]);

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
        if (currentStep === 1) {
            if (!job.title || !job.category) {
                showNotification('alert', 'Required Fields', 'Please fill in Job Title and Category.');
                return;
            }
        }
        if (currentStep === 2) {
            if (!job.budget || !job.duration) {
                showNotification('alert', 'Required Fields', 'Please specify Budget and Duration.');
                return;
            }
        }
        if (currentStep === 3) {
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

        if (currentStep < steps.length) setCurrentStep(c => c + 1);
        else handlePublish();
    };

    const handleBack = () => {
        if (currentStep > 1) setCurrentStep(c => c - 1);
    };

    const handlePublish = async () => {
        const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
        if (selectedPlan && selectedPlan.price > 0) {
            if (walletBalance === null) {
                showNotification('alert', 'Payment Required', 'Unable to confirm wallet balance. Please reload and try again.');
                return;
            }
            if (walletBalance < selectedPlan.price) {
                showNotification('alert', 'Payment Required', 'Please fund your wallet to pay the plan fee before submitting.');
                return;
            }
        }
        try {
            await AdminService.saveJob({
                ...job,
                id: Math.random().toString(36).substr(2, 9),
                clientName: user?.name || 'Client',
                postedTime: 'Just now',
                proposals: 0,
                plan_id: selectedPlan?.id,
                plan_name: selectedPlan?.name,
                plan_price: selectedPlan?.price,
                plan_interval: selectedPlan?.interval,
                isFeatured: Boolean(selectedPlan?.isPopular),
                status: 'submitted' 
            } as Job);
            
            showNotification('success', 'Job Posted!', 'Your job is under review and will be live shortly.');
            navigate('/client/dashboard');
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to post job.');
        }
    };

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
        setJob(prev => ({
            ...prev,
            attachments: [...(prev.attachments || []), file.url]
        }));
    };

    return (
        <div className="min-h-screen bg-gray-50 pt-20 pb-12 px-4">
            <div className="max-w-4xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Post a New Job</h1>
                    <div className="flex items-center justify-between relative">
                        <div className="absolute left-0 top-1/2 w-full h-1 bg-gray-200 -z-10 rounded"></div>
                        {steps.map((label, idx) => (
                            <div key={idx} className={`flex flex-col items-center bg-gray-50 px-2 ${currentStep > idx + 1 ? 'text-green-600' : currentStep === idx + 1 ? 'text-blue-600' : 'text-gray-400'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-2 transition-colors ${
                                    currentStep > idx + 1 ? 'bg-green-100' : currentStep === idx + 1 ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200'
                                }`}>
                                    {currentStep > idx + 1 ? <CheckCircle className="w-5 h-5" /> : idx + 1}
                                </div>
                                <span className="text-xs font-medium hidden sm:block">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-8">
                        {currentStep === 1 && (
                            <div className="space-y-6 animate-fade-in">
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-1">Job Title</label>
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
                                        <label className="block text-sm font-bold text-gray-900 mb-1">Category</label>
                                        <select 
                                            className="w-full border-gray-300 rounded-xl p-3 shadow-sm bg-white"
                                            value={job.category}
                                            onChange={e => setJob({...job, category: e.target.value})}
                                        >
                                            <option value="">Select Category</option>
                                            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-900 mb-1">Job Type</label>
                                        <div className="flex bg-gray-100 p-1 rounded-xl">
                                            {['Fixed Price', 'Hourly', 'Contract'].map(type => (
                                                <button
                                                    key={type}
                                                    onClick={() => setJob({...job, type: type as string})}
                                                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${job.type === type ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-6 animate-fade-in">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                                        <div className="flex justify-between items-center mb-4">
                                            <div className="flex items-center text-blue-900">
                                                <DollarSign className="w-5 h-5 mr-2" />
                                                <h3 className="font-bold">Budget</h3>
                                            </div>
                                            <button 
                                                onClick={handleOptimizeBudget}
                                                disabled={isOptimizingBudget}
                                                className="text-xs bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-full flex items-center hover:bg-blue-50 transition"
                                            >
                                                {isOptimizingBudget ? <Loader2 className="w-3 h-3 animate-spin mr-1"/> : <Sparkles className="w-3 h-3 mr-1"/>}
                                                Optimize
                                            </button>
                                        </div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Range</label>
                                        <input 
                                            className="w-full border-gray-300 rounded-lg p-3"
                                            placeholder={job.type === 'Hourly' ? "$20 - $50 /hr" : "$500 - $1000"}
                                            value={job.budget}
                                            onChange={e => setJob({...job, budget: e.target.value})}
                                        />
                                        
                                        {budgetAdvice && (
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
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-6 animate-fade-in">
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-1">Job Description</label>
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
                            </div>
                        )}

                        {/* ... Steps 4, 5, 6 remain the same ... */}
                        {currentStep >= 4 && (
                             <div className="space-y-6 animate-fade-in py-8">
                                {currentStep === 4 && (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900">Attachments</h3>
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
                                                {job.attachments.map((url, idx) => (
                                                    <div key={`${url}-${idx}`} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4">
                                                        <div className="flex items-center gap-3">
                                                            <FileText className="w-5 h-5 text-gray-400" />
                                                            <div className="text-sm text-gray-700 truncate max-w-[220px]" title={url}>
                                                                {url.split('/').pop()}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setJob((prev) => ({
                                                                    ...prev,
                                                                    attachments: (prev.attachments || []).filter((a) => a !== url)
                                                                }))
                                                            }
                                                            className="text-red-500 hover:text-red-700 text-sm"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center text-gray-400 border border-dashed border-gray-300 rounded-xl p-8">
                                                <Upload className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                                                <p>No attachments yet. Add files from Uploaded Files.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {currentStep === 5 && (
                                    <div className="space-y-6">
                                        <div className="text-center">
                                            <Crown className="w-12 h-12 mx-auto text-yellow-500 mb-3" />
                                            <h3 className="text-lg font-bold text-gray-900">Choose a Plan</h3>
                                            <p className="text-sm text-gray-500">Select a plan from admin-configured options.</p>
                                        </div>
                                        {(() => {
                                            const selectedPlan = plans.find((plan) => plan.id === selectedPlanId);
                                            if (!selectedPlan || selectedPlan.price <= 0) return null;
                                            return (
                                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                                                <div>
                                                    Wallet balance:{' '}
                                                    <span className="font-semibold text-gray-900">
                                                        {walletLoading ? 'Loading...' : formatPrice(walletBalance || 0)}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    Paid plans require wallet funds before submission.
                                                </div>
                                                <a
                                                    href="/client/dashboard?tab=wallet"
                                                    className="text-blue-600 font-semibold text-xs hover:underline"
                                                >
                                                    Fund Wallet
                                                </a>
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
                                    </div>
                                )}
                                {currentStep === 6 && <div className="text-center"><CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-4"/><p>Review Module Placeholder</p></div>}
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
                            <button className="text-gray-500 hover:text-gray-700 font-medium px-4 py-2 text-sm">Save Draft</button>
                            <button 
                                onClick={handleNext}
                                className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition flex items-center"
                            >
                                {currentStep === steps.length ? 'Submit Job' : 'Next Step'}
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
                acceptedTypes="image/*,.pdf,.doc,.docx"
                filterType="all"
                role="employer"
            />
        </div>
    );
};

export default CreateJob;
