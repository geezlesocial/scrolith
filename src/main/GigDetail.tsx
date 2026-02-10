
import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCurrency } from '../context/CurrencyContext';
import { Star, Check, Clock, User, Heart, Share2, Flag, MessageCircle, Info, ChevronRight, Zap, RefreshCw, ArrowRight, ShieldAlert, ChevronDown, CheckCircle, HelpCircle, Sparkles, Loader2, PlayCircle, FileText, Download } from 'lucide-react';
import ProBadge from '../components/ProBadge';
import { useNotification } from '../context/NotificationContext';
import { ContractService } from '../services/contract';
import { useUser } from '../context/UserContext';
import { useFavorites } from '../context/FavoritesContext';
import { AdvisorService } from '../services/ai/advisor.service';
import { PricingAdvice } from '../types';
import api from '../services/api';
import { commerceService } from '../services/commerce';
import { PaymentService } from '../services/payment';
import { MessagingService } from '../services/messaging';
import { walletApi } from '../services/wallet';
import { CMSService } from '../services/cms';
import { useSocket } from '../context/SocketContext';
import { Contract, Message, TimeEntry } from '../types';

const defaultGigExperience = {
  enabled: true,
  chatBarEnabled: true,
  inlineChatEnabled: true,
  shareModalEnabled: true,
  allowGuestOpenChat: true,
  showSellerMeta: true,
  quickPrompts: [
    'Hey, can you help me with this gig?',
    'Can you provide your timeline and budget estimate?',
    'Can you customize this package for my requirements?'
  ]
};

const GigDetail = () => {
  const { id } = useParams();
  const { formatPrice, currency } = useCurrency();
  const { showNotification } = useNotification();
  const { user } = useUser();
  const { toggleFavorite, isFavorite } = useFavorites();
  const navigate = useNavigate();
  const [gig, setGig] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePkg, setActivePkg] = useState(0);
  
  // AI Pricing Assistant
  const [pricingAdvice, setPricingAdvice] = useState<PricingAdvice | null>(null);
  const [analyzingPrice, setAnalyzingPrice] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [gateways, setGateways] = useState<any[]>([]);
  const [selectedGateway, setSelectedGateway] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<string>('');
  const [walletInfo, setWalletInfo] = useState<any | null>(null);
  const [gigExperience, setGigExperience] = useState<any>(defaultGigExperience);
  const [showShareModal, setShowShareModal] = useState(false);
  const [gigChatOpen, setGigChatOpen] = useState(false);
  const [gigChatDraft, setGigChatDraft] = useState('');
  const [gigChatSending, setGigChatSending] = useState(false);
  const [gigChatConversationId, setGigChatConversationId] = useState<string | null>(null);
  const [gigChatMessages, setGigChatMessages] = useState<Message[]>([]);
  const [gigChatLoading, setGigChatLoading] = useState(false);
  const [gigChatError, setGigChatError] = useState<string | null>(null);
  const [gigChatReplyTo, setGigChatReplyTo] = useState<Message | null>(null);
  const [showHourlyRequestModal, setShowHourlyRequestModal] = useState(false);
  const [hourlyRequestDraft, setHourlyRequestDraft] = useState('');
  const [hourlyRateDraft, setHourlyRateDraft] = useState(25);
  const [hourlyPaymentCycle, setHourlyPaymentCycle] = useState<'weekly' | 'bi-weekly' | 'monthly'>('weekly');
  const [hourlySubmitting, setHourlySubmitting] = useState(false);
  const [hourlyContract, setHourlyContract] = useState<Contract | null>(null);
  const [hourlyEntries, setHourlyEntries] = useState<TimeEntry[]>([]);
  const [hourlyContractLoading, setHourlyContractLoading] = useState(false);
  const [hourlyActionLoading, setHourlyActionLoading] = useState<'start' | 'pause' | 'pay' | null>(null);
  const gigChatMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const { socket } = useSocket();

  const normalizeViewerRole = (rawRole?: string) => {
      const normalized = String(rawRole || '').toLowerCase();
      if (!normalized) return 'guest';
      if (normalized.includes('superadmin') || normalized.includes('admin')) return 'admin';
      if (normalized.includes('employer')) return 'employer';
      if (normalized.includes('client') || normalized.includes('buyer')) return 'client';
      if (normalized.includes('freelancer') || normalized.includes('seller')) return 'freelancer';
      return 'user';
  };

  const toContractRole = (rawRole?: string): 'client' | 'freelancer' | 'admin' | null => {
      const viewerRole = normalizeViewerRole(rawRole);
      if (viewerRole === 'admin') return 'admin';
      if (viewerRole === 'freelancer') return 'freelancer';
      if (viewerRole === 'client' || viewerRole === 'employer') return 'client';
      return null;
  };

  const contractNumber = (value: unknown, fallback = 0) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
  };

  const normalizeGigChatMessage = (raw: any): Message => {
      const conversationId = raw?.conversation_id ?? raw?.conversationId ?? '';
      const senderId = raw?.sender_id ?? raw?.senderId ?? '';
      const receiverId = raw?.receiver_id ?? raw?.receiverId ?? '';
      const timestamp = raw?.timestamp ?? raw?.createdAt ?? new Date().toISOString();
      const isRead = Boolean(raw?.is_read ?? raw?.isRead ?? false);
      return {
          ...raw,
          id: raw?.id ?? `${conversationId}-msg-${Date.now()}`,
          conversation_id: conversationId,
          conversationId,
          sender_id: senderId,
          senderId,
          receiver_id: receiverId,
          receiverId,
          text: String(raw?.text ?? ''),
          timestamp,
          is_read: isRead,
          isRead,
          reactions: Array.isArray(raw?.reactions) ? raw.reactions : [],
          attachments: Array.isArray(raw?.attachments) ? raw.attachments : [],
          reply_to_message_id: raw?.reply_to_message_id ?? raw?.replyToMessageId ?? null,
          replyToMessageId: raw?.replyToMessageId ?? raw?.reply_to_message_id ?? null,
          reply_to_snapshot: raw?.reply_to_snapshot ?? raw?.replyToSnapshot ?? null,
          replyToSnapshot: raw?.replyToSnapshot ?? raw?.reply_to_snapshot ?? null,
          reply_to: raw?.reply_to ?? raw?.replyTo ?? null,
          replyTo: raw?.replyTo ?? raw?.reply_to ?? null
      };
  };

  const upsertGigChatMessage = (prev: Message[], incoming: Message): Message[] => {
      const next = [...prev];
      const idx = next.findIndex((entry) => entry.id === incoming.id);
      if (idx >= 0) {
          next[idx] = { ...next[idx], ...incoming };
      } else {
          next.push(incoming);
      }
      next.sort((a, b) => {
          const aTime = new Date(a.timestamp || 0).getTime();
          const bTime = new Date(b.timestamp || 0).getTime();
          return aTime - bTime;
      });
      return next;
  };

  const formatGigChatTime = (timestamp?: string) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getGigChatReplyPreview = (message?: Message | null) => {
      if (!message) return null;
      const preview = (message.replyTo || message.reply_to || message.replyToSnapshot || message.reply_to_snapshot || null) as any;
      if (preview) {
          const senderName = preview.senderName || preview.sender || '';
          const snippet =
              preview.snippet ||
              preview.text ||
              (preview.attachmentPreview?.label ? `[${preview.attachmentPreview.label}]` : '') ||
              '';
          return {
              senderName: String(senderName || ''),
              snippet: String(snippet || ''),
              unavailable: Boolean(preview.unavailable)
          };
      }
      if (message.replyToMessageId || message.reply_to_message_id) {
          return {
              senderName: '',
              snippet: 'Replying to a previous message',
              unavailable: false
          };
      }
      return null;
  };

  const normalizeGig = (raw: any) => {
      if (!raw || typeof raw !== 'object') return null;
      const priceAmount = typeof raw.price === 'number' ? raw.price : raw.price?.amount ?? 0;
      const images = Array.isArray(raw.images) ? raw.images : [];
      const packages = Array.isArray(raw.packages)
          ? raw.packages.map((pkg: any, idx: number) => ({
              name: pkg?.name || `Package ${idx + 1}`,
              description: pkg?.description ?? '',
              deliveryDays: pkg?.deliveryDays ?? pkg?.delivery_days ?? 0,
              revisions: pkg?.revisions ?? 0,
              price: Number(pkg?.price ?? 0),
              features: Array.isArray(pkg?.features) ? pkg.features : []
          }))
          : [];
      const fallbackPackage = {
          name: 'Basic',
          description: 'Standard delivery package',
          deliveryDays: Number(raw?.deliveryDays ?? 5),
          revisions: 1,
          price: Number(priceAmount || 0),
          features: []
      };

      return {
          ...raw,
          priceAmount,
          images,
          packages: packages.length ? packages : [fallbackPackage],
          extras: Array.isArray(raw.extras) ? raw.extras : [],
          faqs: Array.isArray(raw.faqs) ? raw.faqs : [],
          requirements: Array.isArray(raw.requirements) ? raw.requirements : [],
          videos: Array.isArray(raw.videos) ? raw.videos : [],
          documents: Array.isArray(raw.documents) ? raw.documents : [],
          image: raw.image || images[0] || '',
          freelancerName: raw.freelancerName || raw.user?.name || 'Freelancer',
          freelancerAvatar: raw.freelancerAvatar || raw.user?.avatar || '',
          rating: raw.rating ?? raw.performance?.rating ?? 0,
          reviews: raw.reviews ?? raw.performance?.reviews ?? 0
      };
  };

  useEffect(() => {
      let active = true;
      const loadGig = async () => {
          if (!id) return;
          setLoading(true);
          setLoadError(null);
          try {
              const data = await commerceService.getGigById(id);
              const normalized = normalizeGig(data);
              if (active) setGig(normalized);
          } catch (err: any) {
              try {
                  const resp = await api.get(`/gigs/${encodeURIComponent(id)}`);
                  const payload = resp.data?.data ?? resp.data;
                  const normalized = normalizeGig(payload);
                  if (active) setGig(normalized);
              } catch (fallbackErr: any) {
                  if (active) setLoadError(fallbackErr?.message || 'Gig not found.');
              }
          } finally {
              if (active) setLoading(false);
          }
      };
      loadGig();
      return () => {
          active = false;
      };
  }, [id]);

  useEffect(() => {
      setActivePkg(0);
  }, [gig?.id]);

  useEffect(() => {
      if (!gig) return;
      const list = [gig.image, ...(gig.images || [])].filter(Boolean);
      if (!list.length) {
          setActiveImage('');
          return;
      }
      if (!activeImage || !list.includes(activeImage)) {
          setActiveImage(list[0]);
      }
  }, [gig?.id, gig?.image, gig?.images]);

  useEffect(() => {
      let active = true;
      const loadGigExperience = async () => {
          try {
              const settings = await CMSService.getSettings();
              const raw = (settings as any)?.gigExperience || {};
              if (!active) return;
              setGigExperience({
                  ...defaultGigExperience,
                  ...raw,
                  quickPrompts: Array.isArray(raw?.quickPrompts) && raw.quickPrompts.length
                      ? raw.quickPrompts.filter((p: any) => typeof p === 'string' && p.trim() !== '').slice(0, 6)
                      : defaultGigExperience.quickPrompts
              });
          } catch {
              if (active) setGigExperience(defaultGigExperience);
          }
      };
      loadGigExperience();
      return () => {
          active = false;
      };
  }, []);

  useEffect(() => {
      setGigChatConversationId(null);
      setGigChatDraft('');
      setGigChatOpen(false);
      setGigChatMessages([]);
      setGigChatError(null);
      setGigChatReplyTo(null);
  }, [gig?.id]);

  useEffect(() => {
      let active = true;
      const loadGigChatConversation = async () => {
          if (!gigChatOpen || !user) return;
          setGigChatLoading(true);
          setGigChatError(null);
          try {
              const conversationId = await ensureGigConversation();
              if (!active) return;
              const conversation = await MessagingService.getConversationById(conversationId);
              if (!active) return;
              const messages = Array.isArray(conversation?.messages)
                  ? conversation!.messages.map((entry: Message) => normalizeGigChatMessage(entry))
                  : [];
              setGigChatMessages(messages);
              await MessagingService.markAsRead(conversationId, user.id).catch(() => null);
          } catch (error: any) {
              if (!active) return;
              setGigChatError(error?.message || 'Unable to load conversation.');
          } finally {
              if (active) setGigChatLoading(false);
          }
      };
      void loadGigChatConversation();
      return () => {
          active = false;
      };
  }, [gigChatOpen, user?.id, gig?.id]);

  useEffect(() => {
      if (!gigChatOpen) return;
      gigChatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [gigChatMessages, gigChatOpen]);

  useEffect(() => {
      if (!socket || !gigChatOpen || !gigChatConversationId) return;

      const handleIncoming = (payload: any) => {
          const message = normalizeGigChatMessage(payload);
          const payloadConversationId = message.conversationId || message.conversation_id;
          if (!payloadConversationId || payloadConversationId !== gigChatConversationId) return;
          setGigChatMessages((prev) => upsertGigChatMessage(prev, message));

          const senderId = message.senderId || message.sender_id;
          if (user?.id && senderId && senderId !== user.id) {
              void MessagingService.markAsRead(gigChatConversationId, user.id).catch(() => null);
          }
      };

      const handleMessageUpdated = (payload: any) => {
          const payloadConversationId = payload?.conversationId || payload?.conversation_id;
          const messageId = payload?.messageId || payload?.id;
          if (!payloadConversationId || payloadConversationId !== gigChatConversationId || !messageId) return;
          setGigChatMessages((prev) =>
              prev.map((entry) =>
                  entry.id === messageId
                      ? {
                            ...entry,
                            text: payload?.text ?? entry.text,
                            timestamp: payload?.timestamp ?? entry.timestamp,
                            editedAt: payload?.editedAt ?? payload?.edited_at ?? entry.editedAt ?? entry.edited_at ?? null,
                            edited_at: payload?.edited_at ?? payload?.editedAt ?? entry.edited_at ?? entry.editedAt ?? null,
                            isDeleted: Boolean(payload?.isDeleted ?? payload?.is_deleted ?? entry.isDeleted ?? entry.is_deleted),
                            is_deleted: Boolean(payload?.is_deleted ?? payload?.isDeleted ?? entry.is_deleted ?? entry.isDeleted),
                            deletedAt: payload?.deletedAt ?? payload?.deleted_at ?? entry.deletedAt ?? entry.deleted_at ?? null,
                            deleted_at: payload?.deleted_at ?? payload?.deletedAt ?? entry.deleted_at ?? entry.deletedAt ?? null,
                            attachments: Array.isArray(payload?.attachments) ? payload.attachments : entry.attachments,
                            reactions: Array.isArray(payload?.reactions) ? payload.reactions : entry.reactions
                        }
                      : entry
              )
          );
      };

      socket.on('messages:new', handleIncoming);
      socket.on('messages:sent', handleIncoming);
      socket.on('messages:updated', handleMessageUpdated);
      return () => {
          socket.off('messages:new', handleIncoming);
          socket.off('messages:sent', handleIncoming);
          socket.off('messages:updated', handleMessageUpdated);
      };
  }, [socket, gigChatOpen, gigChatConversationId, user?.id]);

  const handlePriceAnalysis = async () => {
      setAnalyzingPrice(true);
      try {
          if (!gig) return;
          const pkg = Array.isArray(gig.packages) ? gig.packages[activePkg] : null;
          const advice = await AdvisorService.getPricingAdvice(gig.category, pkg?.description || '');
          setPricingAdvice(advice);
      } finally {
          setAnalyzingPrice(false);
      }
  };

  // --- Mock Data for UI Expansion ---
  const priceAmount = gig?.priceAmount ?? 0;
  const description = gig?.description || '';
  const descriptionIsHtml = /<[^>]+>/.test(description);
  const galleryImages = [gig?.image, ...(gig?.images || [])]
      .filter(Boolean)
      .filter((src, index, arr) => arr.indexOf(src) === index);
  const milestones = [
      { title: "Initial Concept", duration: "1 Day", price: priceAmount * 0.3 },
      { title: "Design Draft", duration: "2 Days", price: priceAmount * 0.4 },
      { title: "Final Polish", duration: "1 Day", price: priceAmount * 0.3 },
  ];

  const faqs = Array.isArray(gig?.faqs) ? gig!.faqs : [];

  // --- Utility Actions ---
  const handleSave = async () => {
      if (!gig) return;
      try {
          const already = isFavorite('gig', gig.id);
          await toggleFavorite('gig', gig.id);
          showNotification('success', already ? 'Removed' : 'Saved', already ? 'Gig removed from your favorites.' : 'Gig added to your favorites.');
      } catch (error: any) {
          showNotification('error', 'Favorites', error?.message || 'Unable to update favorites.');
      }
  };
  const handleShare = async () => {
      if (gigExperience?.shareModalEnabled !== false) {
          setShowShareModal(true);
          return;
      }
      await navigator.clipboard.writeText(window.location.href);
      showNotification('success', 'Copied', 'Link copied to clipboard.');
  };
  const handleReport = () => showNotification('info', 'Reported', 'Thank you. We will review this gig.');

  const ensureGigConversation = async (): Promise<string> => {
      if (!user) {
          throw new Error('Please login to continue.');
      }
      const freelancerId = gig?.freelancerId || gig?.user?.id;
      if (!freelancerId) {
          throw new Error('Unable to locate the seller for this gig.');
      }
      if (freelancerId === user.id) {
          throw new Error('You cannot message yourself.');
      }
      if (gigChatConversationId) return gigChatConversationId;
      const convoId = await MessagingService.createConversation([
          { id: user.id },
          { id: freelancerId }
      ] as any);
      setGigChatConversationId(convoId);
      return convoId;
  };

  const handleContact = async () => {
      const freelancerId = gig?.freelancerId || gig?.user?.id;
      if (user?.id && freelancerId && user.id === freelancerId) {
          showNotification('info', 'Unavailable', 'You cannot open buyer chat on your own gig.');
          return;
      }
      if (gigExperience?.inlineChatEnabled !== false) {
          if (!user && gigExperience?.allowGuestOpenChat === false) {
              navigate('/auth/login');
              return;
          }
          setGigChatOpen(true);
          return;
      }
      if (!user) {
          navigate('/auth/login');
          return;
      }
      try {
          const convoId = await ensureGigConversation();
          navigate(`/messages/${convoId}`);
      } catch (error: any) {
          showNotification('error', 'Message failed', error?.message || 'Unable to start conversation.');
      }
  };

  const handleQuickPrompt = (value: string) => {
      setGigChatDraft((prev) => {
          if (!prev.trim()) return value;
          return `${prev.trim()} ${value}`;
      });
  };

  const handleSendGigChat = async () => {
      const nextText = gigChatDraft.trim();
      if (!nextText) return;
      if (!user) {
          navigate('/auth/login');
          return;
      }
      setGigChatSending(true);
      try {
          const conversationId = await ensureGigConversation();
          const sent = await MessagingService.sendMessage(
              conversationId,
              user.id,
              nextText,
              String(user.role || 'freelancer').toLowerCase(),
              [],
              gigChatReplyTo?.id || null
          );
          setGigChatMessages((prev) => upsertGigChatMessage(prev, normalizeGigChatMessage(sent)));
          setGigChatDraft('');
          setGigChatReplyTo(null);
          showNotification('success', 'Message sent', 'Your message was sent to the freelancer.');
      } catch (error: any) {
          showNotification('error', 'Message failed', error?.message || 'Unable to send your message.');
      } finally {
          setGigChatSending(false);
      }
  };

  const handleOpenFullInbox = async () => {
      if (!user) {
          navigate('/auth/login');
          return;
      }
      try {
          const conversationId = await ensureGigConversation();
          navigate(`/messages/${conversationId}`);
      } catch (error: any) {
          showNotification('error', 'Message failed', error?.message || 'Unable to open inbox.');
      }
  };

  const handleShareTo = async (type: 'facebook' | 'linkedin' | 'twitter' | 'whatsapp' | 'copy') => {
      const shareUrl = window.location.href;
      const title = gig?.title || 'Check this gig';
      if (type === 'copy') {
          await navigator.clipboard.writeText(shareUrl);
          showNotification('success', 'Copied', 'Gig link copied to clipboard.');
          setShowShareModal(false);
          return;
      }
      const encodedUrl = encodeURIComponent(shareUrl);
      const encodedTitle = encodeURIComponent(title);
      const map = {
          facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
          linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
          twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
          whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`
      };
      window.open(map[type], '_blank', 'noopener,noreferrer,width=680,height=520');
      setShowShareModal(false);
  };

  const loadGateways = async () => {
      setCheckoutLoading(true);
      setCheckoutError(null);
      try {
          const [list, wallet] = await Promise.all([
              PaymentService.getActivePaymentMethods(),
              walletApi.getWalletInfo().catch(() => null)
          ]);
          setWalletInfo(wallet || null);
          const currencyCode = (currency.code || wallet?.currency || 'USD').toUpperCase();
          const walletGateway = wallet
              ? {
                    id: 'wallet',
                    name: 'Wallet Balance',
                    mode: 'wallet',
                    logo: null,
                    supported_currencies: wallet?.currency ? [wallet.currency] : [],
                    is_enabled: true,
                    balance: Number(wallet?.availableBalance ?? wallet?.available_balance ?? 0)
                }
              : null;
          const listWithWallet = walletGateway ? [walletGateway, ...list] : list;
          const requiredAmount = Number(currentPackage?.price ?? priceAmount);
          const walletBalance = Number(wallet?.availableBalance ?? wallet?.available_balance ?? 0);
          const walletCurrency = (wallet?.currency || currencyCode).toUpperCase();
          const compatible = listWithWallet.filter((gw: any) => {
              if (gw.id === 'wallet') {
                  return walletBalance >= requiredAmount && walletCurrency === currencyCode;
              }
              const supported = Array.isArray(gw.supported_currencies || gw.supportedCurrencies)
                  ? (gw.supported_currencies || gw.supportedCurrencies)
                  : [];
              if (!supported.length) return true;
              return supported.map((c: string) => c.toUpperCase()).includes(currencyCode);
          });
          setGateways(listWithWallet);
          const current = selectedGateway;
          const stillExists = current && listWithWallet.some((gw: any) => gw.id === current);
          if ((!current || !stillExists) && listWithWallet.length) {
              const pick = compatible.length ? compatible[0] : listWithWallet[0];
              if (pick?.id) setSelectedGateway(pick.id);
          }
      } catch (error: any) {
          setCheckoutError(error?.message || 'Failed to load payment gateways.');
      } finally {
          setCheckoutLoading(false);
      }
  };

  const handleContinue = async () => {
      if (!user) {
          navigate('/auth/login');
          return;
      }
      setShowCheckout(true);
      await loadGateways();
  };

  const handleStartPayment = async () => {
      if (!gig) return;
      if (!selectedGateway) {
          setCheckoutError('Please select a payment method.');
          return;
      }
      if (selectedGateway === 'wallet') {
          const requiredAmount = Number(currentPackage?.price ?? priceAmount);
          const walletBalance = Number(walletInfo?.availableBalance ?? walletInfo?.available_balance ?? 0);
          const currencyCode = (currency.code || walletInfo?.currency || 'USD').toUpperCase();
          const walletCurrency = (walletInfo?.currency || currencyCode).toUpperCase();
          if (walletCurrency !== currencyCode) {
              setCheckoutError(`Wallet currency ${walletCurrency} does not match ${currencyCode}.`);
              return;
          }
          if (walletBalance < requiredAmount) {
              setCheckoutError('Insufficient wallet balance.');
              return;
          }
      }
      setCheckoutLoading(true);
      setCheckoutError(null);
      try {
          const result = await commerceService.purchaseGig(gig.id, {
              provider: selectedGateway,
              packageIndex: activePkg,
              currency: currency.code
          });
          const redirectUrl = result?.redirect_url || result?.redirectUrl;
          if (redirectUrl) {
              window.location.href = redirectUrl;
              return;
          }
          showNotification('success', 'Order created', 'Your order was created. Check your dashboard for updates.');
          setShowCheckout(false);
      } catch (error: any) {
          setCheckoutError(error?.message || 'Unable to start payment.');
      } finally {
          setCheckoutLoading(false);
      }
  };

  const handleHourlyRequest = async () => {
      const viewerRole = normalizeViewerRole(user?.role);
      if (!user) {
          navigate('/auth/login');
          return;
      }
      if (viewerRole === 'freelancer') {
          showNotification('info', 'Seller view', 'Switch to a buyer/client role to request hourly work.');
          return;
      }
      setShowHourlyRequestModal(true);
  };

  const refreshHourlyContract = async (contractId: string) => {
      const [contractPayload, entriesPayload] = await Promise.all([
          ContractService.getContractById(contractId),
          ContractService.getTimeEntries(contractId).catch(() => [])
      ]);
      setHourlyContract(contractPayload);
      setHourlyEntries(Array.isArray(entriesPayload) ? entriesPayload : []);
  };

  const findExistingHourlyContract = async (): Promise<Contract | null> => {
      if (!user?.id || !gig?.id) return null;
      const role = toContractRole(user.role);
      if (!role) return null;

      const contracts = await ContractService.getContracts(user.id, role);
      if (!Array.isArray(contracts) || !contracts.length) return null;

      const sellerId = gig?.freelancerId || gig?.user?.id;
      const tag = `[gig:${gig.id}]`;
      const gigTitle = String(gig.title || '').toLowerCase();

      const sorted = [...contracts].sort((a, b) => {
          const aDate = new Date((a as any).updatedAt || (a as any).startDate || (a as any).start_date || 0).getTime();
          const bDate = new Date((b as any).updatedAt || (b as any).startDate || (b as any).start_date || 0).getTime();
          return bDate - aDate;
      });

      return (
          sorted.find((entry) => {
              const freelancerId = (entry as any).freelancerId || (entry as any).freelancer_id;
              const description = String((entry as any).description || '').toLowerCase();
              const title = String((entry as any).title || '').toLowerCase();
              const type = String((entry as any).type || '').toLowerCase();
              if (type !== 'hourly') return false;
              if (sellerId && freelancerId && sellerId !== freelancerId) return false;
              return description.includes(tag.toLowerCase()) || (gigTitle && title.includes(gigTitle));
          }) || null
      );
  };

  const handleSubmitHourlyRequest = async () => {
      const sellerId = gig?.freelancerId || gig?.user?.id;
      if (!user) {
          navigate('/auth/login');
          return;
      }
      if (!sellerId) {
          showNotification('error', 'Unavailable', 'Unable to locate this seller right now.');
          return;
      }
      const viewerRole = normalizeViewerRole(user.role);
      if (!(viewerRole === 'client' || viewerRole === 'employer' || viewerRole === 'admin')) {
          showNotification('alert', 'Not allowed', 'Only clients/employers can request hourly hiring.');
          return;
      }
      if (sellerId === user.id) {
          showNotification('info', 'Unavailable', 'You cannot create an hourly contract with yourself.');
          return;
      }

      const requestedRate = contractNumber(hourlyRateDraft, 0);
      if (requestedRate <= 0) {
          showNotification('alert', 'Invalid rate', 'Please enter a valid hourly rate.');
          return;
      }

      setHourlySubmitting(true);
      try {
          const existing = await findExistingHourlyContract();
          if (existing?.id) {
              await refreshHourlyContract(existing.id);
              setShowHourlyRequestModal(false);
              setGigChatOpen(true);
              showNotification('info', 'Existing contract', 'An hourly contract already exists for this gig.');
              return;
          }

          const brief = hourlyRequestDraft.trim() || `Hourly engagement request for ${gig.title}`;
          const contractTitle = `Hourly engagement - ${gig.title}`;
          const contractDescription = `${brief}\n\n[gig:${gig.id}]`;
          const created = await ContractService.createContract({
              title: contractTitle,
              clientId: user.id,
              clientName: user.name || 'Client',
              freelancerId: sellerId,
              freelancerName: gig.freelancerName || 'Freelancer',
              type: 'hourly',
              hourlyRate: requestedRate,
              paymentCycle: hourlyPaymentCycle,
              status: 'active',
              startDate: new Date().toISOString(),
              description: contractDescription
          } as Partial<Contract>);

          setHourlyContract(created);
          setHourlyEntries([]);
          setShowHourlyRequestModal(false);

          const roleLabel = String(user.role || 'client').toLowerCase();
          try {
              const conversationId = await ensureGigConversation();
              const contractMessage = [
                  `[Hourly Request]`,
                  `${user.name || 'Client'} requested an hourly engagement for "${gig.title}".`,
                  `Rate: ${formatPrice(requestedRate)}/hr`,
                  `Cycle: ${hourlyPaymentCycle}`,
                  `Contract ID: ${(created as any)?.id || ''}`
              ].join('\n');
              const sent = await MessagingService.sendMessage(
                  conversationId,
                  user.id,
                  contractMessage,
                  roleLabel,
                  [],
                  null
              );
              setGigChatMessages((prev) => upsertGigChatMessage(prev, normalizeGigChatMessage(sent)));
          } catch (messageError) {
              console.warn('Failed to send hourly contract intro message', messageError);
          }

          setGigChatOpen(true);
          showNotification('success', 'Hourly request created', 'The freelancer can now respond and start tracked work.');
      } catch (error: any) {
          showNotification('error', 'Hourly request failed', error?.message || 'Unable to create hourly request.');
      } finally {
          setHourlySubmitting(false);
      }
  };

  const handleHourlyTrackingToggle = async () => {
      if (!hourlyContract?.id) return;
      const activeSessionId = (hourlyContract as any).activeSessionId || (hourlyContract as any).active_session_id;
      const shouldStop = Boolean(activeSessionId);
      setHourlyActionLoading(shouldStop ? 'pause' : 'start');
      try {
          if (shouldStop) {
              await ContractService.stopTracking(hourlyContract.id, 'Paused from gig detail');
              showNotification('success', 'Tracker paused', 'Current work session has been logged.');
          } else {
              await ContractService.startTracking(hourlyContract.id);
              showNotification('success', 'Tracker started', 'Time tracking is now active.');
          }
          await refreshHourlyContract(hourlyContract.id);
      } catch (error: any) {
          showNotification('error', 'Tracking failed', error?.message || 'Unable to update tracker state.');
      } finally {
          setHourlyActionLoading(null);
      }
  };

  const handlePayHourlyDue = async () => {
      if (!hourlyContract?.id) return;
      setHourlyActionLoading('pay');
      try {
          const amount = await ContractService.payContractDue(hourlyContract.id);
          await refreshHourlyContract(hourlyContract.id);
          showNotification('success', 'Payment sent', `Paid ${formatPrice(amount)} to the freelancer.`);
      } catch (error: any) {
          showNotification('error', 'Payment failed', error?.message || 'Unable to pay due amount right now.');
      } finally {
          setHourlyActionLoading(null);
      }
  };

  const currentPackage = gig?.packages ? gig.packages[activePkg] : null;
  const gigHeadings = (gig?.meta as any)?.headings || {};
  const overviewHeading = gigHeadings?.overviewHeading || 'About This Gig';
  const pricingHeading = gigHeadings?.pricingHeading || 'Standard License';
  const requirementsHeading = gigHeadings?.requirementsHeading || 'Requirements';
  const galleryHeading = gigHeadings?.galleryHeading || 'Gig Gallery';
  const cardSubtitle = gigHeadings?.cardSubtitle || '';
  const sellerResponseTime = gig?.avgResponseTime || gig?.meta?.avgResponseTime || '1 Hour';
  const sellerStatus = gig?.sellerStatus || gig?.meta?.sellerStatus || 'Away';
  const suggestedHourlyRate = contractNumber((gig?.meta as any)?.hourlyRate ?? (gig?.meta as any)?.hourly_rate, 0)
      || Math.max(10, Math.round(contractNumber(currentPackage?.price ?? priceAmount, 75) / 3))
      || 25;
  const quickPrompts = Array.isArray(gigExperience?.quickPrompts) ? gigExperience.quickPrompts : [];
  const sellerId = gig?.freelancerId || gig?.user?.id;
  const isOwnGig = Boolean(user?.id && sellerId && user.id === sellerId);
  const showGigChatBar = gigExperience?.enabled !== false && gigExperience?.chatBarEnabled !== false && !isOwnGig;
  const showSellerMeta = gigExperience?.showSellerMeta !== false;
  const contractStatus = String((hourlyContract as any)?.status || '').toLowerCase();
  const contractHours = contractNumber((hourlyContract as any)?.totalHoursLogged ?? (hourlyContract as any)?.total_hours_logged, 0);
  const contractPending = contractNumber((hourlyContract as any)?.earningsPending ?? (hourlyContract as any)?.earnings_pending, 0);
  const contractRate = contractNumber((hourlyContract as any)?.hourlyRate ?? (hourlyContract as any)?.hourly_rate, suggestedHourlyRate);
  const contractActiveSessionId = (hourlyContract as any)?.activeSessionId || (hourlyContract as any)?.active_session_id;
  const hourlyTrackedSeconds = hourlyEntries.reduce((sum, entry) => {
      const minutes = contractNumber((entry as any)?.durationMinutes ?? (entry as any)?.duration_minutes, 0);
      return sum + minutes * 60;
  }, 0);
  const hourlyTrackedHours = hourlyTrackedSeconds / 3600;
  const viewerRole = normalizeViewerRole(user?.role);
  const canStartOrPauseTracking = Boolean(hourlyContract?.id && user?.id && ((hourlyContract as any)?.freelancerId || (hourlyContract as any)?.freelancer_id) === user.id && contractStatus === 'active');
  const canPayDue = Boolean(hourlyContract?.id && user?.id && ((hourlyContract as any)?.clientId || (hourlyContract as any)?.client_id) === user.id && contractPending > 0);

  useEffect(() => {
      if (!gig?.id) return;
      setHourlyRateDraft((prev) => (prev > 0 ? prev : suggestedHourlyRate));
      setHourlyRequestDraft((prev) =>
          prev.trim()
              ? prev
              : `Hi ${gig.freelancerName || 'there'}, I'd like to hire you hourly for "${gig.title}".`
      );
  }, [gig?.id, suggestedHourlyRate, gig?.freelancerName, gig?.title]);

  useEffect(() => {
      let cancelled = false;
      let timer: number | null = null;

      const hydrate = async () => {
          if (!user?.id || !gig?.id) {
              if (!cancelled) {
                  setHourlyContract(null);
                  setHourlyEntries([]);
              }
              return;
          }

          const role = toContractRole(user.role);
          if (!role) return;

          setHourlyContractLoading(true);
          try {
              const existing = await findExistingHourlyContract();
              if (cancelled) return;
              if (!existing?.id) {
                  setHourlyContract(null);
                  setHourlyEntries([]);
                  return;
              }
              await refreshHourlyContract(existing.id);
          } catch (error) {
              if (!cancelled) {
                  console.warn('Failed to refresh hourly contract for gig detail', error);
              }
          } finally {
              if (!cancelled) setHourlyContractLoading(false);
          }
      };

      void hydrate();
      timer = window.setInterval(() => {
          void hydrate();
      }, 15000);

      return () => {
          cancelled = true;
          if (timer) window.clearInterval(timer);
      };
  }, [user?.id, user?.role, gig?.id, gig?.title, gig?.freelancerId]);

  if (loading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mr-2" />
              <span className="text-gray-500">Loading gig...</span>
          </div>
      );
  }

  if (loadError || !gig) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="text-center">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Gig not available</h2>
                  <p className="text-gray-500">{loadError || 'This gig is not available right now.'}</p>
              </div>
          </div>
      );
  }

  return (
    <>
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
                   {cardSubtitle ? (
                       <p className="text-sm text-gray-500 -mt-2 mb-4">{cardSubtitle}</p>
                   ) : null}
                   <div className="flex flex-wrap items-center gap-4 text-sm">
                        <div className="flex items-center">
                            <img src={gig.freelancerAvatar} className="w-8 h-8 rounded-full mr-2 object-cover border border-gray-200" alt=""/>
                            <span className="font-bold text-gray-900 mr-1 hover:underline cursor-pointer">{gig.freelancerName}</span>
                            <ProBadge role="freelancer" isPro={(gig as any)?.freelancerIsPro} />
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
                   <h3 className="text-xl font-bold text-gray-900">{galleryHeading}</h3>
                   <div className="rounded-2xl overflow-hidden shadow-sm border border-gray-200 bg-white">
                       <div className="aspect-video bg-gray-100 relative">
                            <img src={activeImage || gig.image} className="w-full h-full object-cover" alt={gig.title} />
                       </div>
                       {/* Thumbnails Placeholder */}
                       <div className="p-2 flex gap-2 overflow-x-auto">
                           {galleryImages.slice(0, 6).map((src, i) => (
                               <button
                                   key={i}
                                   type="button"
                                   onClick={() => setActiveImage(src)}
                                   className={`w-20 h-20 rounded-lg overflow-hidden border-2 cursor-pointer ${src === (activeImage || gig.image) ? 'border-blue-600' : 'border-transparent opacity-70 hover:opacity-100'}`}
                               >
                                   <img src={src} className="w-full h-full object-cover" />
                               </button>
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
                   <h3 className="text-xl font-bold text-gray-900 mb-6">{overviewHeading}</h3>
                   <div className="prose max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
                       {description ? (
                           descriptionIsHtml ? (
                               <div dangerouslySetInnerHTML={{ __html: description }} />
                           ) : (
                               <div>{description}</div>
                           )
                       ) : (
                           "This freelancer has not provided a detailed description. Please contact them for more info."
                       )}
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

               {/* Requirements */}
               {Array.isArray(gig.requirements) && gig.requirements.length > 0 && (
                   <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                       <h3 className="text-xl font-bold text-gray-900 mb-6">{requirementsHeading}</h3>
                       <div className="space-y-4">
                           {gig.requirements.map((req: any, i: number) => (
                               <div key={i} className="border border-gray-100 rounded-xl p-4">
                                   <div className="flex items-start justify-between">
                                       <div>
                                           <p className="font-semibold text-gray-900">{req.question || `Requirement ${i + 1}`}</p>
                                           <p className="text-xs text-gray-500 mt-1">
                                               {req.type === 'file' ? 'File upload' : 'Text response'} • {req.required ? 'Required' : 'Optional'}
                                           </p>
                                       </div>
                                       {req.type === 'file' && (
                                           <span className="text-xs text-indigo-600 font-semibold">File</span>
                                       )}
                                   </div>
                                   {req.type === 'file' && (
                                       <div className="mt-3 text-xs text-gray-500">
                                           <span className="font-semibold text-gray-600">Accepted:</span>{' '}
                                           {(Array.isArray(req.fileTypes) ? req.fileTypes : []).join(', ') || 'Any'}
                                           {req.maxFiles ? ` • Max files: ${req.maxFiles}` : ''}
                                       </div>
                                   )}
                               </div>
                           ))}
                       </div>
                   </div>
               )}

               {/* Extras */}
               {Array.isArray(gig.extras) && gig.extras.length > 0 && (
                   <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
                       <h3 className="text-xl font-bold text-gray-900 mb-6">Gig Extras</h3>
                       <div className="space-y-4">
                           {gig.extras.map((extra: any, i: number) => (
                               <div key={i} className="border border-gray-100 rounded-xl p-4 flex items-start justify-between">
                                   <div>
                                       <p className="font-semibold text-gray-900">{extra.title || `Extra ${i + 1}`}</p>
                                       <p className="text-sm text-gray-500 mt-1">{extra.description || ''}</p>
                                       <p className="text-xs text-gray-400 mt-2">
                                           Applies to: {extra.applies_to || extra.appliesTo || 'all'}
                                           {extra.additional_days || extra.additionalDays ? ` • +${extra.additional_days ?? extra.additionalDays} day(s)` : ''}
                                       </p>
                                   </div>
                                   <div className="text-sm font-bold text-gray-900">
                                       {formatPrice(Number(extra.price || 0))}
                                   </div>
                               </div>
                           ))}
                       </div>
                   </div>
               )}

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
                           <div className="flex items-center gap-2 mb-1">
                               <h4 className="text-lg font-bold text-gray-900">{gig.freelancerName}</h4>
                               <ProBadge role="freelancer" isPro={(gig as any)?.freelancerIsPro} size="md" />
                           </div>
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
                                   <span className="font-bold text-gray-900">{sellerResponseTime}</span>
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
                   {faqs.length === 0 ? (
                       <p className="text-sm text-gray-500">No FAQs provided yet.</p>
                   ) : (
                       <div className="space-y-4">
                           {faqs.map((faq: any, i: number) => (
                               <div key={i} className="group">
                                   <h4 className="font-bold text-gray-900 cursor-pointer flex justify-between items-center">
                                       {faq.question || faq.q || `Question ${i + 1}`}
                                       <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-transform" />
                                   </h4>
                                   <p className="text-gray-600 mt-2 text-sm">{faq.answer || faq.a || ''}</p>
                                   {i < faqs.length - 1 && <div className="border-b border-gray-100 mt-4"></div>}
                               </div>
                           ))}
                       </div>
                   )}
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
                               <span className="font-bold text-lg text-gray-900">{pricingHeading}</span>
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

                           <button onClick={handleContinue} className="w-full bg-gray-900 text-white py-3.5 rounded-xl font-bold hover:bg-gray-800 transition flex items-center justify-center shadow-lg transform hover:-translate-y-0.5">
                               Continue ({formatPrice(currentPackage.price)}) <ArrowRight className="w-4 h-4 ml-2" />
                           </button>
                           <button onClick={handleContact} className="w-full mt-3 text-gray-600 font-medium py-2 hover:text-gray-900 transition text-sm">
                               Contact Seller
                           </button>
                           <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                               <ShieldAlert className="w-4 h-4 mt-0.5" />
                               <span>All payments must be made on the platform. Do not pay sellers outside Scrolith.</span>
                           </div>
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
                       
                       <button
                           onClick={handleHourlyRequest}
                           className="w-full bg-white text-indigo-700 font-bold py-3 rounded-lg hover:bg-indigo-50 transition shadow-lg flex items-center justify-center"
                       >
                           {isOwnGig ? 'Manage Hourly Contracts' : 'Request Hourly Offer'} <ChevronRight className="w-4 h-4 ml-1" />
                       </button>
                       {hourlyContractLoading ? (
                           <div className="mt-3 rounded-xl border border-white/20 bg-black/25 px-3 py-2 text-xs text-indigo-50">
                               <span className="inline-flex items-center gap-1">
                                   <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                   Syncing hourly contract...
                               </span>
                           </div>
                       ) : hourlyContract?.id ? (
                           <div className="mt-3 rounded-xl border border-white/20 bg-black/25 p-3 text-xs text-indigo-50">
                               <div className="flex items-center justify-between">
                                   <span className="font-semibold">Active hourly contract</span>
                                   <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] uppercase tracking-wide">
                                       {contractStatus || 'active'}
                                   </span>
                               </div>
                               <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                                   <div>
                                       <p className="text-indigo-200">Rate</p>
                                       <p className="font-semibold">{formatPrice(contractRate)}/hr</p>
                                   </div>
                                   <div>
                                       <p className="text-indigo-200">Hours</p>
                                       <p className="font-semibold">{hourlyTrackedHours.toFixed(2)}h</p>
                                   </div>
                                   <div>
                                       <p className="text-indigo-200">Total logged</p>
                                       <p className="font-semibold">{contractHours.toFixed(2)}h</p>
                                   </div>
                                   <div>
                                       <p className="text-indigo-200">Pending due</p>
                                       <p className="font-semibold">{formatPrice(contractPending)}</p>
                                   </div>
                               </div>
                               <div className="mt-3 flex flex-wrap gap-2">
                                   {canStartOrPauseTracking ? (
                                       <button
                                           type="button"
                                           onClick={handleHourlyTrackingToggle}
                                           disabled={hourlyActionLoading === 'start' || hourlyActionLoading === 'pause'}
                                           className="rounded-lg bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-white disabled:opacity-60"
                                       >
                                           {hourlyActionLoading === 'start' || hourlyActionLoading === 'pause'
                                               ? 'Saving...'
                                               : contractActiveSessionId
                                                   ? 'Pause tracker'
                                                   : 'Start tracker'}
                                       </button>
                                   ) : null}
                                   {canPayDue ? (
                                       <button
                                           type="button"
                                           onClick={handlePayHourlyDue}
                                           disabled={hourlyActionLoading === 'pay'}
                                           className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                                       >
                                           {hourlyActionLoading === 'pay' ? 'Paying...' : `Pay ${formatPrice(contractPending)}`}
                                       </button>
                                   ) : null}
                                   <button
                                       type="button"
                                       onClick={() => navigate(`/dashboard?tab=contracts&contract_id=${hourlyContract.id}`)}
                                       className="rounded-lg border border-white/30 px-3 py-1.5 text-[11px] font-semibold text-indigo-50 hover:bg-white/10"
                                   >
                                       Open contract
                                   </button>
                               </div>
                           </div>
                       ) : null}
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

    {showShareModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4">
            <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-2xl font-bold text-gray-900">Share This Gig</h3>
                        <p className="text-sm text-gray-500">Spread the word about this gig.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowShareModal(false)}
                        className="rounded-full p-2 text-gray-400 hover:bg-gray-100"
                    >
                        x
                    </button>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <button
                        type="button"
                        onClick={() => handleShareTo('facebook')}
                        className="rounded-xl border border-gray-200 px-3 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        Facebook
                    </button>
                    <button
                        type="button"
                        onClick={() => handleShareTo('linkedin')}
                        className="rounded-xl border border-gray-200 px-3 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        LinkedIn
                    </button>
                    <button
                        type="button"
                        onClick={() => handleShareTo('twitter')}
                        className="rounded-xl border border-gray-200 px-3 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        Twitter
                    </button>
                    <button
                        type="button"
                        onClick={() => handleShareTo('whatsapp')}
                        className="rounded-xl border border-gray-200 px-3 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                        WhatsApp
                    </button>
                    <button
                        type="button"
                        onClick={async () => {
                            await handleShareTo('copy');
                            setShowShareModal(false);
                        }}
                        className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-4 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                    >
                        Copy Link
                    </button>
                </div>
            </div>
        </div>
    )}

    {showHourlyRequestModal && (
        <div className="fixed inset-0 z-[72] flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">Request Hourly Offer</h3>
                        <p className="text-sm text-gray-500">
                            Create a tracked hourly contract and message the freelancer instantly.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowHourlyRequestModal(false)}
                        className="rounded-full p-2 text-gray-400 hover:bg-gray-100"
                    >
                        x
                    </button>
                </div>

                <div className="mt-4 space-y-4">
                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-gray-800">Hourly rate</span>
                        <div className="relative">
                            <input
                                type="number"
                                min={1}
                                value={hourlyRateDraft}
                                onChange={(e) => setHourlyRateDraft(contractNumber(e.target.value, 0))}
                                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                            />
                            <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-gray-500">
                                {currency.code}/hr
                            </span>
                        </div>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-gray-800">Payment cycle</span>
                        <select
                            value={hourlyPaymentCycle}
                            onChange={(e) => setHourlyPaymentCycle(e.target.value as 'weekly' | 'bi-weekly' | 'monthly')}
                            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                        >
                            <option value="weekly">Weekly</option>
                            <option value="bi-weekly">Bi-weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-sm font-semibold text-gray-800">Project brief</span>
                        <textarea
                            rows={5}
                            value={hourlyRequestDraft}
                            onChange={(e) => setHourlyRequestDraft(e.target.value)}
                            placeholder="Describe the tasks, timeline, and scope..."
                            className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                        />
                    </label>

                    <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                        A contract + chat intro message will be created in real time. Freelancer can start the tracker,
                        and both parties can monitor payable time.
                    </div>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => setShowHourlyRequestModal(false)}
                        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmitHourlyRequest}
                        disabled={hourlySubmitting || !hourlyRequestDraft.trim() || hourlyRateDraft <= 0 || isOwnGig || viewerRole === 'freelancer'}
                        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {hourlySubmitting ? 'Creating...' : 'Create hourly contract'}
                    </button>
                </div>
            </div>
        </div>
    )}

    {showGigChatBar && (
        <>
            {!gigChatOpen && (
                <button
                    type="button"
                    onClick={handleContact}
                    className="fixed bottom-6 left-6 z-[61] flex items-center gap-3 rounded-full border border-gray-200 bg-white px-3 py-2 pr-5 shadow-xl hover:shadow-2xl"
                >
                    {gig.freelancerAvatar ? (
                        <img
                            src={gig.freelancerAvatar}
                            alt={gig.freelancerName}
                            className="h-11 w-11 rounded-full border border-gray-100 object-cover"
                        />
                    ) : (
                        <div className="h-11 w-11 rounded-full bg-gray-200" />
                    )}
                    <div className="text-left">
                        <p className="text-2xs text-gray-500">Message</p>
                        <p className="text-sm font-semibold text-gray-900">{gig.freelancerName}</p>
                        {showSellerMeta ? (
                            <p className="text-xs text-gray-500">{sellerStatus} • Avg. response: {sellerResponseTime}</p>
                        ) : null}
                    </div>
                </button>
            )}

            {gigChatOpen && (
                <div className="fixed bottom-4 left-4 z-[62] w-[92vw] max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                        <div className="flex items-center gap-3">
                            {gig.freelancerAvatar ? (
                                <img
                                    src={gig.freelancerAvatar}
                                    alt={gig.freelancerName}
                                    className="h-10 w-10 rounded-full border border-gray-100 object-cover"
                                />
                            ) : (
                                <div className="h-10 w-10 rounded-full bg-gray-200" />
                            )}
                            <div>
                                <p className="text-base font-semibold text-gray-900">{gig.freelancerName}</p>
                                {showSellerMeta ? (
                                    <p className="text-xs text-gray-500">{sellerStatus} • Avg. response time: {sellerResponseTime}</p>
                                ) : null}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setGigChatOpen(false);
                                setGigChatReplyTo(null);
                            }}
                            className="rounded-full p-2 text-gray-400 hover:bg-gray-100"
                        >
                            x
                        </button>
                    </div>

                    <div className="space-y-3 px-4 py-4">
                        <p className="text-sm text-gray-600">
                            Ask a question or share your requirements, timeline, and budget.
                        </p>
                        {quickPrompts.length > 0 ? (
                            <div className="space-y-2">
                                {quickPrompts.slice(0, 3).map((prompt: string, index: number) => (
                                    <button
                                        key={`prompt-${index}`}
                                        type="button"
                                        onClick={() => handleQuickPrompt(prompt)}
                                        className="w-full rounded-full border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <div className="border-y border-gray-100 bg-gray-50/60 px-4 py-3">
                        <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-gray-100 bg-white p-3">
                            {!user ? (
                                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                                    Login to send and receive messages with this freelancer.
                                </div>
                            ) : gigChatLoading ? (
                                <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Loading conversation...
                                </div>
                            ) : gigChatError ? (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                                    {gigChatError}
                                </div>
                            ) : gigChatMessages.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">
                                    No messages yet. Start the conversation with the freelancer.
                                </div>
                            ) : (
                                gigChatMessages.map((message) => {
                                    const senderId = message.senderId || message.sender_id;
                                    const mine = Boolean(user?.id && senderId === user.id);
                                    const replyPreview = getGigChatReplyPreview(message);
                                    const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
                                    const messageText = message.isDeleted || message.is_deleted
                                        ? '[Message deleted]'
                                        : message.text || (hasAttachments ? 'Sent an attachment' : '');
                                    return (
                                        <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[86%] rounded-xl px-3 py-2 ${mine ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'}`}>
                                                {replyPreview ? (
                                                    <div className={`mb-1 rounded-md border px-2 py-1 text-[11px] ${mine ? 'border-blue-300/60 bg-blue-500/50 text-blue-50' : 'border-gray-200 bg-white/70 text-gray-600'}`}>
                                                        <p className="font-semibold">
                                                            {replyPreview.senderName || 'Reply'}
                                                        </p>
                                                        <p className="truncate">
                                                            {replyPreview.unavailable ? 'Message unavailable' : (replyPreview.snippet || 'Replied message')}
                                                        </p>
                                                    </div>
                                                ) : null}
                                                <p className="whitespace-pre-wrap break-words text-sm">{messageText}</p>
                                                <div className={`mt-1 flex items-center justify-end gap-2 text-[11px] ${mine ? 'text-blue-100' : 'text-gray-500'}`}>
                                                    <span>{formatGigChatTime(message.timestamp)}</span>
                                                    {user && !(message.isDeleted || message.is_deleted) ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setGigChatReplyTo(message)}
                                                            className={`${mine ? 'text-blue-50/90 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                                                        >
                                                            Reply
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={gigChatMessagesEndRef} />
                        </div>
                    </div>

                    <div className="border-t border-gray-100 p-4">
                        {gigChatReplyTo ? (
                            <div className="mb-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-semibold">Replying to message</p>
                                        <p className="truncate">
                                            {getGigChatReplyPreview(gigChatReplyTo)?.snippet || gigChatReplyTo.text || 'Message'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setGigChatReplyTo(null)}
                                        className="rounded px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : null}
                        <textarea
                            value={gigChatDraft}
                            onChange={(e) => setGigChatDraft(e.target.value)}
                            rows={4}
                            placeholder="Write a message..."
                            className="w-full resize-none rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-blue-500"
                        />
                        <div className="mt-3 flex items-center justify-between gap-2">
                            <button
                                type="button"
                                onClick={handleOpenFullInbox}
                                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                            >
                                Open full inbox
                            </button>
                            <button
                                type="button"
                                onClick={handleSendGigChat}
                                disabled={gigChatSending || !gigChatDraft.trim()}
                                className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {gigChatSending ? 'Sending...' : 'Send message'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )}

    {showCheckout && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">Complete your purchase</h3>
                    <button
                        onClick={() => setShowCheckout(false)}
                        className="rounded-full p-2 text-gray-400 hover:bg-gray-100"
                    >
                        x
                    </button>
                </div>

                <p className="mt-2 text-sm text-gray-500">
                    Select a payment method to continue. Payments are processed securely on Scrolith.
                </p>

                <div className="mt-4 space-y-3 max-h-[45vh] overflow-y-auto pr-2">
                    {checkoutLoading && gateways.length === 0 ? (
                        <div className="flex items-center text-sm text-gray-500">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Loading payment gateways...
                        </div>
                    ) : gateways.length === 0 ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                            No payment gateways are active for {currency.code}. Please contact support.
                        </div>
                    ) : (
                        gateways.map((gw) => {
                            const supported = Array.isArray(gw.supported_currencies || gw.supportedCurrencies)
                                ? (gw.supported_currencies || gw.supportedCurrencies)
                                : [];
                            const currencyCode = (currency.code || 'USD').toUpperCase();
                            const requiredAmount = Number(currentPackage?.price ?? priceAmount);
                            const walletBalance = Number(walletInfo?.availableBalance ?? walletInfo?.available_balance ?? 0);
                            const walletCurrency = (walletInfo?.currency || currencyCode).toUpperCase();
                            const isWallet = gw.id === 'wallet';
                            const isSupported = isWallet
                                ? walletBalance >= requiredAmount && walletCurrency === currencyCode
                                : supported.length === 0
                                    ? true
                                    : supported.map((c: string) => c.toUpperCase()).includes(currencyCode);
                            return (
                                <label
                                    key={gw.id}
                                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                                        selectedGateway === gw.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200'
                                    } ${isSupported ? 'cursor-pointer' : 'opacity-60'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        {gw.logo && (
                                            <img src={gw.logo} alt={gw.name} className="h-6 w-6 rounded bg-white object-contain" />
                                        )}
                                        <div>
                                            <div className="font-semibold text-gray-900">{gw.name}</div>
                                            <div className="text-xs text-gray-500">
                                                {isWallet
                                                    ? `Balance: ${formatPrice(walletBalance)}`
                                                    : `${gw.mode === 'live' ? 'Live' : 'Test'} mode`}
                                                {!isSupported && !isWallet ? ` - Not available for ${currency.code}` : ''}
                                                {!isSupported && isWallet ? ' - Insufficient balance' : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <input
                                        type="radio"
                                        name="paymentGateway"
                                        checked={selectedGateway === gw.id}
                                        onChange={() => isSupported && setSelectedGateway(gw.id)}
                                        disabled={!isSupported}
                                    />
                                </label>
                            );
                        })
                    )}
                </div>

                {checkoutError && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                        {checkoutError}
                    </div>
                )}

                <div className="mt-6 flex items-center justify-between gap-3">
                    <button
                        onClick={() => setShowCheckout(false)}
                        className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleStartPayment}
                        disabled={checkoutLoading || !selectedGateway}
                        className="flex-1 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {checkoutLoading ? 'Processing...' : `Pay ${formatPrice(currentPackage?.price ?? priceAmount)}`}
                    </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
};

export default GigDetail;

