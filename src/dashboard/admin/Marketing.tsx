
// ... existing imports ...
import React, { useState, useEffect } from 'react';
import { useCurrency } from '../../context/CurrencyContext';
import { useNotification } from '../../context/NotificationContext';
import { 
    Users, Tag, Megaphone, BarChart2, Sparkles, ArrowRight, Shield, 
    Plus, Edit2, Trash2, CheckCircle, XCircle, Save, X, Ban, Search, LayoutTemplate, Globe, Mail, Clock, Send, PlayCircle, MoreVertical, Copy, Upload
} from 'lucide-react';
import { MarketingService } from '../../services/marketing';
import { MarketService } from '../../services/ai/market.service';
import { CMSService } from '../../services/cms';
import { ReferralIntelligence, Affiliate, Coupon, MarketingCampaign, MarketingROI, AffiliatePageContent, UserRole, UploadedFile } from '../../types';
import FilePicker from '../../components/FilePicker';

// ... AffiliateManager, CouponManager, CampaignManager components (keep as is) ...
// Note: I am rewriting the whole file to ensure context correctness, but will try to keep others intact if possible. 
// Since I can't selectively replace inside file easily with just "content", I will provide full file content but with the fix for AffiliatePageEditor.

// --- 1. AFFILIATE MANAGER ---
const AffiliateManager = ({ formatPrice, showNotification }: any) => {
    const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
    
    useEffect(() => {
        MarketingService.getAffiliates().then(setAffiliates);
    }, []);

    const toggleStatus = async (affiliate: Affiliate) => {
        const newStatus = affiliate.status === 'active' ? 'inactive' : 'active';
        await MarketingService.updateAffiliateStatus(affiliate.id, newStatus);
        setAffiliates(prev => prev.map(a => a.id === affiliate.id ? { ...a, status: newStatus } : a));
        showNotification('success', 'Status Updated', `Affiliate is now ${newStatus}`);
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-900">Affiliate Partners</h3>
                <span className="text-xs text-gray-500">{affiliates.length} total</span>
            </div>
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500">
                    <tr>
                        <th className="px-6 py-3">User</th>
                        <th className="px-6 py-3">Code</th>
                        <th className="px-6 py-3">Earnings</th>
                        <th className="px-6 py-3">Referrals</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3 text-right">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {affiliates.map(aff => (
                        <tr key={aff.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{aff.userName}</td>
                            <td className="px-6 py-4"><span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">{aff.code}</span></td>
                            <td className="px-6 py-4 font-bold text-green-600">{formatPrice(aff.earnings)}</td>
                            <td className="px-6 py-4">{aff.referrals}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${aff.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {aff.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <button onClick={() => toggleStatus(aff)} className={`text-xs px-3 py-1 rounded border ${aff.status === 'active' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}>
                                    {aff.status === 'active' ? 'Deactivate' : 'Activate'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// --- 2. COUPON MANAGER ---
const CouponManager = ({ formatPrice, showNotification }: any) => {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [isEditing, setIsEditing] = useState<Partial<Coupon> | null>(null);

    useEffect(() => {
        MarketingService.getCoupons().then(setCoupons);
    }, []);

    const handleSave = async () => {
        if (isEditing && isEditing.code) {
            const saved = await MarketingService.saveCoupon({
                ...isEditing,
                id: isEditing.id || `cpn-${Date.now()}`,
                usedCount: isEditing.usedCount || 0,
                isActive: isEditing.isActive !== undefined ? isEditing.isActive : true
            } as Coupon);
            
            // Update list
            const exists = coupons.find(c => c.id === saved.id);
            if(exists) setCoupons(prev => prev.map(c => c.id === saved.id ? saved : c));
            else setCoupons(prev => [saved, ...prev]);
            
            setIsEditing(null);
            showNotification('success', 'Coupon Saved', `Code ${saved.code} is ready.`);
        }
    };

    const handleDelete = async (id: string) => {
        if(confirm('Delete coupon?')) {
            await MarketingService.deleteCoupon(id);
            setCoupons(prev => prev.filter(c => c.id !== id));
            showNotification('success', 'Deleted', 'Coupon removed.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
                <h3 className="font-bold text-gray-900">Discount Coupons</h3>
                <button onClick={() => setIsEditing({ code: '', value: 10, discountType: 'percentage', usageLimit: 100, expiryDate: '' })} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center hover:bg-green-700">
                    <Plus className="w-4 h-4 mr-2" /> Create Coupon
                </button>
            </div>

            {isEditing && (
                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 mb-6 animate-fade-in">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Code</label>
                            <input className="w-full border rounded p-2" value={isEditing.code} onChange={e => setIsEditing({...isEditing, code: e.target.value.toUpperCase()})} placeholder="SUMMER20" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label>
                            <select className="w-full border rounded p-2" value={isEditing.discountType} onChange={e => setIsEditing({...isEditing, discountType: e.target.value as any})}>
                                <option value="percentage">Percentage (%)</option>
                                <option value="fixed">Fixed Amount ($)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Value</label>
                            <input type="number" className="w-full border rounded p-2" value={isEditing.value} onChange={e => setIsEditing({...isEditing, value: parseFloat(e.target.value)})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Expiry</label>
                            <input type="date" className="w-full border rounded p-2" value={isEditing.expiryDate} onChange={e => setIsEditing({...isEditing, expiryDate: e.target.value})} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setIsEditing(null)} className="px-4 py-2 border rounded text-gray-600 bg-white">Cancel</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded font-bold">Save Coupon</button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {coupons.map(cpn => (
                    <div key={cpn.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group">
                        <div className="flex justify-between items-start mb-2">
                            <span className="font-mono font-bold text-lg text-gray-800 bg-gray-100 px-2 py-1 rounded">{cpn.code}</span>
                            <span className={`text-xs px-2 py-1 rounded font-bold ${cpn.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{cpn.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
                        </div>
                        <div className="text-2xl font-bold text-green-600 mb-1">
                            {cpn.discountType === 'percentage' ? `${cpn.value}% OFF` : `-${formatPrice(cpn.value)}`}
                        </div>
                        <div className="text-xs text-gray-500 flex justify-between mt-2">
                            <span>Used: {cpn.usedCount} / {cpn.usageLimit}</span>
                            <span>Exp: {cpn.expiryDate || 'Never'}</span>
                        </div>
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <button onClick={() => setIsEditing(cpn)} className="p-1.5 bg-white border rounded text-blue-600 hover:bg-blue-50"><Edit2 className="w-3 h-3"/></button>
                            <button onClick={() => handleDelete(cpn.id)} className="p-1.5 bg-white border rounded text-red-600 hover:bg-red-50"><Trash2 className="w-3 h-3"/></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- 3. CAMPAIGN MANAGER ---

const CampaignManager = ({ showNotification }: any) => {
    const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSending, setIsSending] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<Partial<MarketingCampaign>>({
        name: '',
        type: 'email',
        targetAudience: 'all',
        status: 'draft',
        subject: '',
        content: '',
        scheduledAt: ''
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = () => {
        MarketingService.getCampaigns().then(setCampaigns);
    };

    const handleCreate = () => {
        setEditingId(null);
        setFormData({
            name: '',
            type: 'email',
            targetAudience: 'all',
            status: 'draft',
            subject: '',
            content: '',
            scheduledAt: ''
        });
        setIsModalOpen(true);
    };

    const handleEdit = (campaign: MarketingCampaign) => {
        if (campaign.status === 'completed') {
            showNotification('info', 'Read Only', 'Completed campaigns cannot be edited.');
            return;
        }
        setEditingId(campaign.id);
        setFormData({ ...campaign });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to delete this campaign?")) {
            await MarketingService.deleteCampaign(id);
            showNotification('success', 'Deleted', 'Campaign removed.');
            loadData();
        }
    };

    const handleDuplicate = (campaign: MarketingCampaign) => {
        setEditingId(null);
        setFormData({
            ...campaign,
            id: undefined,
            name: `${campaign.name} (Copy)`,
            status: 'draft',
            stats: { sent: 0, opened: 0, clicked: 0 },
            scheduledAt: ''
        });
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name || !formData.content) {
            showNotification('alert', 'Validation Error', 'Name and Content are required.');
            return;
        }

        const campaignToSave: MarketingCampaign = {
            id: editingId || `cmp-${Date.now()}`,
            name: formData.name,
            type: formData.type || 'email',
            status: formData.scheduledAt ? 'scheduled' : (formData.status || 'draft'),
            targetAudience: formData.targetAudience || 'all',
            subject: formData.subject,
            content: formData.content,
            stats: editingId ? (campaigns.find(c => c.id === editingId)?.stats || { sent: 0, opened: 0, clicked: 0 }) : { sent: 0, opened: 0, clicked: 0 },
            createdAt: editingId ? (campaigns.find(c => c.id === editingId)?.createdAt || new Date().toISOString()) : new Date().toISOString(),
            scheduledAt: formData.scheduledAt
        };

        await MarketingService.saveCampaign(campaignToSave);
        showNotification('success', 'Saved', `Campaign ${editingId ? 'updated' : 'created'} successfully.`);
        setIsModalOpen(false);
        loadData();
    };

    const handleSendNow = async (id: string) => {
        if (!confirm("Are you sure you want to send this campaign to all recipients immediately?")) return;
        
        setIsSending(id);
        showNotification('info', 'Sending...', 'Campaign is being broadcasted.');
        
        try {
            await MarketingService.simulateSendCampaign(id);
            showNotification('success', 'Sent', 'Campaign broadcast completed successfully.');
            loadData();
        } catch (e) {
            showNotification('alert', 'Error', 'Failed to send campaign.');
        } finally {
            setIsSending(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
                <div>
                    <h3 className="font-bold text-gray-900">Campaign Manager</h3>
                    <p className="text-xs text-gray-500">Email, SMS, and Push Notifications</p>
                </div>
                <button onClick={handleCreate} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center hover:bg-purple-700">
                    <Plus className="w-4 h-4 mr-2" /> Create Campaign
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map(c => (
                    <div key={c.id} className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow">
                        <div className="p-5 flex-1">
                            <div className="flex justify-between items-start mb-3">
                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                    c.status === 'completed' ? 'bg-green-100 text-green-700' :
                                    c.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                                    c.status === 'active' ? 'bg-purple-100 text-purple-700 animate-pulse' :
                                    'bg-gray-100 text-gray-600'
                                }`}>
                                    {c.status}
                                </span>
                                <div className="flex space-x-1">
                                    <button onClick={() => handleDuplicate(c)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Duplicate">
                                        <Copy className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <h3 className="font-bold text-gray-900 mb-1">{c.name}</h3>
                            <div className="flex items-center text-xs text-gray-500 mb-4">
                                {c.type === 'email' ? <Mail className="w-3 h-3 mr-1" /> : <Megaphone className="w-3 h-3 mr-1" />}
                                <span className="capitalize">{c.type}</span>
                                <span className="mx-2">•</span>
                                <Users className="w-3 h-3 mr-1" />
                                <span className="capitalize">{c.targetAudience}</span>
                            </div>

                            {c.status === 'scheduled' && (
                                <div className="bg-blue-50 text-blue-700 text-xs p-2 rounded mb-4 flex items-center">
                                    <Clock className="w-3 h-3 mr-2" />
                                    Scheduled for {new Date(c.scheduledAt!).toLocaleDateString()}
                                </div>
                            )}

                            <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-4">
                                <div className="text-center">
                                    <div className="text-sm font-bold text-gray-900">{c.stats.sent.toLocaleString()}</div>
                                    <div className="text-[10px] text-gray-500 uppercase">Sent</div>
                                </div>
                                <div className="text-center border-l border-gray-100">
                                    <div className="text-sm font-bold text-gray-900">{c.stats.opened.toLocaleString()}</div>
                                    <div className="text-[10px] text-gray-500 uppercase">Opened</div>
                                </div>
                                <div className="text-center border-l border-gray-100">
                                    <div className="text-sm font-bold text-gray-900">{c.stats.clicked.toLocaleString()}</div>
                                    <div className="text-[10px] text-gray-500 uppercase">Clicked</div>
                                </div>
                            </div>
                        </div>

                        {c.status !== 'completed' && (
                            <div className="bg-gray-50 p-3 border-t border-gray-200 flex gap-2">
                                <button 
                                    onClick={() => handleEdit(c)}
                                    className="flex-1 py-2 bg-white border border-gray-300 rounded text-xs font-bold text-gray-700 hover:bg-gray-100"
                                >
                                    Edit
                                </button>
                                <button 
                                    onClick={() => handleSendNow(c.id)}
                                    disabled={isSending === c.id}
                                    className="flex-1 py-2 bg-purple-600 text-white rounded text-xs font-bold hover:bg-purple-700 flex items-center justify-center disabled:opacity-70"
                                >
                                    {isSending === c.id ? <Clock className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                                    Send Now
                                </button>
                            </div>
                        )}
                    </div>
                ))}
                
                <div onClick={handleCreate} className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center text-gray-400 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50 transition cursor-pointer min-h-[250px]">
                    <Plus className="w-12 h-12 mb-3" />
                    <span className="font-bold text-sm">Create New Campaign</span>
                </div>
            </div>

            {/* Campaign Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-xl w-full max-w-2xl p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6 border-b pb-4">
                            <h3 className="font-bold text-lg">{editingId ? 'Edit Campaign' : 'Create Campaign'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                            <div className="grid grid-cols-2 gap-6">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Campaign Name</label>
                                    <input 
                                        className="w-full border rounded-lg p-2.5 focus:ring-purple-500 focus:border-purple-500" 
                                        placeholder="e.g. Monthly Newsletter" 
                                        value={formData.name} 
                                        onChange={e => setFormData({...formData, name: e.target.value})} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label>
                                    <select 
                                        className="w-full border rounded-lg p-2.5 focus:ring-purple-500 focus:border-purple-500" 
                                        value={formData.type} 
                                        onChange={e => setFormData({...formData, type: e.target.value as any})}
                                    >
                                        <option value="email">Email Blast</option>
                                        <option value="notification">Push Notification</option>
                                        <option value="sms">SMS</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Audience</label>
                                    <select 
                                        className="w-full border rounded-lg p-2.5 focus:ring-purple-500 focus:border-purple-500" 
                                        value={formData.targetAudience} 
                                        onChange={e => setFormData({...formData, targetAudience: e.target.value as any})}
                                    >
                                        <option value="all">All Users</option>
                                        <option value="freelancers">Freelancers Only</option>
                                        <option value="employers">Employers Only</option>
                                        <option value="inactive">Inactive Users (Churn Risk)</option>
                                    </select>
                                </div>
                            </div>

                            {formData.type === 'email' && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Subject</label>
                                    <input 
                                        className="w-full border rounded-lg p-2.5 focus:ring-purple-500 focus:border-purple-500" 
                                        placeholder="Exciting news inside!" 
                                        value={formData.subject} 
                                        onChange={e => setFormData({...formData, subject: e.target.value})} 
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{formData.type === 'email' ? 'Email Body (HTML Supported)' : 'Message Content'}</label>
                                <textarea 
                                    className="w-full border rounded-lg p-3 h-40 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm" 
                                    placeholder="Write your content here..." 
                                    value={formData.content} 
                                    onChange={e => setFormData({...formData, content: e.target.value})} 
                                />
                            </div>

                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Schedule</label>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="datetime-local" 
                                        className="border rounded-lg p-2 text-sm"
                                        value={formData.scheduledAt}
                                        onChange={e => setFormData({...formData, scheduledAt: e.target.value})}
                                    />
                                    <p className="text-xs text-gray-500 flex-1">
                                        Leave blank to keep as Draft. Set a date to Schedule automatically.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                            <button onClick={handleSave} className="px-6 py-2 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700">Save Campaign</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- 4. AFFILIATE PAGE EDITOR (Refactored) ---
const AffiliatePageEditor = () => {
    const [content, setContent] = useState<AffiliatePageContent | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        CMSService.getAffiliateContent().then(data => {
            setContent(data);
            setLoading(false);
        });
    }, []);

    const handleSave = async () => {
        if(content) {
            await CMSService.saveAffiliateContent(content);
            alert("Page content saved!");
        }
    };

    return (
        <>
            {loading ? (
                <div>Loading Editor...</div>
            ) : !content ? (
                <div>No content found.</div>
            ) : (
                <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-6">
                    <h3 className="font-bold text-gray-900">Affiliate Landing Page</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Hero Title</label>
                            <input className="w-full border rounded p-2" value={content.heroTitle} onChange={e => setContent({...content, heroTitle: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Hero Subtitle</label>
                            <textarea className="w-full border rounded p-2" value={content.heroSubtitle} onChange={e => setContent({...content, heroSubtitle: e.target.value})} />
                        </div>
                        <button onClick={handleSave} className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700">Save Content</button>
                    </div>
                </div>
            )}
        </>
    );
};

// --- 5. ROI ANALYTICS (keep as is) ---
const ROIAnalytics = ({ formatPrice }: any) => {
    const [roiData, setRoiData] = useState<MarketingROI[]>([]);

    useEffect(() => {
        // Mock data fetch
        setRoiData([
            { channel: 'Google Ads', spend: 5000, conversions: 120, costPerAcquisition: 41.66, revenue: 15000, roi: 200 },
            { channel: 'Email Marketing', spend: 500, conversions: 450, costPerAcquisition: 1.11, revenue: 8500, roi: 1600 },
        ]);
    }, []);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
                <h3 className="font-bold text-gray-900">Campaign ROI Performance</h3>
            </div>
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-500">
                    <tr>
                        <th className="px-6 py-3">Channel</th>
                        <th className="px-6 py-3">Spend</th>
                        <th className="px-6 py-3">Conversions</th>
                        <th className="px-6 py-3">CPA</th>
                        <th className="px-6 py-3">Revenue</th>
                        <th className="px-6 py-3">ROI</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {roiData.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium">{row.channel}</td>
                            <td className="px-6 py-4">{formatPrice(row.spend)}</td>
                            <td className="px-6 py-4">{row.conversions}</td>
                            <td className="px-6 py-4">{formatPrice(row.costPerAcquisition)}</td>
                            <td className="px-6 py-4 text-green-600">{formatPrice(row.revenue)}</td>
                            <td className="px-6 py-4 font-bold text-blue-600">{row.roi}%</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// --- 6. REFERRAL INTELLIGENCE (keep as is) ---
const ReferralIntelligencePanel = () => {
    const [data, setData] = useState<ReferralIntelligence | null>(null);

    useEffect(() => {
        MarketService.getReferralIntelligence().then(setData);
    }, []);

    if(!data) return <div>Loading Intel...</div>;

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-teal-900 to-emerald-800 text-white p-6 rounded-xl shadow-lg">
                <h3 className="font-bold text-lg mb-2 flex items-center"><Sparkles className="w-5 h-5 mr-2" /> AI Referral Insights</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-emerald-100">
                    {data.campaignSuggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl border border-gray-200">
                    <h4 className="font-bold text-gray-900 mb-4">Top Referrers (High Quality)</h4>
                    <div className="space-y-3">
                        {data.topReferrers.map((ref, i) => (
                            <div key={i} className="flex justify-between items-center border-b pb-2 last:border-0">
                                <div>
                                    <div className="font-medium text-sm">{ref.name}</div>
                                    <div className="text-xs text-gray-500">K-Factor: {ref.kFactor}</div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-green-600">{ref.totalReferrals} refs</div>
                                    <div className="text-xs text-gray-400">Quality: {ref.qualityScore}/100</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-red-50 p-6 rounded-xl border border-red-200">
                    <h4 className="font-bold text-red-900 mb-4 flex items-center"><Shield className="w-4 h-4 mr-2"/> Fraud / Self-Referral Alerts</h4>
                    {data.fraudAlerts.length === 0 ? <p className="text-sm text-red-600">No active alerts.</p> : (
                        <div className="space-y-2">
                            {data.fraudAlerts.map((alert, i) => (
                                <div key={i} className="bg-white p-3 rounded border border-red-100 shadow-sm text-sm">
                                    <span className="font-bold text-red-700 block">{alert.reason}</span>
                                    <span className="text-xs text-gray-500">Referrer ID: {alert.referrerId} • Severity: {alert.severity}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const MarketingTab = () => {
    const [activeTab, setActiveTab] = useState<'affiliates' | 'page_content' | 'coupons' | 'campaigns' | 'roi' | 'referral-ai'>('affiliates');
    const { formatPrice } = useCurrency();
    const { showNotification } = useNotification();

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-6 bg-gray-100 p-1 rounded-xl">
                <button onClick={() => setActiveTab('affiliates')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-all ${activeTab === 'affiliates' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>
                    <Users className="w-4 h-4 mr-2" /> Partners
                </button>
                <button onClick={() => setActiveTab('page_content')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-all ${activeTab === 'page_content' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>
                    <LayoutTemplate className="w-4 h-4 mr-2" /> Page Content
                </button>
                <button onClick={() => setActiveTab('coupons')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-all ${activeTab === 'coupons' ? 'bg-white shadow text-green-600' : 'text-gray-500'}`}>
                    <Tag className="w-4 h-4 mr-2" /> Coupons
                </button>
                <button onClick={() => setActiveTab('campaigns')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-all ${activeTab === 'campaigns' ? 'bg-white shadow text-purple-600' : 'text-gray-500'}`}>
                    <Megaphone className="w-4 h-4 mr-2" /> Campaigns
                </button>
                <button onClick={() => setActiveTab('roi')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-all ${activeTab === 'roi' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>
                    <BarChart2 className="w-4 h-4 mr-2" /> ROI
                </button>
                <button onClick={() => setActiveTab('referral-ai')} className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center transition-all ${activeTab === 'referral-ai' ? 'bg-white shadow text-teal-600' : 'text-gray-500'}`}>
                    <Sparkles className="w-4 h-4 mr-2" /> AI Intel
                </button>
            </div>

            {activeTab === 'affiliates' && <AffiliateManager formatPrice={formatPrice} showNotification={showNotification} />}
            {activeTab === 'page_content' && <AffiliatePageEditor />}
            {activeTab === 'coupons' && <CouponManager formatPrice={formatPrice} showNotification={showNotification} />}
            {activeTab === 'campaigns' && <CampaignManager showNotification={showNotification} />}
            {activeTab === 'roi' && <ROIAnalytics formatPrice={formatPrice} />}
            {activeTab === 'referral-ai' && <ReferralIntelligencePanel />}
        </div>
    );
};

export default MarketingTab;
