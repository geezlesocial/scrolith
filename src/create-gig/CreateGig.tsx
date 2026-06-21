
import React, { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import { AdminService } from '../services/admin';
import { Gig, ListingCategory, GigPackage, UploadedFile, GigFAQ, GigRequirement } from '../types';
import { Briefcase, CheckCircle, X, Trash2, Plus, Sparkles, ChevronRight, ChevronLeft, Image as ImageIcon, Video, HelpCircle, Loader2, Save, FileText } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import FilePicker from '../components/FilePicker';
import RichTextEditor from '../components/RichTextEditor';

const CreateGig = () => {
    const { user } = useUser();
    const { showNotification } = useNotification();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const gigId = searchParams.get('id');
    const isEditMode = !!gigId;
    
    // Steps: Overview, Pricing, Description, Requirements, Gallery, Publish
    const steps = ['Overview', 'Scope & Pricing', 'Description', 'Requirements', 'Gallery', 'Publish'];
    const [currentStep, setCurrentStep] = useState(1);
    
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
        status: 'draft', 
        adminStatus: 'pending'
    });

    // UI State
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [filePickerMode, setFilePickerMode] = useState<'image' | 'video' | 'document'>('image');

    useEffect(() => {
        const init = async () => {
            const cats = await AdminService.getGigCategories();
            setCategories(cats);

            if (isEditMode) {
                // Fetch existing gig (Mock fetch)
                const existing = (await AdminService.getAdminGigs()).find(g => g.id === gigId);
                if (existing) {
                    setGig(existing);
                } else {
                    showNotification('alert', 'Error', 'Gig not found');
                    navigate('/freelancer/dashboard');
                }
            } else if (searchParams.get('mode') === 'ai_draft') {
                 // Load AI draft from session storage
                 const draft = sessionStorage.getItem('ai_job_brief'); // Reusing brief logic or new
                 if(draft) {
                     // logic to parse draft
                 }
            }
            setLoadingData(false);
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
        if (currentStep === 1 && (!gig.title || !gig.category)) {
            showNotification('alert', 'Required', 'Title and Category are required.');
            return;
        }
        if (currentStep === 3 && !gig.description) {
            showNotification('alert', 'Required', 'Description is required.');
            return;
        }
        
        if (currentStep < steps.length) setCurrentStep(c => c + 1);
        else handlePublish();
    };

    const handleBack = () => {
        if (currentStep > 1) setCurrentStep(c => c - 1);
    };

    const handlePublish = async () => {
        try {
            await AdminService.saveGig({
                ...gig,
                id: gig.id || Math.random().toString(36).substr(2, 9),
                freelancerName: user?.name || 'Freelancer',
                freelancerId: user?.id,
                freelancerAvatar: user?.avatar || '',
                createdAt: gig.createdAt || new Date().toISOString(),
                status: 'submitted', // Submit for approval
                adminStatus: 'pending',
                isVisible: true
            } as Gig);
            
            showNotification('success', 'Success', `Gig ${isEditMode ? 'updated' : 'submitted'} successfully.`);
            navigate('/freelancer/dashboard?tab=gigs');
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to save gig.');
        }
    };

    const updatePackage = (idx: number, field: keyof GigPackage, val: any) => {
        const pkgs = [...(gig.packages || [])];
        pkgs[idx] = { ...pkgs[idx], [field]: val };
        const price = idx === 0 && field === 'price' ? Number(val) : gig.price;
        setGig({ ...gig, packages: pkgs, price });
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
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">{isEditMode ? 'Edit Gig' : 'Create New Gig'}</h1>
                    </div>
                    {!isEditMode && (
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
                    {steps.map((label, idx) => (
                        <div key={idx} className={`flex flex-col items-center bg-gray-50 px-4 min-w-[100px] ${currentStep > idx + 1 ? 'text-green-600' : currentStep === idx + 1 ? 'text-indigo-600' : 'text-gray-400'}`}>
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-2 transition-colors ${
                                currentStep > idx + 1 ? 'bg-green-100' : currentStep === idx + 1 ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-200'
                            }`}>
                                {currentStep > idx + 1 ? <CheckCircle className="w-5 h-5" /> : idx + 1}
                            </div>
                            <span className="text-xs font-medium text-center whitespace-nowrap">{label}</span>
                        </div>
                    ))}
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden min-h-[600px] flex flex-col">
                    <div className="p-8 flex-1">
                        
                        {/* STEP 1: OVERVIEW */}
                        {currentStep === 1 && (
                            <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-1">Gig Title</label>
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
                                        <label className="block text-sm font-bold text-gray-900 mb-1">Category</label>
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
                                        <label className="block text-sm font-bold text-gray-900 mb-1">Subcategory</label>
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
                            </div>
                        )}

                        {/* STEP 2: PRICING */}
                        {currentStep === 2 && (
                            <div className="space-y-8 animate-fade-in">
                                <div className="overflow-x-auto border rounded-xl shadow-sm">
                                    <table className="w-full text-sm border-collapse">
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
                                                <td className="p-4 border-r border-t font-medium text-gray-700 bg-gray-50">Price ($)</td>
                                                {gig.packages?.map((pkg, i) => (
                                                    <td key={i} className="p-2 border-r border-t last:border-r-0">
                                                        <input type="number" className="w-full border-gray-200 rounded-lg p-2 font-bold text-center" value={pkg.price} onChange={(e) => updatePackage(i, 'price', parseInt(e.target.value))} />
                                                    </td>
                                                ))}
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: DESCRIPTION */}
                        {currentStep === 3 && (
                            <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
                                <div>
                                    <label className="block text-sm font-bold text-gray-900 mb-2">Gig Description</label>
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
                            </div>
                        )}

                        {/* STEP 4: REQUIREMENTS */}
                        {currentStep === 4 && (
                            <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
                                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex items-start">
                                    <HelpCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5" />
                                    <p className="text-sm text-blue-800">Tell buyers what you need to start the order.</p>
                                </div>

                                {gig.requirements?.map((req, i) => (
                                    <div key={i} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm relative">
                                        <button onClick={() => setGig({...gig, requirements: gig.requirements?.filter((_, idx) => idx !== i)})} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                                        <input 
                                            className="w-full mb-3 border-gray-300 rounded-lg text-sm font-medium p-2" 
                                            value={req.question} 
                                            onChange={e => {
                                                const reqs = [...(gig.requirements || [])];
                                                reqs[i].question = e.target.value;
                                                setGig({...gig, requirements: reqs});
                                            }}
                                            placeholder="Requirement question..."
                                        />
                                    </div>
                                ))}

                                <button 
                                    onClick={() => setGig({...gig, requirements: [...(gig.requirements || []), { id: Date.now().toString(), question: '', type: 'text', required: true }]})}
                                    className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-500 hover:text-indigo-600 font-medium transition flex items-center justify-center"
                                >
                                    <Plus className="w-4 h-4 mr-2" /> Add Requirement
                                </button>
                            </div>
                        )}

                        {/* STEP 5: GALLERY */}
                        {currentStep === 5 && (
                            <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
                                {/* Images Section */}
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

                                {/* Video Section */}
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

                                {/* Documents Section (New) */}
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
                            </div>
                        )}

                        {/* STEP 6: PUBLISH */}
                        {currentStep === 6 && (
                            <div className="max-w-lg mx-auto text-center py-12 animate-fade-in">
                                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <CheckCircle className="w-12 h-12 text-green-600" />
                                </div>
                                <h2 className="text-3xl font-bold text-gray-900 mb-2">Ready to Launch!</h2>
                                <p className="text-gray-600 mb-8">
                                    Your gig is ready. It will be reviewed by our team shortly after submission.
                                </p>
                                <div className="flex justify-center gap-4">
                                     <button onClick={() => setGig({...gig, status: 'draft'})} className="px-6 py-3 border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50">
                                         Save as Draft
                                     </button>
                                     <button onClick={handlePublish} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg flex items-center">
                                         <Save className="w-4 h-4 mr-2" /> Submit Gig
                                     </button>
                                </div>
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

            <FilePicker 
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelect={handleFileSelect}
                acceptedTypes={getAcceptedTypes()}
                title={`Select ${filePickerMode === 'image' ? 'Image' : filePickerMode === 'video' ? 'Video' : 'Document'}`}
            />
        </div>
    );
};

export default CreateGig;
