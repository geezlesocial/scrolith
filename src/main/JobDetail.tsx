import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Tag, Clock, FileText, ExternalLink, Upload, Heart, ShoppingCart, ChevronLeft, ChevronRight, Sparkles, Save, Check } from 'lucide-react';
import { JobsService } from '../services/jobs';
import { Job, UploadedFile, UserRole } from '../types';
import { useNotification } from '../context/NotificationContext';
import { useUser } from '../context/UserContext';
import FilePickerModal from '../dashboard/shared/FilePickerModal';
import { proposalsApi } from '../services/proposals';
import { jobsApi } from '../services/jobs';
import { useFavorites } from '../context/FavoritesContext';
import { useCart } from '../context/CartContext';
import { FAVORITES_RATE_LIMIT_MESSAGE, isFavoritesRateLimitedError } from '../services/favorites';
import { parseJobAttachment } from '../utils/jobAttachments';
import ListingBodyContent from '../components/ListingBodyContent';
import AIComposerAssist from '../components/ai/AIComposerAssist';

const JobDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, activeRole, setActiveRole } = useUser();
  const { showNotification } = useNotification();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { addJobToCart, isJobInCart } = useCart();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [proposedAmount, setProposedAmount] = useState('');
  const [proposedTimeline, setProposedTimeline] = useState('');
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveApplicationMaterials, setSaveApplicationMaterials] = useState(true);
  const [materialsRestored, setMaterialsRestored] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [jobActionLoading, setJobActionLoading] = useState<'favorite' | 'cart' | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const savedApplicationKey = user?.id ? `scrolith:job-application-materials:${user.id}` : null;

  useEffect(() => {
    if (!applyOpen || !savedApplicationKey) return;
    try {
      const raw = window.localStorage.getItem(savedApplicationKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as { coverLetter?: string; resume?: UploadedFile | null };
      if (!coverLetter.trim() && saved.coverLetter) setCoverLetter(String(saved.coverLetter));
      if (!attachments.length && saved.resume?.id) setAttachments([saved.resume]);
      setMaterialsRestored(Boolean(saved.coverLetter || saved.resume?.id));
    } catch {
      // Local saved materials are an optional convenience; never block applications.
    }
  }, [applyOpen, savedApplicationKey]);

  const persistApplicationMaterials = () => {
    if (!savedApplicationKey) return;
    try {
      window.localStorage.setItem(
        savedApplicationKey,
        JSON.stringify({
          version: 1,
          coverLetter: coverLetter.trim(),
          resume: attachments[0] || null,
          updatedAt: new Date().toISOString()
        })
      );
      setMaterialsRestored(true);
      showNotification('success', 'Application materials saved', 'Your cover letter and resume will be ready for future applications on this account.');
    } catch {
      showNotification('alert', 'Could not save materials', 'Your application can still be submitted, but this device could not save the reusable materials.');
    }
  };

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    const slugify = (value: string) =>
      String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const resolveLegacyJobLink = async (rawId: string): Promise<string | null> => {
      const listResponse: any = await jobsApi.getJobs({ status: 'active', limit: 100 });
      const jobs = Array.isArray(listResponse?.jobs)
        ? listResponse.jobs
        : Array.isArray(listResponse)
        ? listResponse
        : [];

      if (!jobs.length) return null;

      if (/^j\d+$/i.test(rawId)) {
        const index = Number.parseInt(rawId.slice(1), 10) - 1;
        const byIndex = Number.isFinite(index) && index >= 0 ? jobs[index] : null;
        if (byIndex?.id) return byIndex.id;
      }

      const bySlug = jobs.find((entry: any) => slugify(entry?.title || '') === rawId);
      return bySlug?.id || null;
    };

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        if (/^j\d+$/i.test(id)) {
          const resolvedId = await resolveLegacyJobLink(id);
          if (resolvedId && resolvedId !== id) {
            navigate(`/jobs/${resolvedId}`, { replace: true });
            return;
          }
        }
        const data = await JobsService.getById(id);
        if (!mounted) return;
        setJob(data);
      } catch (err: any) {
        if (!mounted) return;
        const status = err?.response?.status;
        if (status === 404) {
          try {
            const resolvedId = await resolveLegacyJobLink(id);
            if (resolvedId && resolvedId !== id) {
              navigate(`/jobs/${resolvedId}`, { replace: true });
              return;
            }
          } catch {
            // Preserve original error handling below if fallback resolution fails.
          }
        }
        setError(err?.message || 'Failed to load job');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const role = String(activeRole || user?.role || '').toLowerCase();
  const isFreelancer = role.includes('freelancer') || role.includes('seller');
  const canApply = Boolean(job && (job.status || '').toLowerCase() === 'active');
  const liked = Boolean(job && isFavorite('job', job.id));
  const inCart = Boolean(job && isJobInCart(job.id));

  useEffect(() => {
    if (!job || !user || searchParams.get('intent') !== 'apply' || !canApply || applyOpen) return;
    if (!isFreelancer) setActiveRole(UserRole.FREELANCER);
    setApplyOpen(true);
  }, [applyOpen, canApply, isFreelancer, job, searchParams, setActiveRole, user]);

  const handleToggleFavorite = async () => {
    if (!job || jobActionLoading) return;
    setJobActionLoading('favorite');
    try {
      await toggleFavorite('job', job.id);
      showNotification(
        'success',
        liked ? 'Removed from favorites' : 'Saved to favorites',
        liked ? 'Job removed from your favorites.' : 'Job added to your favorites.'
      );
    } catch (err: any) {
      showNotification(
        'error',
        'Favorites',
        isFavoritesRateLimitedError(err) ? FAVORITES_RATE_LIMIT_MESSAGE : err?.message || 'Unable to update favorite.'
      );
    } finally {
      setJobActionLoading(null);
    }
  };

  const handleAddToCart = async () => {
    if (!job || jobActionLoading) return;
    if (inCart) {
      showNotification('info', 'Already in cart', 'This job is already in your cart.');
      return;
    }
    setJobActionLoading('cart');
    try {
      await addJobToCart(job.id, 1);
      showNotification('success', 'Added to cart', 'Job added to your cart.');
    } catch (err: any) {
      showNotification('error', 'Cart', err?.message || 'Unable to add job to cart.');
    } finally {
      setJobActionLoading(null);
    }
  };

  const submitProposal = async () => {
    if (!job) return;
    if (!user) {
      showNotification('alert', 'Sign in required', 'Please sign in to apply for this job.');
      return;
    }
    if (!isFreelancer) setActiveRole(UserRole.FREELANCER);

    if (!coverLetter.trim() || coverLetter.trim().length < 10) {
      showNotification('alert', 'Cover letter required', 'Please add at least 10 characters.');
      return;
    }
    const amountValue = proposedAmount.trim() ? Number(proposedAmount) : undefined;
    const timelineValue = proposedTimeline.trim() ? Number(proposedTimeline) : undefined;
    const requiresAmount = Boolean(job.proposalRequirements?.amount);
    const requiresTimeline = Boolean(job.proposalRequirements?.timeline);
    if (requiresAmount && (!Number.isFinite(amountValue) || Number(amountValue) <= 0)) {
      showNotification('alert', 'Invalid amount', 'Enter a valid proposed amount.');
      return;
    }
    if (requiresTimeline && (!Number.isFinite(timelineValue) || Number(timelineValue) <= 0)) {
      showNotification('alert', 'Invalid timeline', 'Enter a valid delivery timeline in days.');
      return;
    }
    if ((amountValue !== undefined && (!Number.isFinite(amountValue) || amountValue < 0)) || (timelineValue !== undefined && (!Number.isFinite(timelineValue) || timelineValue < 0))) {
      showNotification('alert', 'Invalid proposal details', 'Amount and timeline must be valid when provided.');
      return;
    }

    setSubmitting(true);
    try {
      if (saveApplicationMaterials) {
        try {
          if (savedApplicationKey) {
            window.localStorage.setItem(
              savedApplicationKey,
              JSON.stringify({
                version: 1,
                coverLetter: coverLetter.trim(),
                resume: attachments[0] || null,
                updatedAt: new Date().toISOString()
              })
            );
          }
        } catch {
          // Submission must remain independent from optional local persistence.
        }
      }
      await proposalsApi.createProposal({
        jobId: job.id,
        coverLetter: coverLetter.trim(),
        ...(amountValue !== undefined ? { proposedAmount: amountValue } : {}),
        ...(timelineValue !== undefined ? { proposedTimeline: timelineValue } : {}),
        attachments: attachments.map((file) => file.id).filter(Boolean)
      });
      setHasApplied(true);
      setApplyOpen(false);
      showNotification('success', 'Proposal submitted', 'The client has been notified.');
    } catch (err: any) {
      showNotification('error', 'Submission failed', err?.message || 'Failed to submit proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  const jobAttachments = useMemo(
    () => (Array.isArray(job?.attachments) ? job.attachments : [])
      .map(parseJobAttachment)
      .filter((attachment) => attachment.url && attachment.name !== 'Attachment'),
    [job?.attachments]
  );
  const imageAttachments = jobAttachments.filter((attachment) => attachment.kind === 'image').slice(0, 10);
  const videoAttachment = jobAttachments.find((attachment) => attachment.kind === 'video');
  const documentAttachments = jobAttachments.filter((attachment) => attachment.kind !== 'image' && attachment.kind !== 'video');
  const activeImage = imageAttachments[activeImageIndex] || imageAttachments[0];

  useEffect(() => {
    setActiveImageIndex((current) => Math.min(current, Math.max(imageAttachments.length - 1, 0)));
  }, [imageAttachments.length]);

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-12 text-gray-500">Loading job...</div>;
  }

  if (error || !job) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
          {error || 'Job not found'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
       <div className="bg-white border border-gray-200 rounded-lg p-8">
           <div className="flex justify-between items-start mb-6">
               <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
               <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                  {job.status}
               </span>
           </div>

           {(activeImage || videoAttachment) && (
             <div className="mb-8 space-y-4" aria-label="Job media attachments">
               {activeImage && (
                 <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-950">
                   <img
                     src={activeImage.url}
                     alt={activeImage.name}
                     className="block aspect-[16/9] max-h-[min(70vh,640px)] w-full object-contain bg-black"
                     loading="eager"
                     decoding="async"
                   />
                   {imageAttachments.length > 1 && (
                     <>
                       <button
                         type="button"
                         onClick={() => setActiveImageIndex((current) => (current - 1 + imageAttachments.length) % imageAttachments.length)}
                         className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                         aria-label="Previous job image"
                         title="Previous image"
                       >
                         <ChevronLeft className="h-5 w-5" />
                       </button>
                       <button
                         type="button"
                         onClick={() => setActiveImageIndex((current) => (current + 1) % imageAttachments.length)}
                         className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                         aria-label="Next job image"
                         title="Next image"
                       >
                         <ChevronRight className="h-5 w-5" />
                       </button>
                       <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/55 px-2 py-1">
                         {imageAttachments.map((attachment, index) => (
                           <button
                             key={`${attachment.fileId || attachment.raw}-${index}`}
                             type="button"
                             onClick={() => setActiveImageIndex(index)}
                             className={`h-2 w-2 rounded-full ${index === activeImageIndex ? 'bg-white' : 'bg-white/45'}`}
                             aria-label={`Show job image ${index + 1}`}
                             title={`Show image ${index + 1}`}
                           />
                         ))}
                       </div>
                     </>
                   )}
                 </div>
               )}

               {videoAttachment && (
                 <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-950">
                   <video
                     src={videoAttachment.url}
                     poster={videoAttachment.thumbnailUrl || undefined}
                     className="block aspect-video max-h-[min(70vh,640px)] w-full object-contain bg-black"
                     muted
                     playsInline
                     autoPlay
                     loop
                     controls
                     preload="metadata"
                   />
                 </div>
               )}
             </div>
           )}
           
           <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-8 border-b border-gray-100 pb-6">
               {(job.category || job.subcategory) && (
                 <div className="flex items-center">
                   <span className="font-medium text-gray-900 mr-2">Category:</span>
                   {[job.category, job.subcategory].filter(Boolean).join(' · ')}
                 </div>
               )}
               <div className="flex items-center">
                   <span className="font-medium text-gray-900 mr-2">Budget:</span> {job.budget}
               </div>
               <div className="flex items-center">
                   <span className="font-medium text-gray-900 mr-2">Type:</span> {job.type}
               </div>
               <div className="flex items-center">
                   <Clock className="w-4 h-4 mr-1" /> Posted {new Date(job.postedTime).toLocaleDateString()}
               </div>
           </div>

           <div className="mb-8">
               <h3 className="text-lg font-bold mb-3 text-gray-900">Description</h3>
               <ListingBodyContent
                 content={job.description}
                 emptyFallback="No description provided for this job."
               />
           </div>

           {documentAttachments.length > 0 && (
             <div className="mb-8">
               <h3 className="text-lg font-bold mb-3">Attachments</h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {documentAttachments.map((attachment, index) => (
                   <div key={`${attachment.raw}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                     {attachment.kind === 'pdf' && attachment.url ? (
                       <iframe
                         src={attachment.url}
                         title={attachment.name}
                         className="h-56 w-full bg-white"
                         loading="lazy"
                       />
                     ) : (
                       <div className="h-56 w-full flex items-center justify-center bg-white">
                         <FileText className="w-10 h-10 text-gray-400" />
                       </div>
                     )}
                     <div className="p-4 flex items-center justify-between gap-3">
                       <div className="min-w-0">
                         <p className="truncate text-sm font-semibold text-gray-900" title={attachment.name}>
                           {attachment.name}
                         </p>
                         <p className="text-xs text-gray-500 capitalize">{attachment.kind === 'pdf' ? 'PDF' : attachment.kind}</p>
                       </div>
                       {attachment.url && (
                         <a
                           href={attachment.url}
                           target="_blank"
                           rel="noreferrer"
                           className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                         >
                           <ExternalLink className="w-3 h-3" /> Open
                         </a>
                       )}
                     </div>
                   </div>
                 ))}
               </div>
             </div>
           )}

           <div className="mb-8">
               <h3 className="text-lg font-bold mb-2">Skills Required</h3>
               <div className="flex flex-wrap gap-2">
                   {(job.tags || []).map(tag => (
                       <span key={tag} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700">
                           <Tag className="w-3 h-3 mr-1"/> {tag}
                       </span>
                   ))}
               </div>
           </div>

           <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
             {canApply ? (
               <button
                 onClick={() => {
                   if (!user) {
                     showNotification('alert', 'Sign in required', 'Please sign in to apply for this job.');
                     return;
                   }
                   if (!isFreelancer) {
                     setActiveRole(UserRole.FREELANCER);
                     showNotification('info', 'Applying as Freelancer', 'Your employer permissions remain unchanged.');
                   }
                   setApplyOpen(true);
                 }}
                 className="px-6 py-3 bg-green-600 text-white font-bold rounded-md hover:bg-green-700 disabled:opacity-60"
                 disabled={hasApplied}
               >
                 {hasApplied ? 'Proposal Submitted' : 'Apply Now'}
               </button>
             ) : (
                <span className="text-sm text-gray-500">This job is not currently accepting proposals.</span>
             )}
             <button
               type="button"
               onClick={handleToggleFavorite}
               disabled={jobActionLoading === 'favorite'}
               className={`inline-flex items-center justify-center px-4 py-2 rounded-md border text-sm font-semibold disabled:opacity-60 ${
                 liked ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
               }`}
             >
               <Heart className={`w-4 h-4 mr-2 ${liked ? 'fill-current' : ''}`} />
               {liked ? 'Favorited' : 'Favorite'}
             </button>
             <button
               type="button"
               onClick={handleAddToCart}
               disabled={jobActionLoading === 'cart' || inCart}
               className={`inline-flex items-center justify-center px-4 py-2 rounded-md border text-sm font-semibold disabled:opacity-60 ${
                 inCart ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
               }`}
             >
               <ShoppingCart className="w-4 h-4 mr-2" />
               {inCart ? 'In Cart' : 'Add to Cart'}
             </button>
             {inCart && (
               <Link to="/cart" className="text-sm font-semibold text-blue-600 hover:underline">
                 View Cart
               </Link>
             )}
             <Link to="/browse-jobs" className="text-sm font-semibold text-blue-600 hover:underline">
               Back to jobs
             </Link>
           </div>
       </div>

       {applyOpen && (
         <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
           <div className="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[min(92dvh,820px)] sm:rounded-2xl">
             <div className="flex shrink-0 items-start justify-between border-b px-4 py-4 sm:px-6">
               <div>
                 <h3 className="text-lg font-bold text-gray-900">Submit Proposal</h3>
                 <p className="text-xs text-gray-500">Apply to {job.title}</p>
                 <p className="mt-1 text-xs font-semibold text-green-700">Applying as Freelancer</p>
               </div>
               <button
                 onClick={() => setApplyOpen(false)}
                 className="text-gray-400 hover:text-gray-600"
                 type="button"
               >
                 X
               </button>
             </div>

             <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
               <div>
                 <div className="flex flex-wrap items-center justify-between gap-2">
                   <label className="text-sm font-semibold text-gray-700">Cover Letter</label>
                   {materialsRestored ? (
                     <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                       <Check className="h-3.5 w-3.5" /> Reusable materials loaded
                     </span>
                   ) : null}
                 </div>
                 <textarea
                   className="mt-2 min-h-[160px] w-full resize-y rounded-xl border p-3 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                   value={coverLetter}
                   onChange={(e) => setCoverLetter(e.target.value)}
                   placeholder="Introduce yourself, explain your approach, and outline relevant experience."
                 />
                 <AIComposerAssist
                   value={coverLetter.trim() || `Write a concise, truthful cover letter for ${job.title}. Use the job description and required skills below.\n\nJob description:\n${String(job.description || '').slice(0, 5000)}\n\nRequired skills: ${(job.tags || []).join(', ')}`}
                   surface="job-application"
                   defaultMode="professional"
                   compact
                   className="mt-3"
                   onApplyDraft={(draft) => setCoverLetter(draft)}
                 />
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                   <label className="text-sm font-semibold text-gray-700">Proposed Amount <span className="font-normal text-gray-400">{job.proposalRequirements?.amount ? '(required)' : '(optional)'}</span></label>
                   <input
                     type="number"
                     min="0"
                     step="0.01"
                     className="mt-2 w-full border rounded-xl p-3"
                     value={proposedAmount}
                     onChange={(e) => setProposedAmount(e.target.value)}
                     placeholder={job.proposalRequirements?.amount ? 'Enter amount' : 'Optional amount'}
                   />
                 </div>
                 <div>
                   <label className="text-sm font-semibold text-gray-700">Timeline (days) <span className="font-normal text-gray-400">{job.proposalRequirements?.timeline ? '(required)' : '(optional)'}</span></label>
                   <input
                     type="number"
                     min="1"
                     step="1"
                     className="mt-2 w-full border rounded-xl p-3"
                     value={proposedTimeline}
                     onChange={(e) => setProposedTimeline(e.target.value)}
                     placeholder={job.proposalRequirements?.timeline ? 'Delivery days' : 'Optional timeline'}
                   />
                 </div>
               </div>

               <div className="rounded-xl border bg-gray-50 p-4">
                 <div className="flex items-center justify-between">
                   <div>
                     <p className="text-sm font-semibold text-gray-900">Resume / CV</p>
                     <p className="text-xs text-gray-500">Upload or select from your files.</p>
                   </div>
                   <button
                     type="button"
                     onClick={() => setFilePickerOpen(true)}
                     className="inline-flex items-center px-3 py-2 bg-white border rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
                   >
                     <Upload className="w-4 h-4 mr-2" /> Add File
                   </button>
                 </div>
                 {attachments.length > 0 ? (
                   <div className="mt-3 space-y-2">
                     {attachments.map((file) => (
                       <div key={file.id} className="flex items-center justify-between text-sm text-gray-700 bg-white border rounded-lg px-3 py-2">
                         <div className="flex items-center gap-2">
                           <FileText className="w-4 h-4 text-gray-400" />
                           <span>{file.name || file.url}</span>
                         </div>
                         <button
                           type="button"
                           onClick={() => setAttachments((prev) => prev.filter((f) => f.id !== file.id))}
                           className="text-xs text-red-600 hover:underline"
                         >
                           Remove
                         </button>
                       </div>
                     ))}
                   </div>
                 ) : (
                   <p className="mt-3 text-xs text-gray-500">No files selected yet.</p>
                 )}
                 <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs text-gray-600">
                   <input
                     type="checkbox"
                     checked={saveApplicationMaterials}
                     onChange={(event) => setSaveApplicationMaterials(event.target.checked)}
                     className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                   />
                   <span>
                     Save this cover letter and resume for future applications on this account.
                     <span className="mt-0.5 block text-[11px] text-gray-500">You can edit the letter or replace the resume anytime.</span>
                   </span>
                 </label>
                 <button
                   type="button"
                   onClick={persistApplicationMaterials}
                   disabled={!savedApplicationKey || (!coverLetter.trim() && !attachments.length)}
                   className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                 >
                   <Save className="h-3.5 w-3.5" /> Save for future applications
                 </button>
               </div>
             </div>

             <div className="flex shrink-0 flex-col-reverse gap-2 border-t px-4 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
               <button
                 type="button"
                 onClick={() => setApplyOpen(false)}
                 className="px-4 py-2 rounded-xl border text-sm font-semibold text-gray-700"
               >
                 Cancel
               </button>
               <button
                 type="button"
                 onClick={submitProposal}
                 disabled={submitting}
                 className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 disabled:opacity-60"
               >
                 {submitting ? 'Submitting...' : 'Submit Proposal'}
               </button>
             </div>
           </div>
         </div>
       )}

       <FilePickerModal
         isOpen={filePickerOpen}
         onClose={() => setFilePickerOpen(false)}
         onSelect={(file) => {
           setAttachments((prev) => {
             if (prev.find((f) => f.id === file.id)) return prev;
             return [...prev, file];
           });
         }}
         onSelectMultiple={(files) => {
           setAttachments((prev) => {
             const map = new Map(prev.map((f) => [f.id, f]));
             files.forEach((file) => map.set(file.id, file));
             return Array.from(map.values());
           });
         }}
         multiple
         filterType="document"
         acceptedTypes=".pdf,.doc,.docx"
         role="freelancer"
         visibility="private"
       />
    </div>
  );
};

export default JobDetail;
