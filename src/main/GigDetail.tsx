
import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MOCK_GIGS } from '../constants';
import { useCurrency } from '../context/CurrencyContext';
import { Star, Check, Clock, User, Heart, Share2, Flag, MessageCircle, Info, ChevronRight, Zap, RefreshCw, ArrowRight, ShieldAlert, ChevronDown, CheckCircle, HelpCircle, Sparkles, Loader2, PlayCircle, FileText, Download } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { ContractService } from '../services/contract';
import { useUser } from '../context/UserContext';
import { AdvisorService } from '../services/ai/advisor.service';
import { PricingAdvice } from '../types';

const GigDetail = () => {
  const { id } = useParams();
  const gig = MOCK_GIGS.find(g => g.id === id) || MOCK_GIGS[0];
  const { formatPrice } = useCurrency();
  const { showNotification } = useNotification();
  const { user } = useUser();
  const navigate = useNavigate();
  const [activePkg, setActivePkg] = useState(0);
  
  // AI Pricing Assistant
  const [pricingAdvice, setPricingAdvice] = useState<PricingAdvice | null>(null);
  const [analyzingPrice, setAnalyzingPrice] = useState(false);

  const handlePriceAnalysis = async () => {
      setAnalyzingPrice(true);
      try {
          const advice = await AdvisorService.getPricingAdvice(gig.category, gig.packages[activePkg].description);
          setPricingAdvice(advice);
      } finally {
          setAnalyzingPrice(false);
      }
  };

  // --- Mock Data for UI Expansion ---
  const milestones = [
      { title: "Initial Concept", duration: "1 Day", price: gig.price * 0.3 },
      { title: "Design Draft", duration: "2 Days", price: gig.price * 0.4 },
      { title: "Final Polish", duration: "1 Day", price: gig.price * 0.3 },
  ];

  const faqs = [
      { q: "Do you provide source files?", a: "Yes, all source files are included in Standard and Premium packages." },
      { q: "Can I get a custom offer?", a: "Absolutely! Please contact me with your requirements." }
  ];

  // --- Utility Actions ---
  const handleSave = () => showNotification('success', 'Saved', 'Gig added to your favorites.');
  const handleShare = () => {
      navigator.clipboard.writeText(window.location.href);
      showNotification('success', 'Copied', 'Link copied to clipboard.');
  };
  const handleReport = () => showNotification('info', 'Reported', 'Thank you. We will review this gig.');

  const handleContact = () => {
      navigate('/messages');
  };

  const handleHourlyRequest = async () => {
      if (!user) {
          navigate('/auth/login');
          return;
      }
      showNotification('success', 'Request Sent', 'Hourly offer request sent to freelancer.');
      navigate('/messages');
  };

  const currentPackage = gig.packages ? gig.packages[activePkg] : null;

  return (
    <div className="bg-gray-50 min-h-screen pb-12 font-sans">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200 sticky top-16 z-30">
            <div className="max-w-7xl mx-auto px-4 py-3 text-sm text-gray-500 flex items-center">
                <Link to="/" className="hover:text-gray-900">Home</Link> 
                <ChevronRight className="w-4 h-4 mx-1" />
                <span className="hover:text-gray-900 cursor-pointer">{gig.category}</span>
                <ChevronRight className="w-4 h-4 mx-1" />
                <span className="font-medium text-gray-900 truncate">{gig.title}</span>
            </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
           
           {/* LEFT COLUMN (70%) */}
           <div className="lg:col-span-2 space-y-8">
               
               {/* Gig Header */}
               <div>
                   <h1 className="text-3xl font-extrabold text-gray-900 mb-4 leading-tight">{gig.title}</h1>
                   <div className="flex flex-wrap items-center gap-4 text-sm">
                        <div className="flex items-center">
                            <img src={gig.freelancerAvatar} className="w-8 h-8 rounded-full mr-2 object-cover border border-gray-200" alt=""/>
                            <span className="font-bold text-gray-900 mr-1 hover:underline cursor-pointer">{gig.freelancerName}</span>
                            <span className="text-gray-500 border-l pl-2 ml-2">Level 2 Seller</span>
                        </div>
                        <div className="flex items-center">
                            <div className="flex text-yellow-400 mr-1">
                                {[...Array(5)].map((_, i) => (
                                    <Star key={i} className={`w-4 h-4 ${i < Math.floor(gig.rating) ? 'fill-current' : 'text-gray-300'}`} />
                                ))}
                            </div>
                            <span className="font-bold text-gray-900">{gig.rating}</span>
                            <span className="text-gray-500 ml-1">({gig.reviews} reviews)</span>
                        </div>
                        <div className="text-gray-500 border-l pl-2 ml-2">
                            2 Orders in Queue
                        </div>
                   </div>
               </div>

               {/* Gallery */}
               <div className="space-y-4">
                   <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200 bg-white">
                       <div className="aspect-video bg-gray-100 relative">
                            <img src={gig.image} className="w-full h-full object-cover" alt={gig.title} />
                       </div>
                       {/* Thumbnails Placeholder */}
                       <div className="p-2 flex gap-2 overflow-x-auto">
                           {[gig.image, ...(gig.images || [])].slice(0, 6).map((src, i) => (
                               <div key={i} className={`w-20 h-20 rounded-lg overflow-hidden border-2 cursor-pointer ${i === 0 ? 'border-blue-600' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                                   <img src={src} className="w-full h-full object-cover" />
                               </div>
                           ))}
                       </div>
                   </div>

                   {/* Video Presentation */}
                   {gig.videos && gig.videos.length > 0 && (
                       <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                           <h4 className="font-bold text-gray-900 mb-3 flex items-center"><PlayCircle className="w-5 h-5 mr-2 text-red-600"/> Video Presentation</h4>
                           <div className="aspect-video bg-black rounded-lg overflow-hidden">
                               <video src={gig.videos[0]} controls className="w-full h-full" />
                           </div>
                       </div>
                   )}
               </div>

               {/* Description */}
               <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                   <h3 className="text-xl font-bold text-gray-900 mb-6">About This Gig</h3>
                   <div className="prose max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
                       {gig.description || "This freelancer has not provided a detailed description. Please contact them for more info."}
                   </div>
                   
                   {/* Documents/Attachments */}
                   {gig.documents && gig.documents.length > 0 && (
                       <div className="mt-8 pt-6 border-t border-gray-100">
                           <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center"><FileText className="w-4 h-4 mr-2"/> Attached Documents</h4>
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                               {gig.documents.map((doc, i) => (
                                   <a key={i} href={doc} target="_blank" rel="noopener noreferrer" className="flex items-center p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition group">
                                       <div className="bg-red-100 p-2 rounded mr-3">
                                           <FileText className="w-5 h-5 text-red-600" />
                                       </div>
                                       <div className="flex-1 min-w-0">
                                           <p className="text-sm font-medium text-gray-900 truncate">Document {i + 1}</p>
                                           <p className="text-xs text-gray-500">PDF • Click to view</p>
                                       </div>
                                       <Download className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
                                   </a>
                               ))}
                           </div>
                       </div>
                   )}

                   <div className="mt-8 pt-6 border-t border-gray-100">
                       <h4 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Expertise</h4>
                       <div className="flex flex-wrap gap-2">
                           {['Professional', 'Creative', 'Fast Delivery', gig.category, 'High Quality'].map((tag, i) => (
                               <span key={i} className="px-4 py-2 bg-gray-50 text-gray-600 rounded-full text-sm font-medium border border-gray-200 hover:bg-gray-100 transition-colors cursor-default">
                                   {tag}
                               </span>
                           ))}
                       </div>
                   </div>
               </div>

               {/* Milestones */}
               <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                   <h3 className="text-xl font-bold text-gray-900 mb-6">Project Stages (Milestones)</h3>
                   <div className="space-y-4">
                       {milestones.map((m, i) => (
                           <div key={i} className="flex justify-between items-center p-4 border border-gray-100 rounded-xl hover:border-blue-200 hover:bg-blue-50/30 transition-colors">
                               <div className="flex items-center">
                                   <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold mr-4 text-sm">
                                       {i + 1}
                                   </div>
                                   <div>
                                       <div className="font-bold text-gray-900">{m.title}</div>
                                       <div className="text-sm text-gray-500">{m.duration}</div>
                                   </div>
                               </div>
                               <div className="font-bold text-gray-900">{formatPrice(m.price)}</div>
                           </div>
                       ))}
                   </div>
               </div>

               {/* Freelancer Bio */}
               <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                   <h3 className="text-xl font-bold text-gray-900 mb-6">About The Seller</h3>
                   <div className="flex flex-col sm:flex-row gap-6">
                       <div className="flex-shrink-0 text-center sm:text-left">
                           <div className="relative inline-block">
                                <img src={gig.freelancerAvatar} className="w-24 h-24 rounded-full object-cover mb-2" alt="" />
                                <span className="absolute bottom-2 right-0 w-6 h-6 bg-green-500 border-4 border-white rounded-full"></span>
                           </div>
                       </div>
                       <div className="flex-1">
                           <h4 className="text-lg font-bold text-gray-900 mb-1">{gig.freelancerName}</h4>
                           <p className="text-gray-500 text-sm mb-4">Professional {gig.category} Specialist</p>
                           
                           <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm mb-6">
                               <div>
                                   <span className="block text-gray-500 mb-1">From</span>
                                   <span className="font-bold text-gray-900">United States</span>
                               </div>
                               <div>
                                   <span className="block text-gray-500 mb-1">Member since</span>
                                   <span className="font-bold text-gray-900">{gig.memberSince || 'Sep 2021'}</span>
                               </div>
                               <div>
                                   <span className="block text-gray-500 mb-1">Avg. response time</span>
                                   <span className="font-bold text-gray-900">{gig.avgResponseTime || '1 hour'}</span>
                               </div>
                               <div>
                                   <span className="block text-gray-500 mb-1">Languages</span>
                                   <span className="font-bold text-gray-900">{(gig.languages || ['English']).join(', ')}</span>
                               </div>
                           </div>
                           <p className="text-gray-700 leading-relaxed mb-6 border-t border-gray-100 pt-4">
                               I am a professional in {gig.category} with years of experience. I take pride in my work and ensure customer satisfaction. I have completed over 100+ projects successfully.
                           </p>
                           <button onClick={handleContact} className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition">
                               Contact Me
                           </button>
                       </div>
                   </div>
               </div>

               {/* FAQs */}
               <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                   <h3 className="text-xl font-bold text-gray-900 mb-6">FAQ</h3>
                   <div className="space-y-4">
                       {faqs.map((faq, i) => (
                           <div key={i} className="group">
                               <h4 className="font-bold text-gray-900 cursor-pointer flex justify-between items-center">
                                   {faq.q}
                                   <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-transform" />
                               </h4>
                               <p className="text-gray-600 mt-2 text-sm">{faq.a}</p>
                               {i < faqs.length - 1 && <div className="border-b border-gray-100 mt-4"></div>}
                           </div>
                       ))}
                   </div>
               </div>

           </div>

           {/* RIGHT COLUMN (30%) - Sticky Sidebar */}
           <div className="lg:col-span-1 space-y-6">
               
               {/* Actions Bar */}
               <div className="flex justify-end gap-2">
                   <button onClick={handleSave} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg hover:text-red-500 transition" title="Save">
                       <Heart className="w-5 h-5" />
                   </button>
                   <button onClick={handleShare} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg hover:text-blue-500 transition" title="Share">
                       <Share2 className="w-5 h-5" />
                   </button>
                   <button onClick={handleReport} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg hover:text-gray-900 transition" title="Report">
                       <Flag className="w-5 h-5" />
                   </button>
               </div>

               {/* Packages Card */}
               <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-lg sticky top-24 z-20">
                   <div className="flex border-b border-gray-200">
                       {gig.packages?.map((pkg, i) => (
                           <button 
                               key={i}
                               onClick={() => setActivePkg(i)}
                               className={`flex-1 py-4 text-sm font-bold text-center transition-colors relative ${activePkg === i ? 'bg-white text-gray-900' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                           >
                               {pkg.name}
                               {activePkg === i && <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-900"></div>}
                           </button>
                       ))}
                   </div>
                   
                   {currentPackage && (
                       <div className="p-6">
                           <div className="flex justify-between items-center mb-6">
                               <span className="font-bold text-lg text-gray-900">Standard License</span>
                               <span className="text-3xl font-extrabold text-gray-900">{formatPrice(currentPackage.price)}</span>
                           </div>
                           <p className="text-gray-600 text-sm mb-6 min-h-[40px] leading-relaxed">{currentPackage.description}</p>
                           
                           <div className="space-y-3 mb-8">
                               <div className="flex items-center text-sm text-gray-900 font-bold">
                                   <Clock className="w-4 h-4 mr-3 text-gray-400" /> {currentPackage.deliveryDays} Days Delivery
                               </div>
                               <div className="flex items-center text-sm text-gray-900 font-bold">
                                   <RefreshCw className="w-4 h-4 mr-3 text-gray-400" /> {currentPackage.revisions === -1 ? 'Unlimited' : currentPackage.revisions} Revisions
                               </div>
                               {currentPackage.features.map((feat, i) => (
                                   <div key={i} className="flex items-center text-sm text-gray-600">
                                       <Check className="w-4 h-4 mr-3 text-green-500" /> {feat}
                                   </div>
                               ))}
                           </div>

                           <button className="w-full bg-gray-900 text-white py-3.5 rounded-xl font-bold hover:bg-gray-800 transition flex items-center justify-center shadow-lg transform hover:-translate-y-0.5">
                               Continue ({formatPrice(currentPackage.price)}) <ArrowRight className="w-4 h-4 ml-2" />
                           </button>
                           <button onClick={handleContact} className="w-full mt-3 text-gray-600 font-medium py-2 hover:text-gray-900 transition text-sm">
                               Contact Seller
                           </button>
                       </div>
                   )}
                   
                   {/* AI Price Negotiation Assistant */}
                   <div className="p-4 border-t border-gray-100 bg-indigo-50/50">
                        {pricingAdvice ? (
                             <div className="text-sm">
                                 <div className="flex items-center text-indigo-700 font-bold mb-1">
                                     <Sparkles className="w-4 h-4 mr-2" /> AI Fair Price Check
                                 </div>
                                 <p className="text-indigo-600 mb-1">Market range: <span className="font-mono font-bold">${pricingAdvice.min} - ${pricingAdvice.max}</span></p>
                                 <p className="text-xs text-gray-500 italic">{pricingAdvice.reasoning}</p>
                             </div>
                        ) : (
                            <button 
                                onClick={handlePriceAnalysis}
                                disabled={analyzingPrice}
                                className="w-full flex items-center justify-center text-xs font-bold text-indigo-600 hover:text-indigo-700 transition"
                            >
                                {analyzingPrice ? <Loader2 className="w-3 h-3 animate-spin mr-1"/> : <Sparkles className="w-3 h-3 mr-1" />}
                                Check if this price is fair (AI)
                            </button>
                        )}
                   </div>
               </div>

               {/* Hourly Hiring CTA (Enhanced) */}
               <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden group">
                   <div className="absolute top-0 right-0 p-8 bg-white/10 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2 group-hover:bg-white/20 transition"></div>
                   
                   <div className="relative z-10">
                       <div className="flex items-start mb-4">
                           <div className="p-2 bg-white/20 rounded-lg mr-3 shadow-inner">
                               <Zap className="w-6 h-6 text-yellow-300 fill-current" />
                           </div>
                           <div>
                               <h3 className="font-bold text-lg">Need Flexibility?</h3>
                               <p className="text-indigo-100 text-sm mt-1">Hire {gig.freelancerName} hourly.</p>
                           </div>
                       </div>
                       
                       <div className="bg-black/20 rounded-xl p-4 mb-5 text-sm backdrop-blur-sm border border-white/10">
                           <ul className="space-y-2.5">
                               <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-300" /> Pay only for actual work</li>
                               <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-300" /> Verified by ATM Tracker</li>
                               <li className="flex items-center"><CheckCircle className="w-4 h-4 mr-2 text-green-300" /> Cancel anytime</li>
                           </ul>
                       </div>
                       
                       <button onClick={handleHourlyRequest} className="w-full bg-white text-indigo-700 font-bold py-3 rounded-lg hover:bg-indigo-50 transition shadow-lg flex items-center justify-center">
                           Request Hourly Offer <ChevronRight className="w-4 h-4 ml-1" />
                       </button>
                   </div>
               </div>

               {/* Support / Trust */}
               <div className="bg-white p-5 rounded-2xl border border-gray-200 text-center shadow-sm">
                   <p className="text-xs text-gray-500 mb-2">Have questions?</p>
                   <Link to="/support" className="text-blue-600 text-sm font-bold hover:underline">Visit our Support Center</Link>
               </div>

           </div>
       </div>
    </div>
  );
};

export default GigDetail;
