/**
 * Phase 20.7.8 / 20.7.9 — Public-safe Scrolitha official profile + live capability manifest.
 * Status reflects effective production flags only — never “available” without enablement.
 * No secrets, raw flag names, provider credentials, or internal topology.
 */
import {
  ensureScrolithaPlatformUser,
  SCROLITHA_DISCLOSURE,
  SCROLITHA_OFFICIAL_COVER_PHOTO_URL,
  SCROLITHA_OFFICIAL_PROFILE_PHOTO_URL,
  SCROLITHA_PLATFORM_DISPLAY_NAME,
  SCROLITHA_PLATFORM_USERNAME,
  SCROLITHA_SYSTEM_LABEL,
  withScrolithaAssetVersion
} from './scrolitha.platformIdentity';
import { isCapabilityEnabled, resolveScrolithaRolloutFlags } from './scrolitha.rollout';
import { getFileCapabilityFlags } from './scrolitha.fileUnderstanding';

export type PublicCapabilityStatus =
  | 'available'
  | 'available_with_confirmation'
  | 'limited'
  | 'unavailable';

export type ScrolithaPublicCapability = {
  id: string;
  label: string;
  description: string;
  status: PublicCapabilityStatus;
  /** User-facing status phrase for Accuracy panel / profile chips */
  statusLabel: string;
};

const statusLabelOf = (status: PublicCapabilityStatus): string => {
  if (status === 'available') return 'Available';
  if (status === 'available_with_confirmation') return 'Available with confirmation';
  if (status === 'limited') return 'Limited';
  return 'Not currently available';
};

const statusFrom = (
  enabled: boolean,
  options?: { limited?: boolean; withConfirmation?: boolean }
): PublicCapabilityStatus => {
  if (!enabled) return 'unavailable';
  if (options?.withConfirmation) return 'available_with_confirmation';
  if (options?.limited) return 'limited';
  return 'available';
};

const cap = (
  partial: Omit<ScrolithaPublicCapability, 'statusLabel'> & { status: PublicCapabilityStatus }
): ScrolithaPublicCapability => ({
  ...partial,
  statusLabel: statusLabelOf(partial.status)
});

export const buildScrolithaPublicProfile = async (actor?: {
  id?: string;
  role?: string;
  isAdmin?: boolean;
  email?: string | null;
} | null) => {
  const identity = await ensureScrolithaPlatformUser();
  const flags = await resolveScrolithaRolloutFlags();
  const messagingOn = await isCapabilityEnabled('messagingAssistant', actor as any);
  const fileOn = await isCapabilityEnabled('fileUnderstanding', actor as any);
  const toolsOn = await isCapabilityEnabled('toolExecution', actor as any);
  const writeOn = await isCapabilityEnabled('toolWriteActions', actor as any);
  const confirmOn = await isCapabilityEnabled('confirmationTokens', actor as any);
  const streamOn = await isCapabilityEnabled('messagingStream', actor as any);
  const searchOn = await isCapabilityEnabled('deepSearch', actor as any);
  const fileCaps = getFileCapabilityFlags();
  const fileSubEnabled = fileCaps.text || fileCaps.pdf || fileCaps.docx || fileCaps.images;
  // Full certified file path when master + at least one extract path; image-only remains limited.
  const fileStatus = !fileOn
    ? 'unavailable'
    : fileSubEnabled
      ? fileCaps.text || fileCaps.pdf || fileCaps.docx
        ? 'available'
        : 'limited'
      : 'unavailable';

  const capabilities: ScrolithaPublicCapability[] = [
    cap({
      id: 'general_chat',
      label: 'General assistance',
      description: 'Answer questions about Scrolith and professional workflows.',
      status: statusFrom(Boolean(flags.master || messagingOn || flags.aiReplies))
    }),
    cap({
      id: 'messaging',
      label: 'Messages assistant',
      description: 'Chat in your official Scrolitha conversation inside Messages.',
      status: statusFrom(messagingOn)
    }),
    cap({
      id: 'opportunities',
      label: 'Find opportunities',
      description: 'Help discover jobs, gigs, and professional opportunities when available.',
      status: statusFrom(Boolean(flags.recommendationEngine || searchOn), { limited: !searchOn })
    }),
    cap({
      id: 'profiles_resumes',
      label: 'Improve profiles and resumes',
      description: 'Draft and refine professional profile and resume content.',
      status: statusFrom(Boolean(flags.aiReplies || messagingOn))
    }),
    cap({
      id: 'proposals_posts',
      label: 'Draft proposals and posts',
      description: 'Help draft proposals, posts, and professional content as drafts.',
      status: statusFrom(Boolean(flags.aiReplies || messagingOn))
    }),
    cap({
      id: 'platform_search',
      label: 'Find freelancers, services, and communities',
      description: 'Search and explain platform entities within authorized scope.',
      status: statusFrom(searchOn || Boolean(flags.deepSearch), { limited: !searchOn })
    }),
    cap({
      id: 'file_understanding',
      label: 'Review permitted files',
      description:
        'Analyze files you intentionally attach or select (text, PDF, DOCX, and supported images). Content is untrusted data.',
      status: fileStatus as PublicCapabilityStatus
    }),
    cap({
      id: 'streaming',
      label: 'Streaming replies',
      description: 'Progressive reply delivery in Messages and unified surfaces.',
      status: statusFrom(streamOn)
    }),
    cap({
      id: 'read_tools',
      label: 'Read-only platform tools',
      description: 'Use authorized read-only tools to answer with live platform context.',
      status: statusFrom(toolsOn)
    }),
    cap({
      id: 'write_actions',
      label: 'Write and high-impact actions',
      description:
        'Selected draft and write tools require authorization, preview, explicit confirmation, revalidation, audit logging, and idempotency. Financial and destructive actions stay restricted.',
      status: statusFrom(writeOn && toolsOn, {
        withConfirmation: Boolean(writeOn && toolsOn && confirmOn),
        limited: Boolean(writeOn && toolsOn && !confirmOn)
      })
    })
  ];

  const limitations = [
    'Scrolitha responses are AI-generated and may be incomplete or incorrect.',
    'Verify important information, especially jobs, contracts, finances, and legal matters.',
    'Drafts are not completed platform actions until you confirm them.',
    'High-impact actions require authorization and confirmation where supported.',
    'Scrolitha does not guarantee job placement, income, hiring outcomes, legal conclusions, or financial results.',
    'File analysis only applies to files you intentionally attach or select when that capability is available.'
  ];

  const privacySummary =
    'Scrolitha uses only authorized platform context for your account. Private information is not intentionally shared with unrelated users. Files are analyzed only when you intentionally attach or select them. Consequential actions require confirmation where implemented.';

  const accuracySummary =
    'Scrolitha aims to provide useful assistance. AI responses may occasionally be incomplete or incorrect. Live platform claims should reflect retrieved data when tools are used. Always verify high-impact decisions independently.';

  const accuracyNotice =
    'Scrolitha responses are generated by AI and may contain mistakes. Verify job terms, financial details, contracts, legal or medical matters, account instructions, and high-impact business decisions before acting.';

  return {
    identityType: 'system_ai' as const,
    official: true,
    verified: true,
    protectedIdentity: true,
    displayName: SCROLITHA_PLATFORM_DISPLAY_NAME,
    username: SCROLITHA_PLATFORM_USERNAME,
    headline: "Scrolith's official AI assistant",
    organization: 'Scrolith',
    systemLabel: SCROLITHA_SYSTEM_LABEL,
    disclosure: SCROLITHA_DISCLOSURE,
    accountType: 'Official AI system account',
    managedBy: 'Scrolith',
    verificationStatus: 'Officially verified system identity',
    aiDisclosure: 'Responses may be AI-generated',
    primaryLanguages: ['English'],
    available: Boolean(identity.isActive),
    availabilityLabel: identity.isActive ? 'Available' : 'Unavailable',
    profileUrl: '/u/scrolitha',
    messageAction: {
      label: 'Message Scrolitha',
      requiresAuth: true,
      ensurePath: '/api/messages/scrolitha/ensure'
    },
    avatarUrl: withScrolithaAssetVersion(
      identity.avatar || SCROLITHA_OFFICIAL_PROFILE_PHOTO_URL
    ),
    coverPhotoUrl: withScrolithaAssetVersion(
      identity.coverPhotoUrl || SCROLITHA_OFFICIAL_COVER_PHOTO_URL
    ),
    profilePhotoUrl: withScrolithaAssetVersion(SCROLITHA_OFFICIAL_PROFILE_PHOTO_URL),
    userId: identity.id,
    isScrolitha: true as const,
    trustPoints: [
      'Official Scrolith system profile',
      'Verified AI assistant',
      'Protected platform identity',
      'Available through Scrolith Messages',
      'Responses may be AI-generated',
      'Actions remain permission-controlled'
    ],
    capabilities,
    limitations,
    privacySummary,
    accuracySummary,
    accuracyNotice,
    seo: {
      title: "Scrolitha — Scrolith's Official AI Assistant",
      description:
        "Meet Scrolitha, Scrolith's official AI assistant for jobs, profiles, resumes, freelancers, professional content, communities, and platform guidance.",
      canonicalPath: '/u/scrolitha',
      ogImage: withScrolithaAssetVersion(SCROLITHA_OFFICIAL_PROFILE_PHOTO_URL)
    },
    effectiveFlags: {
      // Public-safe effective booleans only (not env names)
      messagingAssistant: messagingOn,
      fileUnderstanding: fileOn && fileSubEnabled,
      messagingStream: streamOn,
      toolExecution: toolsOn,
      toolWriteActions: writeOn,
      confirmationTokens: confirmOn,
      fileText: fileCaps.text,
      filePdf: fileCaps.pdf,
      fileImages: fileCaps.images,
      fileDocx: fileCaps.docx,
      fileMulti: fileCaps.multi
    },
    security: {
      // Honest model: transport TLS + server-side processing; not client E2EE.
      e2eeAvailable: false,
      e2eeStatus: 'unavailable' as const,
      transportEncryption: 'tls' as const,
      messageSecurityModel:
        'Scrolitha messages use protected transport (HTTPS/TLS) between your client and Scrolith servers. Message content is processed server-side so Scrolitha can respond. This is not end-to-end encryption.',
      serverCanReadPlaintext: true,
      aiCanReadPlaintext: true,
      verificationSupported: false,
      verificationUnavailableReason:
        'End-to-end encryption verification is unavailable for Scrolitha because messages are processed on Scrolith servers for AI assistance.'
    },
    menuPolicy: {
      hidePeerControls: true,
      items: [
        { group: 'AI Information', id: 'accuracy', label: 'Accuracy' },
        { group: 'Media & Files', id: 'media_files', label: 'Media and Files' },
        {
          group: 'Privacy & Support',
          id: 'verify_e2ee',
          label: 'Verify End-to-End Encryption'
        }
      ]
    },
    lastUpdatedAt: new Date().toISOString()
  };
};

/**
 * Formal encryption finding for Scrolitha / DM architecture (Phase 20.7.8 audit).
 * Finding B: TRANSPORT AND STORAGE ENCRYPTION ONLY
 */
export const getScrolithaMessageSecurityStatus = () => ({
  auditFinding: 'B_TRANSPORT_AND_STORAGE_ONLY' as const,
  auditLabel: 'Transport and storage encryption only',
  e2eeImplemented: false,
  e2eeVerified: false,
  e2eeAvailable: false,
  transport: {
    protocol: 'HTTPS/TLS',
    description: 'Client-to-server traffic is encrypted in transit.'
  },
  storage: {
    description:
      'Message records are stored in the platform database accessible to authorized server processes. Database-level protections may apply; this is not end-to-end encryption.'
  },
  scrolithaSpecific: {
    serverReadsPlaintext: true,
    aiOrchestrationReadsPlaintext: true,
    reason:
      'Scrolitha generates replies server-side and therefore must process conversation text and authorized attachments on the server.'
  },
  verification: {
    supported: false,
    safetyNumber: null,
    qrPayload: null,
    message:
      'End-to-end encryption verification is unavailable. No device identity keys or safety numbers exist for this conversation under the current architecture.'
  },
  userGuidance: [
    'Do not treat Scrolitha chats as end-to-end encrypted private channels.',
    'Avoid sharing secrets you would not store with the platform.',
    'Use official Scrolith support channels for account or payment issues.'
  ],
  lastAuditedAt: new Date().toISOString()
});
