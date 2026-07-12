import api from './api';
import {
  Gig,
  StorefrontMerchantSummary,
  StorefrontSettings,
  User,
  UserProfile,
  UserSettings
} from '../types';
import { resolveAssetUrl } from '../utils/assetUrl';
import { resolvePostAttachmentMediaUrl } from '../utils/postAttachmentMedia';
import { resolveUserAvatarUrl } from '../utils/userAvatar';
import { normalizeStorefrontSettings } from '../utils/storefront';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const toArray = (value: any): any[] => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.results)) return value.results;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const normalizeGigPackage = (pkg: any) => ({
  ...pkg,
  delivery_days: pkg?.delivery_days ?? pkg?.deliveryDays ?? 0,
  deliveryDays: pkg?.deliveryDays ?? pkg?.delivery_days ?? 0
});

const normalizeGigExtra = (extra: any) => ({
  ...extra,
  additional_days: extra?.additional_days ?? extra?.additionalDays ?? 0,
  additionalDays: extra?.additionalDays ?? extra?.additional_days ?? 0,
  applies_to: extra?.applies_to ?? extra?.appliesTo ?? 'all',
  appliesTo: extra?.appliesTo ?? extra?.applies_to ?? 'all'
});

const normalizeGig = (gig: any): Gig => {
  const adminStatus = gig?.admin_status ?? gig?.adminStatus;
  const pricingMode = gig?.pricing_mode ?? gig?.pricingMode;
  const freelancerName = gig?.freelancer_name ?? gig?.freelancerName;
  const freelancerId = gig?.freelancer_id ?? gig?.freelancerId;
  const freelancerAvatar = resolveAssetUrl(gig?.freelancer_avatar ?? gig?.freelancerAvatar ?? '');
  const createdAt = gig?.created_at ?? gig?.createdAt;
  const updatedAt = gig?.updated_at ?? gig?.updatedAt;
  const isVisible = gig?.is_visible ?? gig?.isVisible;
  const isActive = gig?.is_active ?? gig?.isActive;
  const ordersCount = gig?.orders_count ?? gig?.ordersCount;
  const adminReason = gig?.admin_reason ?? gig?.adminReason;
  const isFeatured = gig?.is_featured ?? gig?.isFeatured;
  const isTopSelected = gig?.is_top_selected ?? gig?.isTopSelected;
  const isRecommended = gig?.is_recommended ?? gig?.isRecommended;
  const images = Array.isArray(gig?.images)
    ? gig.images.map((entry: any) => resolveAssetUrl(String(entry || ''))).filter(Boolean)
    : [];
  const image = resolveAssetUrl(gig?.image ?? images[0] ?? '') || '';

  return {
    ...gig,
    image,
    images,
    admin_status: adminStatus,
    adminStatus,
    pricing_mode: pricingMode,
    pricingMode,
    freelancer_name: freelancerName,
    freelancerName,
    freelancer_id: freelancerId,
    freelancerId,
    freelancer_avatar: freelancerAvatar,
    freelancerAvatar,
    created_at: createdAt,
    createdAt,
    updated_at: updatedAt,
    updatedAt,
    is_visible: isVisible,
    isVisible,
    is_active: isActive,
    isActive,
    is_featured: isFeatured,
    isFeatured,
    is_top_selected: isTopSelected,
    isTopSelected,
    is_recommended: isRecommended,
    isRecommended,
    orders_count: ordersCount,
    ordersCount,
    adminReason,
    packages: Array.isArray(gig?.packages) ? gig.packages.map(normalizeGigPackage) : [],
    extras: Array.isArray(gig?.extras) ? gig.extras.map(normalizeGigExtra) : []
  } as Gig;
};

const normalizeStorefrontMerchantSummary = (value: any): StorefrontMerchantSummary | null => {
  if (!value || typeof value !== 'object') return null;
  return {
    title: String(value?.title || '').trim(),
    subtitle: value?.subtitle ? String(value.subtitle).trim() : '',
    location: value?.location ?? null,
    category: value?.category ?? null,
    currency: value?.currency ? String(value.currency).toUpperCase() : null,
    priceFrom:
      value?.priceFrom === null || value?.price_from === null
        ? null
        : Number.isFinite(Number(value?.priceFrom ?? value?.price_from))
          ? Number(value?.priceFrom ?? value?.price_from)
          : null,
    price_from:
      value?.priceFrom === null || value?.price_from === null
        ? null
        : Number.isFinite(Number(value?.priceFrom ?? value?.price_from))
          ? Number(value?.priceFrom ?? value?.price_from)
          : null,
    serviceCount: Number(value?.serviceCount ?? value?.service_count ?? 0),
    service_count: Number(value?.serviceCount ?? value?.service_count ?? 0),
    featuredCount: Number(value?.featuredCount ?? value?.featured_count ?? 0),
    featured_count: Number(value?.featuredCount ?? value?.featured_count ?? 0),
    rating: Number(value?.rating ?? 0),
    completedJobs: Number(value?.completedJobs ?? value?.completed_jobs ?? 0),
    completed_jobs: Number(value?.completedJobs ?? value?.completed_jobs ?? 0),
    responseRate: Number(value?.responseRate ?? value?.response_rate ?? 0),
    response_rate: Number(value?.responseRate ?? value?.response_rate ?? 0),
    responseTimeHours: value?.responseTimeHours ?? value?.response_time_hours ?? null,
    response_time_hours: value?.responseTimeHours ?? value?.response_time_hours ?? null,
    trustScore:
      value?.trustScore === null || value?.trust_score === null
        ? null
        : Number.isFinite(Number(value?.trustScore ?? value?.trust_score))
          ? Number(value?.trustScore ?? value?.trust_score)
          : null,
    trust_score:
      value?.trustScore === null || value?.trust_score === null
        ? null
        : Number.isFinite(Number(value?.trustScore ?? value?.trust_score))
          ? Number(value?.trustScore ?? value?.trust_score)
          : null,
    trustTier: value?.trustTier ?? value?.trust_tier ?? null,
    trust_tier: value?.trustTier ?? value?.trust_tier ?? null
  };
};

export type UserStorefrontPayload = {
  userId: string;
  user_id: string;
  enabled: boolean;
  canManage: boolean;
  can_manage: boolean;
  settings: StorefrontSettings;
  merchantSummary: StorefrontMerchantSummary | null;
  merchant_summary: StorefrontMerchantSummary | null;
  featuredServices: Gig[];
  featured_services: Gig[];
  services: Gig[];
};

const normalizeUserStorefront = (value: any): UserStorefrontPayload => {
  const featuredServices = toArray(value?.featuredServices ?? value?.featured_services).map(normalizeGig);
  const services = toArray(value?.services).map(normalizeGig);
  const merchantSummary = normalizeStorefrontMerchantSummary(
    value?.merchantSummary ?? value?.merchant_summary
  );

  return {
    userId: String(value?.userId || value?.user_id || ''),
    user_id: String(value?.user_id || value?.userId || ''),
    enabled: Boolean(value?.enabled),
    canManage: Boolean(value?.canManage ?? value?.can_manage),
    can_manage: Boolean(value?.can_manage ?? value?.canManage),
    settings: normalizeStorefrontSettings(value?.settings),
    merchantSummary,
    merchant_summary: merchantSummary,
    featuredServices,
    featured_services: featuredServices,
    services
  };
};

const normalizeProfessionalIdentity = (value: any) => {
  if (!value || typeof value !== 'object') return null;
  const featuredClubs = toArray(value.featured_clubs ?? value.featuredClubs).map((club: any) => ({
    id: String(club?.id || ''),
    name: String(club?.name || 'Community club'),
    visibility: String(club?.visibility || 'public').toLowerCase() === 'private' ? 'private' : 'public',
    member_count: Number(club?.member_count ?? club?.memberCount ?? 0),
    memberCount: Number(club?.memberCount ?? club?.member_count ?? 0),
    cover_image: club?.cover_image ?? club?.coverImage ?? '',
    coverImage: club?.coverImage ?? club?.cover_image ?? '',
    joined_at: club?.joined_at ?? club?.joinedAt ?? null,
    joinedAt: club?.joinedAt ?? club?.joined_at ?? null
  }));

  return {
    is_verified: Boolean(value.is_verified ?? value.isVerified),
    isVerified: Boolean(value.isVerified ?? value.is_verified),
    kyc_status: value.kyc_status ?? value.kycStatus ?? '',
    kycStatus: value.kycStatus ?? value.kyc_status ?? '',
    verification_status: value.verification_status ?? value.verificationStatus ?? '',
    verificationStatus: value.verificationStatus ?? value.verification_status ?? '',
    is_pro_freelancer: Boolean(value.is_pro_freelancer ?? value.isProFreelancer),
    isProFreelancer: Boolean(value.isProFreelancer ?? value.is_pro_freelancer),
    is_pro_employer: Boolean(value.is_pro_employer ?? value.isProEmployer),
    isProEmployer: Boolean(value.isProEmployer ?? value.is_pro_employer),
    trust_tier: value.trust_tier ?? value.trustTier ?? 'growing',
    trustTier: value.trustTier ?? value.trust_tier ?? 'growing',
    review_count: Number(value.review_count ?? value.reviewCount ?? 0),
    reviewCount: Number(value.reviewCount ?? value.review_count ?? 0),
    average_rating: Number(value.average_rating ?? value.averageRating ?? 0),
    averageRating: Number(value.averageRating ?? value.average_rating ?? 0),
    completed_jobs: Number(value.completed_jobs ?? value.completedJobs ?? 0),
    completedJobs: Number(value.completedJobs ?? value.completed_jobs ?? 0),
    response_rate: Number(value.response_rate ?? value.responseRate ?? 0),
    responseRate: Number(value.responseRate ?? value.response_rate ?? 0),
    response_time_hours: value.response_time_hours ?? value.responseTimeHours ?? null,
    responseTimeHours: value.responseTimeHours ?? value.response_time_hours ?? null,
    certification_count: Number(value.certification_count ?? value.certificationCount ?? 0),
    certificationCount: Number(value.certificationCount ?? value.certification_count ?? 0),
    verified_certification_count: Number(value.verified_certification_count ?? value.verifiedCertificationCount ?? 0),
    verifiedCertificationCount: Number(value.verifiedCertificationCount ?? value.verified_certification_count ?? 0),
    portfolio_proof_count: Number(value.portfolio_proof_count ?? value.portfolioProofCount ?? 0),
    portfolioProofCount: Number(value.portfolioProofCount ?? value.portfolio_proof_count ?? 0),
    verified_portfolio_proof_count: Number(value.verified_portfolio_proof_count ?? value.verifiedPortfolioProofCount ?? 0),
    verifiedPortfolioProofCount: Number(value.verifiedPortfolioProofCount ?? value.verified_portfolio_proof_count ?? 0),
    club_count: Number(value.club_count ?? value.clubCount ?? 0),
    clubCount: Number(value.clubCount ?? value.club_count ?? 0),
    featured_clubs: featuredClubs,
    featuredClubs,
    top_skills: toArray(value.top_skills ?? value.topSkills).map((item) => String(item || '')),
    topSkills: toArray(value.topSkills ?? value.top_skills).map((item) => String(item || '')),
    badges: toArray(value.badges).map((item) => String(item || ''))
  };
};

const mapProfile = (p: any): UserProfile => {
  const hourlyRate = Number(p.hourly_rate ?? p.hourlyRate ?? 0);
  const introVideoUrl = p.intro_video_url ?? p.introVideoUrl ?? '';
  const coverPhotoUrl = p.cover_photo_url ?? p.coverPhotoUrl ?? '';
  const coverFileId = p.cover_file_id ?? p.coverFileId ?? p.cover_photo_file_id ?? p.coverPhotoFileId;
  const profilePhotoFileId = p.profile_photo_file_id ?? p.profilePhotoFileId;
  const resolvedAvatar =
    resolveUserAvatarUrl({ ...p, profilePhotoFileId, profile_photo_file_id: profilePhotoFileId }) || undefined;
  const resolvedCover =
    resolvePostAttachmentMediaUrl({
      url: coverPhotoUrl,
      fileId: coverFileId,
      path: p.cover?.path || p.cover?.url
    }) ||
    resolvePostAttachmentMediaUrl(p.cover) ||
    (coverPhotoUrl ? resolveAssetUrl(String(coverPhotoUrl)) : undefined) ||
    undefined;
  const professionalIdentity = normalizeProfessionalIdentity(p.professional_identity ?? p.professionalIdentity);
  return {
    user_id: p.user_id ?? p.userId,
    userId: p.user_id ?? p.userId,
    title: p.title ?? '',
    bio: p.bio ?? '',
    location: p.location ?? '',
    formatted_address: p.formatted_address ?? p.formattedAddress ?? p.location ?? '',
    formattedAddress: p.formattedAddress ?? p.formatted_address ?? p.location ?? '',
    country: p.country ?? '',
    country_code: p.country_code ?? p.countryCode ?? '',
    countryCode: p.countryCode ?? p.country_code ?? '',
    state: p.state ?? '',
    city: p.city ?? '',
    region: p.region ?? '',
    postal_code: p.postal_code ?? p.postalCode ?? '',
    postalCode: p.postalCode ?? p.postal_code ?? '',
    latitude:
      p.latitude === null || p.latitude === undefined || p.latitude === ''
        ? null
        : Number(p.latitude),
    longitude:
      p.longitude === null || p.longitude === undefined || p.longitude === ''
        ? null
        : Number(p.longitude),
    place_id: p.place_id ?? p.placeId ?? '',
    placeId: p.placeId ?? p.place_id ?? '',
    location_source: p.location_source ?? p.locationSource ?? '',
    locationSource: p.locationSource ?? p.location_source ?? '',
    languages: toArray(p.languages),
    skills: toArray(p.skills),
    hourly_rate: hourlyRate,
    hourlyRate,
    portfolio: toArray(p.portfolio ?? p.portfolioItems ?? p.portfolio_items),
    experience: toArray(p.experience ?? p.experienceItems ?? p.experience_items),
    education: toArray(p.education ?? p.educationItems ?? p.education_items),
    certifications: toArray(p.certifications),
    intro_video_url: introVideoUrl,
    introVideoUrl,
    cover_photo_url: resolvedCover,
    coverPhotoUrl: resolvedCover,
    gender: p.gender ?? '',
    date_of_birth: p.date_of_birth ?? p.dateOfBirth ?? null,
    dateOfBirth: p.dateOfBirth ?? p.date_of_birth ?? null,
    birth_month_day: p.birth_month_day ?? p.birthMonthDay ?? '',
    birthMonthDay: p.birthMonthDay ?? p.birth_month_day ?? '',
    show_birth_month_day_public:
      p.show_birth_month_day_public ?? p.showBirthMonthDayPublic ?? true,
    showBirthMonthDayPublic:
      p.showBirthMonthDayPublic ?? p.show_birth_month_day_public ?? true,
    profile_photo_file_id: profilePhotoFileId,
    profilePhotoFileId: profilePhotoFileId,
    avatar_url: resolvedAvatar,
    avatarUrl: resolvedAvatar,
    rating: Number(p.rating ?? 0),
    completedJobs: Number(p.completed_jobs ?? p.completedJobs ?? 0),
    responseRate: Number(p.response_rate ?? p.responseRate ?? 0),
    responseTime: p.response_time ?? p.responseTime ?? undefined,
    professional_identity: professionalIdentity,
    professionalIdentity
  };
};

const mapUser = (u: any): User => {
  const profilePhotoFileId = u.profile_photo_file_id ?? u.profilePhotoFileId;
  const resolvedAvatar =
    resolveUserAvatarUrl({ ...u, profilePhotoFileId, profile_photo_file_id: profilePhotoFileId }) || undefined;
  const normalizedKyc = String(u.kyc_status ?? u.kycStatus ?? '').toLowerCase();
  const isVerified = Boolean(u.isVerified ?? u.is_verified ?? normalizedKyc === 'verified');
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    username: u.username ?? u.user_name ?? u.userName,
    avatar: resolvedAvatar,
  profilePhotoFileId,
  profile_photo_file_id: profilePhotoFileId,
  isVerified,
  is_verified: isVerified,
  kycStatus: (u.kyc_status ?? u.kycStatus) as any,
  kyc_status: (u.kyc_status ?? u.kycStatus) as any,
  isProFreelancer: Boolean(u.isProFreelancer ?? u.is_pro_freelancer),
  is_pro_freelancer: Boolean(u.isProFreelancer ?? u.is_pro_freelancer),
  isProEmployer: Boolean(u.isProEmployer ?? u.is_pro_employer),
  is_pro_employer: Boolean(u.isProEmployer ?? u.is_pro_employer),
  freelancerPlanId: u.freelancerPlanId ?? u.freelancer_plan_id ?? null,
  freelancer_plan_id: u.freelancerPlanId ?? u.freelancer_plan_id ?? null,
  freelancerPlanName: u.freelancerPlanName ?? u.freelancer_plan_name ?? null,
  freelancer_plan_name: u.freelancerPlanName ?? u.freelancer_plan_name ?? null,
  freelancerPlanInterval: u.freelancerPlanInterval ?? u.freelancer_plan_interval ?? null,
  freelancer_plan_interval: u.freelancerPlanInterval ?? u.freelancer_plan_interval ?? null,
  freelancerPlanPrice: u.freelancerPlanPrice ?? u.freelancer_plan_price ?? null,
  freelancer_plan_price: u.freelancerPlanPrice ?? u.freelancer_plan_price ?? null,
  freelancerPlanCurrency: u.freelancerPlanCurrency ?? u.freelancer_plan_currency ?? null,
  freelancer_plan_currency: u.freelancerPlanCurrency ?? u.freelancer_plan_currency ?? null,
  freelancerPlanActive: Boolean(u.freelancerPlanActive ?? u.freelancer_plan_active),
  freelancer_plan_active: Boolean(u.freelancerPlanActive ?? u.freelancer_plan_active),
  freelancerPlanPurchasedAt: u.freelancerPlanPurchasedAt ?? u.freelancer_plan_purchased_at ?? null,
  freelancer_plan_purchased_at: u.freelancerPlanPurchasedAt ?? u.freelancer_plan_purchased_at ?? null,
  freelancerPlanExpiresAt: u.freelancerPlanExpiresAt ?? u.freelancer_plan_expires_at ?? null,
  freelancer_plan_expires_at: u.freelancerPlanExpiresAt ?? u.freelancer_plan_expires_at ?? null,
  employerPlanId: u.employerPlanId ?? u.employer_plan_id ?? null,
  employer_plan_id: u.employerPlanId ?? u.employer_plan_id ?? null,
  employerPlanName: u.employerPlanName ?? u.employer_plan_name ?? null,
  employer_plan_name: u.employerPlanName ?? u.employer_plan_name ?? null,
  employerPlanInterval: u.employerPlanInterval ?? u.employer_plan_interval ?? null,
  employer_plan_interval: u.employerPlanInterval ?? u.employer_plan_interval ?? null,
  employerPlanPrice: u.employerPlanPrice ?? u.employer_plan_price ?? null,
  employer_plan_price: u.employerPlanPrice ?? u.employer_plan_price ?? null,
  employerPlanCurrency: u.employerPlanCurrency ?? u.employer_plan_currency ?? null,
  employer_plan_currency: u.employerPlanCurrency ?? u.employer_plan_currency ?? null,
  employerPlanActive: Boolean(u.employerPlanActive ?? u.employer_plan_active),
  employer_plan_active: Boolean(u.employerPlanActive ?? u.employer_plan_active),
  employerPlanPurchasedAt: u.employerPlanPurchasedAt ?? u.employer_plan_purchased_at ?? null,
  employer_plan_purchased_at: u.employerPlanPurchasedAt ?? u.employer_plan_purchased_at ?? null,
  employerPlanExpiresAt: u.employerPlanExpiresAt ?? u.employer_plan_expires_at ?? null,
  employer_plan_expires_at: u.employerPlanExpiresAt ?? u.employer_plan_expires_at ?? null
  };
};

const mapSettings = (s: any): UserSettings => ({
  email_notifications: Boolean(s.email_notifications ?? s.emailNotifications),
  in_app_notifications: Boolean(s.in_app_notifications ?? s.inAppNotifications),
  message_requests_notifications: Boolean(
    s.message_requests_notifications ?? s.messageRequestsNotifications ?? true
  ),
  allow_in_mail: Boolean(s.allow_in_mail ?? s.allowInMail ?? true),
  mention_notifications: Boolean(
    s.mention_notifications ?? s.notify_mentions ?? s.notifyMentions ?? s.mentionNotifications ?? true
  ),
  followed_post_notifications: Boolean(
    s.followed_post_notifications ??
      s.notify_followed_posts ??
      s.notifyFollowedPosts ??
      s.followedPostNotifications ??
      true
  ),
  follow_notifications: Boolean(
    s.follow_notifications ?? s.notify_followed_you ?? s.notifyFollowedYou ?? s.followNotifications ?? true
  ),
  comment_notifications: Boolean(
    s.comment_notifications ??
      s.notify_comments_on_posts ??
      s.notifyCommentsOnPosts ??
      s.commentNotifications ??
      true
  ),
  reaction_notifications: Boolean(
    s.reaction_notifications ??
      s.notify_reactions_on_posts ??
      s.notifyReactionsOnPosts ??
      s.reactionNotifications ??
      true
  ),
  repost_notifications: Boolean(
    s.repost_notifications ?? s.notify_reposts ?? s.notifyReposts ?? s.repostNotifications ?? true
  ),
  job_application_notifications: Boolean(
    s.job_application_notifications ??
      s.notify_job_applications ??
      s.notifyJobApplications ??
      s.jobApplicationNotifications ??
      true
  ),
  application_update_notifications: Boolean(
    s.application_update_notifications ??
      s.notify_application_updates ??
      s.notifyApplicationUpdates ??
      s.applicationUpdateNotifications ??
      true
  ),
  notify_mentions: Boolean(s.notify_mentions ?? s.notifyMentions ?? s.mention_notifications ?? true),
  notify_followed_posts: Boolean(s.notify_followed_posts ?? s.notifyFollowedPosts ?? s.followed_post_notifications ?? true),
  notify_followed_you: Boolean(s.notify_followed_you ?? s.notifyFollowedYou ?? s.follow_notifications ?? true),
  notify_comments_on_posts: Boolean(
    s.notify_comments_on_posts ?? s.notifyCommentsOnPosts ?? s.comment_notifications ?? true
  ),
  notify_reactions_on_posts: Boolean(
    s.notify_reactions_on_posts ?? s.notifyReactionsOnPosts ?? s.reaction_notifications ?? true
  ),
  notify_reposts: Boolean(s.notify_reposts ?? s.notifyReposts ?? s.repost_notifications ?? true),
  notify_job_applications: Boolean(
    s.notify_job_applications ?? s.notifyJobApplications ?? s.job_application_notifications ?? true
  ),
  notify_application_updates: Boolean(
    s.notify_application_updates ?? s.notifyApplicationUpdates ?? s.application_update_notifications ?? true
  ),
  marketing_emails: Boolean(s.marketing_emails ?? s.marketingEmails),
  two_factor_enabled: Boolean(s.two_factor_enabled ?? s.twoFactorEnabled),
  login_alerts: Boolean(s.login_alerts ?? s.loginAlerts),
  emailNotifications: Boolean(s.email_notifications ?? s.emailNotifications),
  inAppNotifications: Boolean(s.in_app_notifications ?? s.inAppNotifications),
  messageRequestsNotifications: Boolean(
    s.message_requests_notifications ?? s.messageRequestsNotifications ?? true
  ),
  allowInMail: Boolean(s.allow_in_mail ?? s.allowInMail ?? true),
  mentionNotifications: Boolean(
    s.mention_notifications ?? s.notify_mentions ?? s.notifyMentions ?? s.mentionNotifications ?? true
  ),
  followedPostNotifications: Boolean(
    s.followed_post_notifications ??
      s.notify_followed_posts ??
      s.notifyFollowedPosts ??
      s.followedPostNotifications ??
      true
  ),
  followNotifications: Boolean(
    s.follow_notifications ?? s.notify_followed_you ?? s.notifyFollowedYou ?? s.followNotifications ?? true
  ),
  commentNotifications: Boolean(
    s.comment_notifications ??
      s.notify_comments_on_posts ??
      s.notifyCommentsOnPosts ??
      s.commentNotifications ??
      true
  ),
  reactionNotifications: Boolean(
    s.reaction_notifications ??
      s.notify_reactions_on_posts ??
      s.notifyReactionsOnPosts ??
      s.reactionNotifications ??
      true
  ),
  repostNotifications: Boolean(
    s.repost_notifications ?? s.notify_reposts ?? s.notifyReposts ?? s.repostNotifications ?? true
  ),
  jobApplicationNotifications: Boolean(
    s.job_application_notifications ??
      s.notify_job_applications ??
      s.notifyJobApplications ??
      s.jobApplicationNotifications ??
      true
  ),
  applicationUpdateNotifications: Boolean(
    s.application_update_notifications ??
      s.notify_application_updates ??
      s.notifyApplicationUpdates ??
      s.applicationUpdateNotifications ??
      true
  ),
  notifyMentions: Boolean(s.notifyMentions ?? s.notify_mentions ?? s.mention_notifications ?? true),
  notifyFollowedPosts: Boolean(s.notifyFollowedPosts ?? s.notify_followed_posts ?? s.followed_post_notifications ?? true),
  notifyFollowedYou: Boolean(s.notifyFollowedYou ?? s.notify_followed_you ?? s.follow_notifications ?? true),
  notifyCommentsOnPosts: Boolean(
    s.notifyCommentsOnPosts ?? s.notify_comments_on_posts ?? s.comment_notifications ?? true
  ),
  notifyReactionsOnPosts: Boolean(
    s.notifyReactionsOnPosts ?? s.notify_reactions_on_posts ?? s.reaction_notifications ?? true
  ),
  notifyReposts: Boolean(s.notifyReposts ?? s.notify_reposts ?? s.repost_notifications ?? true),
  notifyJobApplications: Boolean(
    s.notifyJobApplications ?? s.notify_job_applications ?? s.job_application_notifications ?? true
  ),
  notifyApplicationUpdates: Boolean(
    s.notifyApplicationUpdates ?? s.notify_application_updates ?? s.application_update_notifications ?? true
  ),
  marketingEmails: Boolean(s.marketing_emails ?? s.marketingEmails),
  twoFactorEnabled: Boolean(s.two_factor_enabled ?? s.twoFactorEnabled),
  loginAlerts: Boolean(s.login_alerts ?? s.loginAlerts)
});

const toProfilePayload = (profile: Partial<UserProfile>) => {
  const p = profile as unknown as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  const has = (key: string) => Object.prototype.hasOwnProperty.call(p, key);

  if (has('user_id') || has('userId')) {
    payload.user_id = (p['user_id'] as string | undefined) ?? (p['userId'] as string | undefined);
  }
  if (has('title')) payload.title = (p['title'] as string | undefined) ?? '';
  if (has('bio')) payload.bio = (p['bio'] as string | undefined) ?? '';
  if (has('location')) payload.location = (p['location'] as string | undefined) ?? '';
  if (has('formattedAddress') || has('formatted_address')) {
    payload.formatted_address =
      (p['formattedAddress'] as string | undefined) ?? (p['formatted_address'] as string | undefined) ?? '';
  }
  if (has('country')) payload.country = (p['country'] as string | undefined) ?? '';
  if (has('countryCode') || has('country_code')) {
    payload.country_code =
      (p['countryCode'] as string | undefined) ?? (p['country_code'] as string | undefined) ?? '';
  }
  if (has('state')) payload.state = (p['state'] as string | undefined) ?? '';
  if (has('city')) payload.city = (p['city'] as string | undefined) ?? '';
  if (has('region')) payload.region = (p['region'] as string | undefined) ?? '';
  if (has('postalCode') || has('postal_code')) {
    payload.postal_code =
      (p['postalCode'] as string | undefined) ?? (p['postal_code'] as string | undefined) ?? '';
  }
  if (has('latitude')) payload.latitude = (p['latitude'] as number | string | null | undefined) ?? null;
  if (has('longitude')) payload.longitude = (p['longitude'] as number | string | null | undefined) ?? null;
  if (has('placeId') || has('place_id')) {
    payload.place_id =
      (p['placeId'] as string | undefined) ?? (p['place_id'] as string | undefined) ?? '';
  }
  if (has('locationSource') || has('location_source')) {
    payload.location_source =
      (p['locationSource'] as string | undefined) ?? (p['location_source'] as string | undefined) ?? '';
  }
  if (has('languages')) payload.languages = Array.isArray(profile.languages) ? profile.languages : [];
  if (has('skills')) payload.skills = Array.isArray(profile.skills) ? profile.skills : [];
  if (has('hourlyRate') || has('hourly_rate')) {
    payload.hourly_rate = Number(
      (p['hourlyRate'] as number | string | undefined) ?? (p['hourly_rate'] as number | string | undefined) ?? 0
    );
  }
  if (has('introVideoUrl') || has('intro_video_url')) {
    payload.intro_video_url = (p['introVideoUrl'] as string | undefined) ?? (p['intro_video_url'] as string | undefined) ?? '';
  }
  if (has('coverPhotoUrl') || has('cover_photo_url')) {
    payload.cover_photo_url = (p['coverPhotoUrl'] as string | undefined) ?? (p['cover_photo_url'] as string | undefined) ?? '';
  }
  if (has('gender')) payload.gender = (p['gender'] as string | undefined) ?? '';
  if (has('dateOfBirth') || has('date_of_birth')) {
    payload.date_of_birth =
      (p['dateOfBirth'] as string | undefined) ??
      (p['date_of_birth'] as string | undefined) ??
      null;
  }
  if (has('showBirthMonthDayPublic') || has('show_birth_month_day_public')) {
    payload.show_birth_month_day_public =
      (p['showBirthMonthDayPublic'] as boolean | undefined) ??
      (p['show_birth_month_day_public'] as boolean | undefined) ??
      true;
  }
  if (has('profile_photo_file_id') || has('profilePhotoFileId')) {
    payload.profile_photo_file_id =
      (p['profile_photo_file_id'] as string | undefined) ?? (p['profilePhotoFileId'] as string | undefined) ?? null;
  }
  if (has('avatar_url') || has('avatarUrl') || has('avatar')) {
    payload.avatar_url =
      (p['avatar_url'] as string | undefined) ??
      (p['avatarUrl'] as string | undefined) ??
      (p['avatar'] as string | undefined) ??
      null;
  }
  if (has('portfolio')) payload.portfolio = Array.isArray(profile.portfolio) ? profile.portfolio : [];
  if (has('experience')) payload.experience = Array.isArray(profile.experience) ? profile.experience : [];
  if (has('education')) payload.education = Array.isArray(profile.education) ? profile.education : [];
  if (has('certifications')) payload.certifications = Array.isArray(profile.certifications) ? profile.certifications : [];

  return payload;
};

const toSettingsPayload = (settings: Partial<UserSettings>) => ({
  email_notifications: settings.email_notifications ?? settings.emailNotifications,
  in_app_notifications: settings.in_app_notifications ?? settings.inAppNotifications,
  message_requests_notifications:
    settings.message_requests_notifications ?? settings.messageRequestsNotifications,
  allow_in_mail: settings.allow_in_mail ?? settings.allowInMail,
  mention_notifications:
    settings.mention_notifications ??
    settings.notify_mentions ??
    settings.notifyMentions ??
    settings.mentionNotifications,
  followed_post_notifications:
    settings.followed_post_notifications ??
    settings.notify_followed_posts ??
    settings.notifyFollowedPosts ??
    settings.followedPostNotifications,
  follow_notifications:
    settings.follow_notifications ??
    settings.notify_followed_you ??
    settings.notifyFollowedYou ??
    settings.followNotifications,
  comment_notifications:
    settings.comment_notifications ??
    settings.notify_comments_on_posts ??
    settings.notifyCommentsOnPosts ??
    settings.commentNotifications,
  reaction_notifications:
    settings.reaction_notifications ??
    settings.notify_reactions_on_posts ??
    settings.notifyReactionsOnPosts ??
    settings.reactionNotifications,
  repost_notifications:
    settings.repost_notifications ??
    settings.notify_reposts ??
    settings.notifyReposts ??
    settings.repostNotifications,
  notify_mentions:
    settings.notify_mentions ??
    settings.notifyMentions ??
    settings.mention_notifications ??
    settings.mentionNotifications,
  notify_followed_posts:
    settings.notify_followed_posts ??
    settings.notifyFollowedPosts ??
    settings.followed_post_notifications ??
    settings.followedPostNotifications,
  notify_followed_you:
    settings.notify_followed_you ??
    settings.notifyFollowedYou ??
    settings.follow_notifications ??
    settings.followNotifications,
  notify_comments_on_posts:
    settings.notify_comments_on_posts ??
    settings.notifyCommentsOnPosts ??
    settings.comment_notifications ??
    settings.commentNotifications,
  notify_reactions_on_posts:
    settings.notify_reactions_on_posts ??
    settings.notifyReactionsOnPosts ??
    settings.reaction_notifications ??
    settings.reactionNotifications,
  notify_reposts:
    settings.notify_reposts ??
    settings.notifyReposts ??
    settings.repost_notifications ??
    settings.repostNotifications,
  job_application_notifications:
    settings.job_application_notifications ??
    settings.notify_job_applications ??
    settings.notifyJobApplications ??
    settings.jobApplicationNotifications,
  application_update_notifications:
    settings.application_update_notifications ??
    settings.notify_application_updates ??
    settings.notifyApplicationUpdates ??
    settings.applicationUpdateNotifications,
  notify_job_applications:
    settings.notify_job_applications ??
    settings.notifyJobApplications ??
    settings.job_application_notifications ??
    settings.jobApplicationNotifications,
  notify_application_updates:
    settings.notify_application_updates ??
    settings.notifyApplicationUpdates ??
    settings.application_update_notifications ??
    settings.applicationUpdateNotifications,
  marketing_emails: settings.marketing_emails ?? settings.marketingEmails,
  two_factor_enabled: settings.two_factor_enabled ?? settings.twoFactorEnabled,
  login_alerts: settings.login_alerts ?? settings.loginAlerts
});

export const UserService = {
  getMyProfile: async (): Promise<UserProfile> => {
    const response = await api.get('/profile/me');
    return mapProfile(extractData<UserProfile>(response));
  },

  updateMyProfile: async (data: Partial<UserProfile>): Promise<UserProfile> => {
    const response = await api.put('/profile/me', toProfilePayload(data));
    return mapProfile(extractData<UserProfile>(response));
  },

  getUserBasic: async (userId: string): Promise<User> => {
    const response = await api.get(`/users/${userId}`);
    return mapUser(extractData<User>(response));
  },
  getProfile: async (userId: string): Promise<UserProfile> => {
    const response = await api.get(`/users/${userId}/profile`);
    return mapProfile(extractData<UserProfile>(response));
  },

  getStorefront: async (userId: string): Promise<UserStorefrontPayload> => {
    const response = await api.get(`/users/${userId}/storefront`);
    return normalizeUserStorefront(extractData<any>(response));
  },

  updateProfile: async (userId: string, data: Partial<UserProfile>): Promise<UserProfile> => {
    const response = await api.put(`/users/${userId}/profile`, toProfilePayload(data));
    return mapProfile(extractData<UserProfile>(response));
  },

  getSettings: async (userId: string): Promise<UserSettings> => {
    const response = await api.get(`/users/${userId}/settings`);
    return mapSettings(extractData<UserSettings>(response));
  },

  getMySettings: async (): Promise<UserSettings> => {
    const response = await api.get('/settings/me');
    return mapSettings(extractData<UserSettings>(response));
  },

  updateSettings: async (userId: string, settings: Partial<UserSettings>): Promise<UserSettings> => {
    const response = await api.put(`/users/${userId}/settings`, toSettingsPayload(settings));
    return mapSettings(extractData<UserSettings>(response));
  },

  updateMySettings: async (settings: Partial<UserSettings>): Promise<UserSettings> => {
    const response = await api.put('/settings/me', toSettingsPayload(settings));
    return mapSettings(extractData<UserSettings>(response));
  },

  changePassword: async (userId: string, oldPass: string, newPass: string): Promise<void> => {
    await api.post(`/users/${userId}/password`, { oldPassword: oldPass, newPassword: newPass });
  },

  updateEmail: async (userId: string, newEmail: string): Promise<void> => {
    await api.put(`/users/${userId}`, { email: newEmail });
  },

  updateCredentials: async (
    userId: string,
    data: { name?: string; email?: string; username?: string; password?: string; avatar?: string; profilePhotoFileId?: string }
  ): Promise<User> => {
    const response = await api.put(`/users/${userId}`, data);
    return extractData<User>(response);
  },

  checkUsernameAvailability: async (username: string): Promise<{ available: boolean; username: string; reason?: string }> => {
    const response = await api.get(`/users/username/availability/${encodeURIComponent(username)}`);
    return extractData<{ available: boolean; username: string; reason?: string }>(response);
  },

  getUserByUsername: async (username: string): Promise<User> => {
    const response = await api.get(`/users/username/${encodeURIComponent(username)}`);
    return mapUser(extractData<User>(response));
  },

  logProfileView: async (userId: string): Promise<void> => {
    await api.post(`/users/${userId}/views`);
  },

  getProfileViewers: async (userId: string, limit = 8): Promise<{ viewers: any[] }> => {
    const response = await api.get(`/users/${userId}/viewers`, { params: { limit, days: 7 } });
    const data = extractData<{ viewers: any[] }>(response);
    const viewers = Array.isArray(data.viewers)
      ? data.viewers.map((viewer) => ({
          ...viewer,
          avatar: viewer?.avatar ? resolveAssetUrl(String(viewer.avatar)) : viewer?.avatar
        }))
      : [];
    return { viewers };
  },

  getProfilesViewed: async (userId: string, limit = 8): Promise<{ viewed: any[] }> => {
    const response = await api.get(`/users/${userId}/viewing`, { params: { limit, days: 7 } });
    const data = extractData<{ viewed: any[] }>(response);
    const viewed = Array.isArray(data.viewed)
      ? data.viewed.map((entry) => ({
          ...entry,
          avatar: entry?.avatar ? resolveAssetUrl(String(entry.avatar)) : entry?.avatar
        }))
      : [];
    return { viewed };
  },

  getMonetizationStatus: async (): Promise<any> => {
    const response = await api.get('/monetization/me');
    return extractData<any>(response);
  },

  applyMonetization: async (payload: {
    fullName: string;
    tinNumber: string;
    country: string;
    age: number;
    email: string;
    phone: string;
  }): Promise<any> => {
    const response = await api.post('/monetization/apply', payload);
    return extractData<any>(response);
  },

  getMonetizationApplications: async (limit = 20): Promise<any[]> => {
    const response = await api.get('/monetization/applications', { params: { limit } });
    const data = extractData<any>(response);
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.items) ? data.items : [];
  }
};
