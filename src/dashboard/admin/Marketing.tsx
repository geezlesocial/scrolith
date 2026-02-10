
// ... existing imports ...
import React, { useState, useEffect } from 'react';
import { useCurrency } from '../../context/CurrencyContext';
import { useNotification } from '../../context/NotificationContext';
import { 
    Users, Tag, Megaphone, BarChart2, Sparkles, ArrowRight, Shield, 
    Plus, Edit2, Trash2, CheckCircle, XCircle, Save, X, Ban, Search, LayoutTemplate, Globe, Mail, Clock, Send, PlayCircle, MoreVertical, Copy, Upload, Image
} from 'lucide-react';
import { MarketingService } from '../../services/marketing';
import { MarketService } from '../../services/ai/market.service';
import { CMSService } from '../../services/cms';
import { ReferralIntelligence, Affiliate, Coupon, MarketingCampaign, MarketingPopupSubscribeConfig, MarketingROI, AffiliatePageContent, UserRole, UploadedFile } from '../../types';
import FilePickerModal from '../shared/FilePickerModal';

// ... AffiliateManager, CouponManager, CampaignManager components (keep as is) ...
// Note: I am rewriting the whole file to ensure context correctness, but will try to keep others intact if possible. 
// Since I can't selectively replace inside file easily with just "content", I will provide full file content but with the fix for AffiliatePageEditor.

// --- 1. AFFILIATE MANAGER ---
const AffiliateManager = ({ formatPrice, showNotification }: any) => {
    const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadAffiliates = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await MarketingService.getAffiliates();
            setAffiliates(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to load affiliates';
            setError(message);
            showNotification('alert', 'Unable to load affiliates', message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAffiliates();
    }, []);

    const toggleStatus = async (affiliate: Affiliate) => {
        const newStatus = affiliate.status === 'active' ? 'inactive' : 'active';
        try {
            await MarketingService.updateAffiliateStatus(affiliate.id, newStatus);
            showNotification('success', 'Status Updated', `Affiliate is now ${newStatus}`);
            await loadAffiliates();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to update status';
            showNotification('alert', 'Status update failed', message);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-900">Affiliate Partners</h3>
                <span className="text-xs text-gray-500">{affiliates.length} total</span>
            </div>
            {loading ? (
                <div className="p-6 text-center text-xs text-gray-500">Loading affiliates...</div>
            ) : error ? (
                <div className="p-6 text-center text-xs text-red-500">{error}</div>
            ) : (
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
            )}
        </div>
    );
};

// --- 2. COUPON MANAGER ---
const CouponManager = ({ formatPrice, showNotification }: any) => {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [isEditing, setIsEditing] = useState<Partial<Coupon> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadCoupons = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await MarketingService.getCoupons();
            setCoupons(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to load coupons';
            setError(message);
            showNotification('alert', 'Unable to load coupons', message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCoupons();
    }, []);

    const handleSave = async () => {
        if (!isEditing?.code) {
            showNotification('alert', 'Validation', 'Coupon code is required.');
            return;
        }

        const payload: Partial<Coupon> = {
            ...isEditing,
            usedCount: isEditing.usedCount ?? 0,
            usageLimit: isEditing.usageLimit ?? 0,
            isActive: isEditing.isActive !== undefined ? isEditing.isActive : true
        };
        if (isEditing.id) {
            payload.id = isEditing.id;
        }

        try {
            const saved = await MarketingService.saveCoupon(payload as Coupon);
            showNotification('success', 'Coupon Saved', `Code ${saved.code} is ready.`);
            setIsEditing(null);
            await loadCoupons();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save coupon';
            showNotification('alert', 'Save Failed', message);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete coupon?')) return;
        try {
            await MarketingService.deleteCoupon(id);
            showNotification('success', 'Deleted', 'Coupon removed.');
            await loadCoupons();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete coupon';
            showNotification('alert', 'Delete Failed', message);
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
                            <select className="w-full border rounded p-2" value={isEditing.discountType} onChange={e => setIsEditing({...isEditing, discountType: e.target.value as string})}>
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

            {loading ? (
                <div className="p-4 text-center text-xs text-gray-500">Loading coupons...</div>
            ) : error ? (
                <div className="p-4 text-center text-xs text-red-500">{error}</div>
            ) : (
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
            )}
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
        scheduledAt: '',
        bannerTitle: '',
        bannerBody: '',
        imageUrl: '',
        ctaText: '',
        ctaUrl: '',
        delaySeconds: 6,
        cooldownHours: 24
    });
    const [popupConfig, setPopupConfig] = useState<MarketingPopupSubscribeConfig | null>(null);
    const [popupLoading, setPopupLoading] = useState(true);
    const [popupSaving, setPopupSaving] = useState(false);
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await MarketingService.getCampaigns();
            const normalized = (data || []).map(c => ({
                ...c,
                stats: c.stats ?? { sent: 0, opened: 0, clicked: 0 },
                targetAudience: c.targetAudience || c.target_audience || 'all'
            }));
            setCampaigns(normalized);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to load campaigns';
            setError(message);
            showNotification('alert', 'Campaigns failed to load', message);
        } finally {
            setLoading(false);
        }
    };

    const loadPopupConfig = async () => {
        setPopupLoading(true);
        try {
            const config = await MarketingService.getPopupSubscribeConfig();
            setPopupConfig(config);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to load popup settings';
            showNotification('alert', 'Popup Settings failed to load', message);
        } finally {
            setPopupLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        loadPopupConfig();
    }, []);

    const handleCreate = () => {
        setEditingId(null);
        setFormData({
            name: '',
            type: 'email',
            targetAudience: 'all',
            status: 'draft',
            subject: '',
            content: '',
            scheduledAt: '',
            bannerTitle: '',
            bannerBody: '',
            imageUrl: '',
            ctaText: '',
            ctaUrl: '',
            delaySeconds: 6,
            cooldownHours: 24
        });
        setIsModalOpen(true);
    };

    const handleEdit = (campaign: MarketingCampaign) => {
        if (campaign.status === 'completed') {
            showNotification('info', 'Read Only', 'Completed campaigns cannot be edited.');
            return;
        }
        setEditingId(campaign.id);
        setFormData({
            ...campaign,
            targetAudience: campaign.targetAudience || campaign.target_audience || 'all',
            bannerTitle: campaign.bannerTitle || '',
            bannerBody: campaign.bannerBody || '',
            imageUrl: campaign.imageUrl || '',
            ctaText: campaign.ctaText || '',
            ctaUrl: campaign.ctaUrl || '',
            delaySeconds: campaign.delaySeconds ?? 6,
            cooldownHours: campaign.cooldownHours ?? 24
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this campaign?")) return;
        try {
            await MarketingService.deleteCampaign(id);
            showNotification('success', 'Deleted', 'Campaign removed.');
            await loadData();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Delete failed';
            showNotification('alert', 'Delete Failed', message);
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
            scheduledAt: '',
            bannerTitle: campaign.bannerTitle || '',
            bannerBody: campaign.bannerBody || '',
            imageUrl: campaign.imageUrl || '',
            ctaText: campaign.ctaText || '',
            ctaUrl: campaign.ctaUrl || '',
            delaySeconds: campaign.delaySeconds ?? 6,
            cooldownHours: campaign.cooldownHours ?? 24
        });
        setIsModalOpen(true);
    };

    const handleSave = async () => {
        if (!formData.name) {
            showNotification('alert', 'Validation Error', 'Campaign name is required.');
            return;
        }

        if (formData.type === 'popup_banner') {
            if (!formData.bannerTitle || !formData.ctaText || !formData.ctaUrl) {
                showNotification('alert', 'Validation Error', 'Popup banners need a title, CTA text, and CTA URL.');
                return;
            }
        } else if (!formData.content) {
            showNotification('alert', 'Validation Error', 'Message content is required.');
            return;
        }

        const existing = campaigns.find(c => c.id === editingId);
        const payload: Partial<MarketingCampaign> = {
            name: formData.name,
            type: formData.type || 'email',
            status: formData.scheduledAt ? 'scheduled' : (formData.status || 'draft'),
            targetAudience: formData.targetAudience || 'all',
            subject: formData.subject,
            content: formData.content || formData.bannerBody,
            bannerTitle: formData.bannerTitle,
            bannerBody: formData.bannerBody || formData.content,
            imageUrl: formData.imageUrl,
            ctaText: formData.ctaText,
            ctaUrl: formData.ctaUrl,
            delaySeconds: formData.delaySeconds,
            cooldownHours: formData.cooldownHours,
            stats: existing?.stats ?? { sent: 0, opened: 0, clicked: 0 },
            createdAt: existing?.createdAt || new Date().toISOString(),
            scheduledAt: formData.scheduledAt || undefined
        };
        if (editingId) payload.id = editingId;

        try {
            await MarketingService.saveCampaign(payload as MarketingCampaign);
            showNotification('success', 'Saved', `Campaign ${editingId ? 'updated' : 'created'} successfully.`);
            setIsModalOpen(false);
            await loadData();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save campaign';
            showNotification('alert', 'Save Failed', message);
        }
    };

    const handleSendNow = async (id: string) => {
        if (!confirm("Are you sure you want to send this campaign to all recipients immediately?")) return;
        
        setIsSending(id);
        showNotification('info', 'Sending...', 'Campaign is being delivered.');
        
        try {
            await MarketingService.sendCampaign(id);
            showNotification('success', 'Sent', 'Campaign delivery completed successfully.');
            loadData();
        } catch (e) {
            showNotification('alert', 'Error', 'Failed to send campaign.');
        } finally {
            setIsSending(null);
        }
    };

    const updatePopupConfig = (patch: Partial<MarketingPopupSubscribeConfig>) => {
        setPopupConfig(prev => {
            const base = prev || {
                enabled: false,
                title: 'Join our newsletter',
                subtitle: 'Get the latest product updates, offers, and insights.',
                placeholder: 'Enter your email',
                buttonText: 'Subscribe',
                successMessage: 'Thanks for subscribing!',
                delaySeconds: 6,
                cooldownHours: 24
            };
            return { ...base, ...patch };
        });
    };

    const handleSavePopupConfig = async () => {
        if (!popupConfig) return;
        setPopupSaving(true);
        try {
            await MarketingService.savePopupSubscribeConfig(popupConfig);
            showNotification('success', 'Saved', 'Popup subscribe settings updated.');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save popup settings';
            showNotification('alert', 'Save Failed', message);
        } finally {
            setPopupSaving(false);
        }
    };

    const isPopupBanner = formData.type === 'popup_banner';
    const isInboxMessage = formData.type === 'inbox';

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h3 className="font-bold text-gray-900">Popup Subscribe</h3>
                        <p className="text-xs text-gray-500">Capture emails with a timed modal on the public site.</p>
                    </div>
                    <button
                        onClick={handleSavePopupConfig}
                        disabled={popupSaving}
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-70"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        {popupSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>

                {popupLoading ? (
                    <div className="text-xs text-gray-500">Loading popup settings...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <span className="text-sm font-medium text-gray-700">Enable Popup</span>
                            <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={popupConfig?.enabled || false}
                                onChange={(e) => updatePopupConfig({ enabled: e.target.checked })}
                            />
                        </label>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Title</label>
                            <input
                                className="w-full border rounded-lg p-2.5"
                                value={popupConfig?.title || ''}
                                onChange={(e) => updatePopupConfig({ title: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Subtitle</label>
                            <input
                                className="w-full border rounded-lg p-2.5"
                                value={popupConfig?.subtitle || ''}
                                onChange={(e) => updatePopupConfig({ subtitle: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Placeholder</label>
                            <input
                                className="w-full border rounded-lg p-2.5"
                                value={popupConfig?.placeholder || ''}
                                onChange={(e) => updatePopupConfig({ placeholder: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Button Text</label>
                            <input
                                className="w-full border rounded-lg p-2.5"
                                value={popupConfig?.buttonText || ''}
                                onChange={(e) => updatePopupConfig({ buttonText: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Success Message</label>
                            <input
                                className="w-full border rounded-lg p-2.5"
                                value={popupConfig?.successMessage || ''}
                                onChange={(e) => updatePopupConfig({ successMessage: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Delay (sec)</label>
                                <input
                                    type="number"
                                    min={0}
                                    className="w-full border rounded-lg p-2.5"
                                    value={popupConfig?.delaySeconds ?? 6}
                                    onChange={(e) => updatePopupConfig({ delaySeconds: Number(e.target.value) })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cooldown (hrs)</label>
                                <input
                                    type="number"
                                    min={1}
                                    className="w-full border rounded-lg p-2.5"
                                    value={popupConfig?.cooldownHours ?? 24}
                                    onChange={(e) => updatePopupConfig({ cooldownHours: Number(e.target.value) })}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200">
                <div>
                    <h3 className="font-bold text-gray-900">Campaign Manager</h3>
                    <p className="text-xs text-gray-500">Inbox delivery, popup banners, email, SMS, and push</p>
                </div>
                <button onClick={handleCreate} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center hover:bg-purple-700">
                    <Plus className="w-4 h-4 mr-2" /> Create Campaign
                </button>
            </div>

            {loading ? (
                <div className="p-6 text-center text-xs text-gray-500">Loading campaigns...</div>
            ) : error ? (
                <div className="p-6 text-center text-xs text-red-500">{error}</div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map(c => {
                    const stats = c.stats ?? { sent: 0, opened: 0, clicked: 0 };
                    const audience = c.targetAudience || c.target_audience || 'all';
                    const typeLabel = c.type === 'popup_banner' ? 'Popup Banner' : c.type === 'inbox' ? 'Inbox Message' : c.type;
                    const isPopup = c.type === 'popup_banner';
                    const sendLabel = isPopup ? 'Activate' : 'Send Now';

                    return (
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

                                <h3 className="font-bold text-gray-900 mb-1">{isPopup ? (c.bannerTitle || c.name) : c.name}</h3>
                                <div className="flex items-center text-xs text-gray-500 mb-4">
                                    {isPopup ? <LayoutTemplate className="w-3 h-3 mr-1" /> : c.type === 'email' ? <Mail className="w-3 h-3 mr-1" /> : <Megaphone className="w-3 h-3 mr-1" />}
                                    <span className="capitalize">{typeLabel}</span>
                                    <span className="mx-2">•</span>
                                    <Users className="w-3 h-3 mr-1" />
                                    <span className="capitalize">{audience}</span>
                                </div>

                                {isPopup && c.imageUrl && (
                                    <div className="mb-4">
                                        <img src={c.imageUrl} alt={c.bannerTitle || c.name} className="w-full h-32 object-cover rounded-lg border" />
                                    </div>
                                )}

                                {c.status === 'scheduled' && c.scheduledAt && (
                                    <div className="bg-blue-50 text-blue-700 text-xs p-2 rounded mb-4 flex items-center">
                                        <Clock className="w-3 h-3 mr-2" />
                                        Scheduled for {new Date(c.scheduledAt).toLocaleDateString()}
                                    </div>
                                )}

                                <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-4">
                                    <div className="text-center">
                                        <div className="text-sm font-bold text-gray-900">{Number(stats.sent || 0).toLocaleString()}</div>
                                        <div className="text-[10px] text-gray-500 uppercase">Sent</div>
                                    </div>
                                    <div className="text-center border-l border-gray-100">
                                        <div className="text-sm font-bold text-gray-900">{Number(stats.opened || 0).toLocaleString()}</div>
                                        <div className="text-[10px] text-gray-500 uppercase">Opened</div>
                                    </div>
                                    <div className="text-center border-l border-gray-100">
                                        <div className="text-sm font-bold text-gray-900">{Number(stats.clicked || 0).toLocaleString()}</div>
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
                                        {sendLabel}
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
                
                <div onClick={handleCreate} className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center text-gray-400 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50 transition cursor-pointer min-h-[250px]">
                    <Plus className="w-12 h-12 mb-3" />
                    <span className="font-bold text-sm">Create New Campaign</span>
                </div>
            </div>
            )}

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
                                        onChange={e => setFormData({...formData, type: e.target.value as string})}
                                    >
                                        <option value="email">Email Blast</option>
                                        <option value="notification">Push Notification</option>
                                        <option value="sms">SMS</option>
                                        <option value="inbox">Inbox Message</option>
                                        <option value="popup_banner">Popup Banner</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Audience</label>
                                    <select 
                                        className="w-full border rounded-lg p-2.5 focus:ring-purple-500 focus:border-purple-500" 
                                        value={formData.targetAudience} 
                                        onChange={e => setFormData({...formData, targetAudience: e.target.value as string})}
                                    >
                                        <option value="all">All Users</option>
                                        <option value="freelancers">Freelancers Only</option>
                                        <option value="employers">Employers Only</option>
                                        <option value="inactive">Inactive Users (Churn Risk)</option>
                                    </select>
                                </div>
                            </div>

                            {!isPopupBanner && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                        {formData.type === 'email' ? 'Email Subject' : 'Message Title'}
                                    </label>
                                    <input 
                                        className="w-full border rounded-lg p-2.5 focus:ring-purple-500 focus:border-purple-500" 
                                        placeholder="Exciting news inside!" 
                                        value={formData.subject} 
                                        onChange={e => setFormData({...formData, subject: e.target.value})} 
                                    />
                                </div>
                            )}

                            {!isPopupBanner ? (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                        {formData.type === 'email'
                                            ? 'Email Body (HTML Supported)'
                                            : isInboxMessage
                                                ? 'Inbox Message Content'
                                                : 'Message Content'}
                                    </label>
                                    <textarea 
                                        className="w-full border rounded-lg p-3 h-40 focus:ring-purple-500 focus:border-purple-500 font-mono text-sm" 
                                        placeholder="Write your content here..." 
                                        value={formData.content} 
                                        onChange={e => setFormData({...formData, content: e.target.value})} 
                                    />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Banner Title</label>
                                        <input
                                            className="w-full border rounded-lg p-2.5 focus:ring-purple-500 focus:border-purple-500"
                                            placeholder="Limited time offer"
                                            value={formData.bannerTitle || ''}
                                            onChange={e => setFormData({ ...formData, bannerTitle: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Banner Body</label>
                                        <textarea
                                            className="w-full border rounded-lg p-3 h-28 focus:ring-purple-500 focus:border-purple-500 text-sm"
                                            placeholder="Describe the offer, CTA, or announcement."
                                            value={formData.bannerBody || ''}
                                            onChange={e => setFormData({ ...formData, bannerBody: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Image</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                className="w-full border rounded-lg p-2.5"
                                                placeholder="https://..."
                                                value={formData.imageUrl || ''}
                                                onChange={e => setFormData({ ...formData, imageUrl: e.target.value })}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setIsFilePickerOpen(true)}
                                                className="inline-flex items-center px-3 py-2 border rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50"
                                            >
                                                <Image className="w-4 h-4 mr-1" />
                                                Browse
                                            </button>
                                        </div>
                                        {formData.imageUrl && (
                                            <img src={formData.imageUrl} alt="Banner preview" className="mt-3 w-full h-32 object-cover rounded-lg border" />
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CTA Text</label>
                                            <input
                                                className="w-full border rounded-lg p-2.5"
                                                placeholder="Shop Now"
                                                value={formData.ctaText || ''}
                                                onChange={e => setFormData({ ...formData, ctaText: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CTA URL</label>
                                            <input
                                                className="w-full border rounded-lg p-2.5"
                                                placeholder="https://example.com"
                                                value={formData.ctaUrl || ''}
                                                onChange={e => setFormData({ ...formData, ctaUrl: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Delay (sec)</label>
                                            <input
                                                type="number"
                                                min={0}
                                                className="w-full border rounded-lg p-2.5"
                                                value={formData.delaySeconds ?? 6}
                                                onChange={e => setFormData({ ...formData, delaySeconds: Number(e.target.value) })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cooldown (hrs)</label>
                                            <input
                                                type="number"
                                                min={1}
                                                className="w-full border rounded-lg p-2.5"
                                                value={formData.cooldownHours ?? 24}
                                                onChange={e => setFormData({ ...formData, cooldownHours: Number(e.target.value) })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Schedule</label>
                                <div className="flex items-center gap-4">
                                    <input 
                                        type="datetime-local" 
                                        className="border rounded-lg p-2 text-sm"
                                        value={formData.scheduledAt || ''}
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

            <FilePickerModal
                open={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelect={(file: UploadedFile) => {
                    setFormData({ ...formData, imageUrl: file.url || '' });
                    setIsFilePickerOpen(false);
                }}
                filterType="image"
                acceptedTypes={['image']}
                title="Select Banner Image"
                role="admin"
                visibility="public"
            />
        </div>
    );
};

// --- 4. AFFILIATE PAGE EDITOR (Refactored) ---
const AffiliatePageEditor = () => {
    const [content, setContent] = useState<AffiliatePageContent | null>(null);
    const [loading, setLoading] = useState(true);
    const { showNotification } = useNotification();

    const loadContent = async () => {
        setLoading(true);
        try {
            const data = await CMSService.getAffiliateContent();
            setContent(data ?? { heroTitle: '', heroSubtitle: '' });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unable to load content';
            showNotification('alert', 'Load Failed', message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadContent();
    }, []);

    const handleSave = async () => {
        if (!content) return;
        try {
            await CMSService.saveAffiliateContent(content);
            showNotification('success', 'Page Saved', 'Affiliate landing page content updated.');
            await loadContent();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Save failed';
            showNotification('alert', 'Save Failed', message);
        }
    };

    return (
        <>
            {loading ? (
                <div className="p-6 text-xs text-gray-500">Loading Editor...</div>
            ) : !content ? (
                <div className="p-6 text-xs text-gray-500">No content found.</div>
            ) : (
                <div className="bg-white p-6 rounded-xl border border-gray-200 space-y-6">
                    <h3 className="font-bold text-gray-900">Affiliate Landing Page</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Hero Title</label>
                            <input className="w-full border rounded p-2" value={content.heroTitle} onChange={e => setContent({ ...content, heroTitle: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Hero Subtitle</label>
                            <textarea className="w-full border rounded p-2" value={content.heroSubtitle} onChange={e => setContent({ ...content, heroSubtitle: e.target.value })} />
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
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-bold text-gray-900">Campaign ROI Performance</h3>
                <span className="text-[10px] uppercase text-gray-500">Placeholder demo data</span>
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



    if (!data) return <div className="p-6 text-xs text-gray-500">Loading Intel...</div>;



    const suggestions = data.campaignSuggestions ?? [];

    const referrers = data.topReferrers ?? [];

    const fraudAlerts = data.fraudAlerts ?? [];



    return (

        <div className="space-y-6">

            <div className="bg-gradient-to-r from-teal-900 to-emerald-800 text-white p-6 rounded-xl shadow-lg">

                <h3 className="font-bold text-lg mb-2 flex items-center"><Sparkles className="w-5 h-5 mr-2" /> AI Referral Insights</h3>

                {suggestions.length === 0 ? (

                    <p className="text-sm text-emerald-100">No suggestions available yet.</p>

                ) : (

                    <ul className="list-disc pl-5 space-y-1 text-sm text-emerald-100">

                        {suggestions.map((s, i) => <li key={i}>{s}</li>)}

                    </ul>

                )}

            </div>

            

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                <div className="bg-white p-6 rounded-xl border border-gray-200">

                    <h4 className="font-bold text-gray-900 mb-4">Top Referrers (High Quality)</h4>

                    {referrers.length === 0 ? (

                        <p className="text-sm text-gray-500">No referrers tracked yet.</p>

                    ) : (

                        <div className="space-y-3">

                            {referrers.map((ref, i) => (

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

                    )}

                </div>



                <div className="bg-red-50 p-6 rounded-xl border border-red-200">

                    <h4 className="font-bold text-red-900 mb-4 flex items-center"><Shield className="w-4 h-4 mr-2"/> Fraud / Self-Referral Alerts</h4>

                    {fraudAlerts.length === 0 ? <p className="text-sm text-red-600">No active alerts.</p> : (

                        <div className="space-y-2">

                            {fraudAlerts.map((alert, i) => (

                                <div key={i} className="bg-white p-3 rounded border border-red-100 shadow-sm text-sm">

                                    <span className="font-bold text-red-700 block">{alert.reason}</span>

                                    <span className="text-xs text-gray-500">Referrer ID: {alert.referrerId} � Severity: {alert.severity}</span>

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
