
import React, { useState, useEffect } from 'react';
import { SupportService } from '../services/support';
import { useNotification } from '../context/NotificationContext';
import { Ticket, Search, CheckCircle, Upload, ArrowRight, User, Mail, Phone, FileText, Clock, RefreshCw, MessageSquare } from 'lucide-react';
import { TicketCategory, SupportTicket, TicketStatus } from '../types';

const Support = () => {
    const { showNotification } = useNotification();
    const [activeTab, setActiveTab] = useState<'create' | 'track'>('create');
    const [trackingCodeInput, setTrackingCodeInput] = useState('');
    const [trackedTicket, setTrackedTicket] = useState<SupportTicket | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [createdTicket, setCreatedTicket] = useState<SupportTicket | null>(null);
    const [categories, setCategories] = useState<TicketCategory[]>([]);

    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        mobile: '',
        subject: '',
        message: '',
        category: '',
        file: null as File | null
    });

    useEffect(() => {
        const loadCategories = async () => {
            const cats = await SupportService.getCategories();
            const activeCats = cats.filter(c => c.isActive);
            setCategories(activeCats);
            if (activeCats.length > 0) {
                setFormData(prev => ({ ...prev, category: activeCats[0].name }));
            }
        };
        loadCategories();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            // Convert file to mock URL for demo persistence
            let attachments: string[] = [];
            if (formData.file) {
                 // In a real app, this would be an S3 upload URL. 
                 // For this mock, we store the name to indicate presence, or a dataURL if small enough.
                 // We'll use a placeholder for now to avoid huge localstorage.
                 attachments = [`mock-url://${formData.file.name}`]; 
            }

            const ticket = await SupportService.createTicket({
                ...formData,
                attachments
            });
            setCreatedTicket(ticket);
            showNotification('success', 'Ticket Created', `Your tracking code is ${ticket.trackingCode}`);
            setFormData({ fullName: '', email: '', mobile: '', subject: '', message: '', category: categories[0]?.name || '', file: null });
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to create ticket. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTrack = async (e: React.FormEvent) => {
        e.preventDefault();
        if(!trackingCodeInput) return;
        
        setIsSubmitting(true);
        try {
            // Note: We are allowing tracking by just Code for UX simplicity in this demo, 
            // but normally Email verification is required.
            const ticket = await SupportService.getTicketById(trackingCodeInput);
            if (ticket) {
                setTrackedTicket(ticket);
            } else {
                showNotification('alert', 'Not Found', 'No ticket found with this tracking code.');
                setTrackedTicket(null);
            }
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to track ticket.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderStatusTimeline = (status: TicketStatus) => {
        const steps = ['Open', 'In Review', 'Resolved', 'Closed'];
        // Map status to step index
        let currentIdx = 0;
        if (status === 'Open') currentIdx = 0;
        else if (status === 'In Review' || status === 'In Progress' || status === 'Waiting for User') currentIdx = 1;
        else if (status === 'Resolved') currentIdx = 2;
        else if (status === 'Closed') currentIdx = 3;

        return (
            <div className="flex items-center justify-between w-full mb-8 relative">
                 <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -z-10 -translate-y-1/2 rounded"></div>
                 {steps.map((step, i) => (
                     <div key={i} className={`flex flex-col items-center bg-white px-2 ${i <= currentIdx ? 'text-blue-600' : 'text-gray-400'}`}>
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs mb-2 transition-all ${
                             i <= currentIdx ? 'bg-blue-600 text-white shadow-lg scale-110' : 'bg-gray-200'
                         }`}>
                             {i < currentIdx ? <CheckCircle className="w-5 h-5" /> : i + 1}
                         </div>
                         <span className="text-xs font-medium">{step}</span>
                     </div>
                 ))}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gray-50 pt-24 pb-16 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-gray-900 mb-4">Support Center</h1>
                    <p className="text-lg text-gray-600">We're here to help. Submit a ticket or track an existing request.</p>
                </div>

                <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                    <div className="flex border-b border-gray-200">
                        <button 
                            onClick={() => setActiveTab('create')}
                            className={`flex-1 py-4 text-center font-medium text-sm transition-colors ${activeTab === 'create' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            Submit a Request
                        </button>
                        <button 
                            onClick={() => setActiveTab('track')}
                            className={`flex-1 py-4 text-center font-medium text-sm transition-colors ${activeTab === 'track' ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            Track Ticket
                        </button>
                    </div>

                    <div className="p-8">
                        {activeTab === 'create' ? (
                            createdTicket ? (
                                <div className="text-center py-12">
                                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                        <CheckCircle className="w-10 h-10 text-green-600" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Ticket Created Successfully!</h3>
                                    <p className="text-gray-600 mb-6">Your Tracking ID is:</p>
                                    <div className="bg-gray-100 py-3 px-6 rounded-lg text-xl font-mono font-bold text-gray-800 inline-block mb-8 border border-gray-200">
                                        {createdTicket.trackingCode}
                                    </div>
                                    <p className="text-sm text-gray-500 max-w-md mx-auto mb-8">
                                        Use this code to track the status of your request at any time.
                                    </p>
                                    <button 
                                        onClick={() => { setTrackingCodeInput(createdTicket.trackingCode || ''); setCreatedTicket(null); setActiveTab('track'); }}
                                        className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
                                    >
                                        Track Status
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleCreate} className="space-y-6 max-w-2xl mx-auto">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                                            <div className="relative">
                                                <User className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                                <input 
                                                    required 
                                                    className="pl-10 w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                                    value={formData.fullName}
                                                    onChange={e => setFormData({...formData, fullName: e.target.value})}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                                <input 
                                                    required 
                                                    type="email"
                                                    className="pl-10 w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                                    value={formData.email}
                                                    onChange={e => setFormData({...formData, email: e.target.value})}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number</label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                                <input 
                                                    className="pl-10 w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                                    value={formData.mobile}
                                                    onChange={e => setFormData({...formData, mobile: e.target.value})}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                                            <select 
                                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                                value={formData.category}
                                                onChange={e => setFormData({...formData, category: e.target.value})}
                                            >
                                                {categories.map(c => (
                                                    <option key={c.id} value={c.name}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                                        <input 
                                            required 
                                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                            value={formData.subject}
                                            onChange={e => setFormData({...formData, subject: e.target.value})}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Detailed Message *</label>
                                        <textarea 
                                            required 
                                            rows={5}
                                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                                            value={formData.message}
                                            onChange={e => setFormData({...formData, message: e.target.value})}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Attachment (Optional)</label>
                                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition relative">
                                            <input 
                                                type="file" 
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                onChange={e => setFormData({...formData, file: e.target.files?.[0] || null})}
                                            />
                                            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                                            {formData.file ? (
                                                <p className="text-green-600 font-medium text-sm">{formData.file.name}</p>
                                            ) : (
                                                <p className="text-sm text-gray-500">Drag & drop or click to upload</p>
                                            )}
                                        </div>
                                    </div>

                                    <button 
                                        type="submit" 
                                        disabled={isSubmitting}
                                        className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Creating Ticket...' : 'Submit Ticket'}
                                    </button>
                                </form>
                            )
                        ) : (
                            <div className="max-w-2xl mx-auto">
                                {!trackedTicket ? (
                                    <form onSubmit={handleTrack} className="space-y-6 bg-gray-50 p-8 rounded-xl border border-gray-200">
                                        <div className="text-center mb-4">
                                            <h3 className="text-lg font-bold text-gray-800">Track Your Request</h3>
                                            <p className="text-sm text-gray-500">Enter your tracking code to see updates.</p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Tracking ID *</label>
                                            <div className="relative">
                                                <Ticket className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                                <input 
                                                    required 
                                                    className="pl-10 w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 font-mono"
                                                    placeholder="ATM-XXXXXXXX"
                                                    value={trackingCodeInput}
                                                    onChange={e => setTrackingCodeInput(e.target.value.toUpperCase())}
                                                />
                                            </div>
                                        </div>
                                        
                                        <button 
                                            type="submit" 
                                            disabled={isSubmitting}
                                            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-bold hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center"
                                        >
                                            {isSubmitting ? 'Searching...' : <>Track Ticket <ArrowRight className="ml-2 w-4 h-4" /></>}
                                        </button>
                                    </form>
                                ) : (
                                    <div className="space-y-8 animate-fade-in">
                                        {/* Status Timeline */}
                                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                            {renderStatusTimeline(trackedTicket.status)}
                                            
                                            <div className="flex justify-between items-start mt-6 pt-6 border-t border-gray-100">
                                                <div>
                                                    <h3 className="text-xl font-bold text-gray-900">{trackedTicket.subject}</h3>
                                                    <div className="flex items-center gap-3 mt-1">
                                                        <span className="text-sm text-gray-500">#{trackedTicket.trackingCode || trackedTicket.id}</span>
                                                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{trackedTicket.category}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right text-xs text-gray-400">
                                                    <div>Updated: {new Date(trackedTicket.updatedAt).toLocaleString()}</div>
                                                </div>
                                            </div>

                                            <div className="mt-4 text-gray-700 bg-gray-50 p-4 rounded-lg text-sm">
                                                <span className="block text-xs font-bold text-gray-400 mb-1 uppercase">Your Message</span>
                                                {trackedTicket.message}
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h4 className="font-bold text-gray-900 flex items-center">
                                                <MessageSquare className="w-4 h-4 mr-2" /> Conversation History
                                            </h4>
                                            {trackedTicket.replies.length === 0 ? (
                                                <p className="text-gray-500 text-sm italic p-4 bg-gray-50 rounded-lg">No replies yet. We are reviewing your ticket.</p>
                                            ) : (
                                                trackedTicket.replies.filter((r: any) => !r.internalNote).map((reply: any) => (
                                                    <div key={reply.id} className={`flex ${reply.sender === 'admin' ? 'justify-start' : 'justify-end'}`}>
                                                        <div className={`max-w-[85%] rounded-xl p-4 shadow-sm ${reply.sender === 'admin' ? 'bg-blue-50 text-blue-900' : 'bg-gray-100 text-gray-900'}`}>
                                                            <div className="flex items-center justify-between mb-2 text-xs opacity-70">
                                                                <span className="font-bold">{reply.senderName}</span>
                                                                <span>{new Date(reply.timestamp).toLocaleDateString()}</span>
                                                            </div>
                                                            <p className="text-sm whitespace-pre-wrap">{reply.message}</p>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                        
                                        <button onClick={() => { setTrackedTicket(null); setTrackingCodeInput(''); }} className="text-blue-600 text-sm hover:underline mt-4 flex items-center">
                                            <RefreshCw className="w-3 h-3 mr-1" /> Track another ticket
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Support;
