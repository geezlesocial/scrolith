import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Paperclip,
  Phone,
  Send,
  ShieldCheck,
  Upload,
  X
} from 'lucide-react';
import { CMSService } from '../services/cms';
import { SupportService } from '../services/support';
import { FileService } from '../services/files';
import { useNotification } from '../context/NotificationContext';
import { useSocket } from '../context/SocketContext';
import { useUser } from '../context/UserContext';
import { prepareStaticPageContent } from '../utils/staticPageContent';
import { StaticPage, SupportTicket, UploadedFile } from '../types';

type ContactReasonOption = {
  label: string;
  description: string;
};

const CONTACT_REASON_OPTIONS: ContactReasonOption[] = [
  { label: 'Investment', description: 'Investor outreach, capital, strategic finance, or market conversations.' },
  { label: 'Partnership', description: 'Channel, ecosystem, technology, or distribution partnership requests.' },
  { label: 'Advertisements', description: 'Brand campaigns, sponsorships, paid placements, or promotional collaboration.' },
  { label: 'Advice & Strategic Guidance', description: 'Executive, growth, platform, or market guidance requests.' },
  { label: 'Enterprise Sales', description: 'Enterprise account discussions, procurement, or high-volume platform use.' },
  { label: 'Media & Press', description: 'Press inquiries, interviews, announcements, or public relations coordination.' },
  { label: 'Careers & Opportunities', description: 'Recruiting, talent introductions, or role-specific career outreach.' },
  { label: 'Legal & Compliance', description: 'Formal notices, compliance questions, policy matters, or legal coordination.' },
  { label: 'Product Feedback', description: 'Platform-level feedback, roadmap suggestions, or usability recommendations.' },
  { label: 'Technical Escalation', description: 'High-priority operational or technical escalation beyond normal support.' },
  { label: 'General Inquiry', description: 'General company communication that does not fit another category.' }
];

const fallbackPage: StaticPage = {
  id: 'contact-fallback',
  title: 'Contact Scrolith',
  slug: 'contact',
  content:
    '<p>Use this page to contact the Scrolith team directly about partnerships, investment, recruiting, enterprise use cases, advertising, and other business communication.</p>',
  blocks: [],
  status: 'PUBLISHED',
  visibility: 'public',
  updated_at: new Date().toISOString(),
  category_id: '',
  seo: {
    meta_title: 'Contact Scrolith',
    meta_description:
      'Send a secure message to the Scrolith team with attachments and track replies inside your account.',
    meta_keywords: ['contact scrolith', 'business contact', 'investment', 'partnerships']
  },
  images: [],
  videos: []
};

const reasonOptions = new Set(CONTACT_REASON_OPTIONS.map((option) => option.label.toLowerCase()));

const normalizeReason = (value: string) => {
  const cleaned = String(value || '').trim().toLowerCase();
  const match = CONTACT_REASON_OPTIONS.find((option) => option.label.toLowerCase() === cleaned);
  return match?.label || CONTACT_REASON_OPTIONS[0].label;
};

const inferUploadCategory = (file: File): UploadedFile['category'] => {
  if (file.type.startsWith('image/')) return 'portfolio';
  if (file.type.startsWith('video/')) return 'portfolio';
  return 'document';
};

const ContactPage: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const { socket } = useSocket();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [page, setPage] = useState<StaticPage>(fallbackPage);
  const [pageLoading, setPageLoading] = useState(true);
  const [ticketLoading, setTicketLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [recentTickets, setRecentTickets] = useState<SupportTicket[]>([]);
  const [createdTicket, setCreatedTicket] = useState<SupportTicket | null>(null);
  const [formData, setFormData] = useState({
    fullName: user?.name || '',
    email: user?.email || '',
    mobile: (user as any)?.phone || '',
    reason: CONTACT_REASON_OPTIONS[0].label,
    subject: '',
    message: ''
  });

  const loadPage = async () => {
    try {
      setPageLoading(true);
      const data = await CMSService.getPageBySlug('contact');
      setPage(data || fallbackPage);
    } catch (error) {
      console.error('Failed to load contact page:', error);
      setPage(fallbackPage);
    } finally {
      setPageLoading(false);
    }
  };

  const loadTickets = async () => {
    try {
      setTicketLoading(true);
      const tickets = await SupportService.getMyTickets();
      setRecentTickets(Array.isArray(tickets) ? tickets.slice(0, 4) : []);
    } catch (error) {
      console.error('Failed to load recent contact tickets:', error);
      setRecentTickets([]);
    } finally {
      setTicketLoading(false);
    }
  };

  useEffect(() => {
    setFormData((current) => ({
      ...current,
      fullName: current.fullName || user?.name || '',
      email: current.email || user?.email || '',
      mobile: current.mobile || (user as any)?.phone || ''
    }));
  }, [user]);

  useEffect(() => {
    const queryReason = String(searchParams.get('reason') || '').trim();
    if (!queryReason) return;
    const normalized = normalizeReason(queryReason);
    if (reasonOptions.has(normalized.toLowerCase())) {
      setFormData((current) => ({ ...current, reason: normalized }));
    }
  }, [searchParams]);

  useEffect(() => {
    loadPage();
    loadTickets();
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleCmsRefresh = (payload: any) => {
      const updatedSlug = String(payload?.slug || payload?.data?.slug || '').trim().toLowerCase();
      if (!updatedSlug || updatedSlug === 'contact') {
        void loadPage();
      }
    };

    socket.on('cms:page_updated', handleCmsRefresh);
    socket.on('cms:pages_updated', handleCmsRefresh);

    return () => {
      socket.off('cms:page_updated', handleCmsRefresh);
      socket.off('cms:pages_updated', handleCmsRefresh);
    };
  }, [socket]);

  const prepared = useMemo(() => prepareStaticPageContent(page?.content || ''), [page?.content]);
  const metaTitle = (page?.seo as any)?.meta_title || (page?.seo as any)?.metaTitle || page?.title || 'Contact Scrolith';
  const metaDescription =
    (page?.seo as any)?.meta_description ||
    (page?.seo as any)?.metaDescription ||
    prepared.lead ||
    'Contact Scrolith directly and track replies inside your account.';
  const metaKeywords = (page?.seo as any)?.meta_keywords || (page?.seo as any)?.metaKeywords || '';

  useEffect(() => {
    document.title = `${metaTitle} | Scrolith`;

    const upsertMeta = (selector: string, attrs: Record<string, string>, content: string) => {
      let node = document.head.querySelector(selector) as HTMLMetaElement | null;
      if (!node) {
        node = document.createElement('meta');
        Object.entries(attrs).forEach(([key, value]) => node!.setAttribute(key, value));
        document.head.appendChild(node);
      }
      node.setAttribute('content', content);
    };

    const canonicalHref = 'https://scrolith.com/contact';
    let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalHref;

    upsertMeta('meta[name="description"]', { name: 'description' }, metaDescription);
    upsertMeta('meta[property="og:title"]', { property: 'og:title' }, metaTitle);
    upsertMeta('meta[property="og:description"]', { property: 'og:description' }, metaDescription);
    upsertMeta('meta[property="og:type"]', { property: 'og:type' }, 'website');
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, metaTitle);
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, metaDescription);
    if (metaKeywords) {
      upsertMeta('meta[name="keywords"]', { name: 'keywords' }, String(metaKeywords));
    }
  }, [metaDescription, metaKeywords, metaTitle]);

  const uploadFiles = async (incoming: File[]) => {
    if (!incoming.length || !user?.id) return;

    setUploading(true);
    try {
      const uploaded: UploadedFile[] = [];
      for (const file of incoming.slice(0, 5)) {
        const next = await FileService.uploadFile(file, inferUploadCategory(file), {
          role: user.role,
          visibility: 'private',
          userId: user.id
        });
        uploaded.push(next);
      }

      setAttachments((current) => {
        const merged = [...current];
        for (const file of uploaded) {
          if (!merged.some((entry) => entry.id === file.id)) {
            merged.push(file);
          }
        }
        return merged.slice(0, 5);
      });
      showNotification('success', 'Attachment uploaded', `${uploaded.length} file${uploaded.length > 1 ? 's' : ''} ready.`);
    } catch (error: any) {
      showNotification('alert', 'Upload failed', error?.message || 'Failed to upload attachment.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.fullName.trim() || !formData.email.trim() || !formData.subject.trim() || !formData.message.trim()) {
      showNotification('info', 'Missing details', 'Please complete the required fields before sending your message.');
      return;
    }

    try {
      setSubmitting(true);
      const ticket = await SupportService.createTicketAuth({
        full_name: formData.fullName.trim(),
        email: formData.email.trim(),
        mobile: formData.mobile.trim(),
        category: formData.reason,
        subject: formData.subject.trim(),
        message: formData.message.trim(),
        attachments: attachments.map((file) => file.url),
        priority: ['Investment', 'Partnership', 'Enterprise Sales', 'Legal & Compliance'].includes(formData.reason)
          ? 'Medium'
          : 'Low'
      });

      setCreatedTicket(ticket);
      setFormData((current) => ({
        ...current,
        subject: '',
        message: '',
        reason: normalizeReason(current.reason)
      }));
      setAttachments([]);
      await loadTickets();
      showNotification('success', 'Message sent', 'Your message has been delivered to the Scrolith team.');
    } catch (error: any) {
      showNotification('alert', 'Send failed', error?.response?.data?.error || error?.message || 'Failed to send message.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((file) => file.id !== id));
  };

  const updatedLabel = page?.updated_at
    ? new Date(page.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="min-h-screen bg-slate-50 pt-24 pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.22),_transparent_42%),linear-gradient(135deg,#0f172a_0%,#111827_48%,#1d4ed8_100%)] px-6 py-10 text-white shadow-sm sm:px-8 lg:px-12">
          <div className="grid gap-8 lg:grid-cols-[1.3fr,0.7fr] lg:items-end">
            <div className="space-y-5">
              <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
                Direct Contact
              </span>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                  {pageLoading ? 'Contact Scrolith' : page.title || 'Contact Scrolith'}
                </h1>
                <p className="max-w-3xl text-base leading-7 text-slate-200 sm:text-lg">{metaDescription}</p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm text-slate-100/90">
                <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-2">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Authenticated, trackable contact workflow
                </span>
                <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-2">
                  <Clock3 className="mr-2 h-4 w-4" />
                  Realtime replies, notifications, and email updates
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">Business</p>
                <p className="mt-2 text-sm text-slate-100">Partnerships, enterprise, media, recruiting, and investor communication.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">Secure attachments</p>
                <p className="mt-2 text-sm text-slate-100">Upload decks, briefs, proposals, and supporting material directly from your device.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">Live workflow</p>
                <p className="mt-2 text-sm text-slate-100">Responses return through your account support center with notification and email delivery.</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1.45fr,0.8fr]">
          <div className="space-y-8">
            {createdTicket ? (
              <section className="rounded-[28px] border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Message delivered
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-slate-900">Your message is now with the Scrolith team.</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Tracking code <span className="font-semibold text-slate-900">{createdTicket.tracking_code}</span>. Future replies will appear in your support center and by email.
                    </p>
                  </div>
                  <Link
                    to="/dashboard?tab=support"
                    className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Open Support Center
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </div>
              </section>
            ) : null}

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="mb-6 flex flex-col gap-2">
                <h2 className="text-2xl font-semibold text-slate-900">Send a message to Scrolith</h2>
                <p className="text-sm leading-6 text-slate-600">
                  Use this form for business, partnership, investment, advertising, press, recruiting, and other direct communication with the Scrolith team.
                </p>
              </div>

              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Full name of sender</span>
                    <input
                      value={formData.fullName}
                      onChange={(event) => setFormData((current) => ({ ...current, fullName: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      placeholder="Your full name"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Email</span>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      placeholder="name@company.com"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Mobile number</span>
                    <input
                      value={formData.mobile}
                      onChange={(event) => setFormData((current) => ({ ...current, mobile: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      placeholder="+63..."
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Reason for message / category</span>
                    <select
                      value={formData.reason}
                      onChange={(event) => setFormData((current) => ({ ...current, reason: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    >
                      {CONTACT_REASON_OPTIONS.map((option) => (
                        <option key={option.label} value={option.label}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs leading-5 text-slate-500">
                      {CONTACT_REASON_OPTIONS.find((option) => option.label === formData.reason)?.description}
                    </p>
                  </label>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Subject</span>
                  <input
                    value={formData.subject}
                    onChange={(event) => setFormData((current) => ({ ...current, subject: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    placeholder="A concise summary of your request"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Detailed message</span>
                  <textarea
                    rows={8}
                    value={formData.message}
                    onChange={(event) => setFormData((current) => ({ ...current, message: event.target.value }))}
                    className="w-full rounded-[24px] border border-slate-200 px-4 py-4 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    placeholder="Provide the context, objective, timeline, and any relevant details the Scrolith team should review."
                  />
                </label>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Attachment (optional)</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                      Add files
                    </button>
                  </div>
                  <div
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      setDragActive(false);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragActive(false);
                      void uploadFiles(Array.from(event.dataTransfer.files || []));
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`cursor-pointer rounded-[24px] border-2 border-dashed px-6 py-8 text-center transition ${
                      dragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        void uploadFiles(Array.from(event.target.files || []));
                        event.currentTarget.value = '';
                      }}
                    />
                    <Upload className="mx-auto h-8 w-8 text-slate-400" />
                    <p className="mt-3 text-sm font-semibold text-slate-700">Drag and drop or click to upload from your device</p>
                    <p className="mt-1 text-xs text-slate-500">Attach proposals, decks, briefs, screenshots, or supporting documents. Up to 5 files.</p>
                    {uploading ? (
                      <div className="mt-4 inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        Uploading attachment...
                      </div>
                    ) : null}
                  </div>

                  {attachments.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {attachments.map((file) => (
                        <div key={file.id} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
                          <FileText className="mr-2 h-3.5 w-3.5 text-slate-400" />
                          <a href={file.url} target="_blank" rel="noreferrer" className="max-w-[220px] truncate hover:text-blue-600">
                            {file.name}
                          </a>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeAttachment(file.id);
                            }}
                            className="ml-2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                  <p>Replies are delivered through your support center, account notifications, and email.</p>
                  <button
                    type="submit"
                    disabled={submitting || uploading}
                    className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending message...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send message
                      </>
                    )}
                  </button>
                </div>
              </form>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">About this contact workflow</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    This content is live CMS-managed and stays editable through the admin pages module.
                  </p>
                </div>
                {updatedLabel ? (
                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Updated {updatedLabel}
                  </div>
                ) : null}
              </div>
              <div className="page-content prose prose-slate mt-6 max-w-none" dangerouslySetInnerHTML={{ __html: prepared.html }} />
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">Recent conversations</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Your latest direct or support conversations with the Scrolith team.</p>
                </div>
                <Link to="/dashboard?tab=support" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                  Open full inbox
                </Link>
              </div>

              {ticketLoading ? (
                <div className="mt-6 flex items-center text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading your conversation history...
                </div>
              ) : recentTickets.length === 0 ? (
                <div className="mt-6 rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-500">
                  No previous messages yet. Your submitted messages will appear here and in your support center.
                </div>
              ) : (
                <div className="mt-6 grid gap-4">
                  {recentTickets.map((ticket) => (
                    <div key={ticket.id} className="rounded-[24px] border border-slate-200 px-5 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-900">{ticket.subject}</h3>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                              {ticket.category}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{ticket.message}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div className="font-semibold text-slate-700">{ticket.status}</div>
                          <div className="mt-1">#{ticket.tracking_code || ticket.id}</div>
                          <div className="mt-1">{new Date(ticket.updated_at).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Scrolith contact desk</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Messages sent here are handled inside the platform and can be routed to the appropriate company mailbox when required.
              </p>
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <Mail className="mt-0.5 h-4 w-4 text-slate-400" />
                  <div>
                    <p className="font-semibold text-slate-900">Business and general contact</p>
                    <p className="text-slate-600">contact@scrolith.com and info@scrolith.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <Building2 className="mt-0.5 h-4 w-4 text-slate-400" />
                  <div>
                    <p className="font-semibold text-slate-900">Investor contact</p>
                    <p className="text-slate-600">investors@scrith.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <Phone className="mt-0.5 h-4 w-4 text-slate-400" />
                  <div>
                    <p className="font-semibold text-slate-900">Support routing</p>
                    <p className="text-slate-600">Operational issues should go through the support desk for faster triage.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                  <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
                  <div>
                    <p className="font-semibold text-slate-900">Location</p>
                    <p className="text-slate-600">Manila, Philippines</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Suggested contact reasons</h2>
              <div className="mt-4 space-y-3">
                {CONTACT_REASON_OPTIONS.slice(0, 6).map((option) => (
                  <div key={option.label} className="rounded-2xl border border-slate-200 px-4 py-3">
                    <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{option.description}</div>
                  </div>
                ))}
              </div>
            </section>

            {prepared.toc.length > 0 ? (
              <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">On this page</h2>
                <div className="mt-4 space-y-2">
                  {prepared.toc.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className={`block rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 ${
                        item.level === 3 ? 'pl-6' : ''
                      }`}
                    >
                      {item.title}
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-[28px] border border-blue-200 bg-blue-50 p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <Briefcase className="mt-0.5 h-5 w-5 text-blue-600" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Looking for roles instead?</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Explore the Scrolith careers page for hiring philosophy, recruiting guidance, and how to introduce yourself to the team.
                  </p>
                  <Link to="/careers" className="mt-4 inline-flex items-center text-sm font-semibold text-blue-700 hover:text-blue-800">
                    Visit careers
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
