
import React, { useState, useEffect } from 'react';
import { DollarSign, Users, Globe, CheckCircle, ArrowRight, TrendingUp, Loader2 } from 'lucide-react';
import { MarketingService } from '../services/marketing';
import { CMSService } from '../services/cms';
import { useNotification } from '../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { AffiliatePageContent } from '../types';

const AffiliateProgram = () => {
    const { showNotification } = useNotification();
    const navigate = useNavigate();
    const [content, setContent] = useState<AffiliatePageContent | null>(null);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        userName: '',
        email: '',
        website: '',
        promotionStrategy: '',
        audienceSize: '0 - 1k'
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        const fetchContent = async () => {
            try {
                const data = await CMSService.getAffiliateContent();
                setContent(data);
            } catch (err) {
                console.error("Failed to load affiliate content", err);
            } finally {
                setLoading(false);
            }
        };
        fetchContent();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await MarketingService.submitApplication(formData);
            setIsSuccess(true);
            showNotification('success', 'Application Received', 'We will review your application shortly.');
        } catch (error) {
            showNotification('error', 'Error', 'Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Helper functions need to be inside or outside but not block hooks
    const getIcon = (iconName: string) => {
        switch(iconName) {
            case 'dollar': return <DollarSign className="w-8 h-8" />;
            case 'trending': return <TrendingUp className="w-8 h-8" />;
            case 'users': return <Users className="w-8 h-8" />;
            default: return <DollarSign className="w-8 h-8" />;
        }
    };

    const getIconBg = (iconName: string) => {
        switch(iconName) {
            case 'dollar': return 'bg-green-100 text-green-600';
            case 'trending': return 'bg-blue-100 text-blue-600';
            case 'users': return 'bg-purple-100 text-purple-600';
            default: return 'bg-gray-100 text-gray-600';
        }
    };

    return (
        <>
            {loading ? (
                <div className="min-h-screen flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
            ) : isSuccess ? (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle className="w-8 h-8 text-green-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Received!</h2>
                        <p className="text-gray-600 mb-6">
                            Thank you for applying to the Scrolith Affiliate Program. Our team will review your details and get back to you within 2-3 business days via email.
                        </p>
                        <button onClick={() => navigate('/')} className="text-blue-600 font-medium hover:underline">
                            Return Home
                        </button>
                    </div>
                </div>
            ) : (
                <div className="min-h-screen bg-white">
                    {/* Hero */}
                    <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white pt-24 pb-20 px-4">
                        <div className="max-w-7xl mx-auto text-center">
                            <h1 className="text-4xl md:text-5xl font-extrabold mb-6 animate-fade-in-up">
                                {content?.heroTitle || "Earn Money by Promoting Scrolith"}
                            </h1>
                            <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-8 animate-fade-in-up delay-100">
                                {content?.heroSubtitle}
                            </p>
                            <a href="#apply" className="inline-block bg-white text-blue-900 px-8 py-4 rounded-full font-bold text-lg hover:bg-blue-50 transition shadow-lg animate-fade-in-up delay-200">
                                {content?.heroButtonText || "Become an Affiliate"}
                            </a>
                        </div>
                    </div>

                    {/* Benefits */}
                    <div className="py-20 px-4 bg-gray-50">
                        <div className="max-w-7xl mx-auto">
                            <div className="text-center mb-16">
                                <h2 className="text-3xl font-bold text-gray-900">Why Partner With Us?</h2>
                                <p className="text-gray-600 mt-2">We provide everything you need to succeed.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                {content?.benefits.map((benefit, idx) => (
                                    <div key={idx} className="bg-white p-8 rounded-xl shadow-sm border border-gray-100 text-center hover:-translate-y-1 transition-transform duration-300">
                                        <div className={`w-14 h-14 ${getIconBg(benefit.icon)} rounded-full flex items-center justify-center mx-auto mb-4`}>
                                            {getIcon(benefit.icon)}
                                        </div>
                                        <h3 className="text-xl font-bold mb-2">{benefit.title}</h3>
                                        <p className="text-gray-600">{benefit.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Application Form */}
                    <div id="apply" className="py-20 px-4">
                        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                            <div className="bg-gray-50 px-8 py-6 border-b border-gray-200">
                                <h2 className="text-2xl font-bold text-gray-900">Affiliate Application</h2>
                                <p className="text-sm text-gray-500 mt-1">Tell us a bit about yourself and how you plan to promote us.</p>
                            </div>
                            <form onSubmit={handleSubmit} className="p-8 space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                        <input 
                                            required
                                            type="text" 
                                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="John Doe"
                                            value={formData.userName}
                                            onChange={e => setFormData({...formData, userName: e.target.value})}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                        <input 
                                            required
                                            type="email" 
                                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="john@example.com"
                                            value={formData.email}
                                            onChange={e => setFormData({...formData, email: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Website or Social Profile URL</label>
                                    <div className="relative">
                                        <Globe className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                                        <input 
                                            required
                                            type="url" 
                                            className="w-full pl-10 border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="https://yourblog.com or @instagram_handle"
                                            value={formData.website}
                                            onChange={e => setFormData({...formData, website: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Audience Size</label>
                                    <select 
                                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.audienceSize}
                                        onChange={e => setFormData({...formData, audienceSize: e.target.value})}
                                    >
                                        <option>0 - 1k</option>
                                        <option>1k - 10k</option>
                                        <option>10k - 50k</option>
                                        <option>50k - 100k</option>
                                        <option>100k+</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Promotion Strategy</label>
                                    <textarea 
                                        required
                                        rows={4}
                                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="How do you plan to promote Scrolith? (e.g. Blog reviews, YouTube tutorials, Email list...)"
                                        value={formData.promotionStrategy}
                                        onChange={e => setFormData({...formData, promotionStrategy: e.target.value})}
                                    />
                                </div>

                                <div className="pt-4">
                                    <button 
                                        type="submit" 
                                        disabled={isSubmitting}
                                        className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition shadow-lg flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting ? <><Loader2 className="w-5 h-5 animate-spin mr-2"/> Submitting...</> : <>Submit Application <ArrowRight className="ml-2 w-5 h-5" /></>}
                                    </button>
                                    <p className="text-xs text-center text-gray-500 mt-4">
                                        By submitting this form, you agree to our Affiliate Terms and Conditions.
                                    </p>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AffiliateProgram;

