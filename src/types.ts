
export enum UserRole {
  GUEST = 'guest',
  FREELANCER = 'freelancer',
  EMPLOYER = 'employer',
  ADMIN = 'admin',
  MODERATOR = 'moderator'
}

export type UserStatus = 'active' | 'suspended' | 'inactive';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  status?: UserStatus;
  kycStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  gcoinBalance?: number;
  joinDate?: string;
  location?: string;
  followersCount?: number;
  followingCount?: number;
  profilePhotoFileId?: string;
}

export interface UserProfile {
    userId: string;
    title: string;
    bio: string;
    location: string;
    languages: string[];
    skills: string[];
    hourlyRate: number;
    portfolio: PortfolioItem[];
    experience: Experience[];
    education: Education[];
    certifications: Certification[];
    introVideoUrl?: string;
}

export interface UserSettings {
    emailNotifications: boolean;
    inAppNotifications: boolean;
    marketingEmails: boolean;
    twoFactorEnabled: boolean;
    loginAlerts: boolean;
}

export interface PortfolioItem {
    id: string;
    title: string;
    description: string;
    imageUrl: string;
    link?: string;
}

export interface Experience {
    id: string;
    title: string;
    company: string;
    startDate: string;
    endDate: string;
    current: boolean;
    description: string;
    country?: string;
}

export interface Education {
    id: string;
    school: string;
    degree: string;
    fieldOfStudy: string;
    startYear: string;
    endYear: string;
    country?: string;
}

export interface Certification {
    id: string;
    name: string;
    issuer: string;
    issueDate: string;
    isVerified: boolean;
    credentialUrl?: string;
}

export interface GigPackage {
    name: string;
    description: string;
    deliveryDays: number;
    revisions: number;
    price: number;
    features: string[];
}

export interface GigFAQ {
    id: string;
    question: string;
    answer: string;
}

export interface GigRequirement {
    id: string;
    question: string;
    type: 'text' | 'file';
    required: boolean;
}

export interface GigExtra {
    id: string;
    title: string;
    description: string;
    price: number;
    additionalDays: number;
    appliesTo: 'basic' | 'standard' | 'premium' | 'all';
}

export interface GigMilestone {
    title: string;
    duration: string;
    price: number;
}

export interface Gig {
    id: string;
    title: string;
    freelancerId?: string;
    freelancerName: string;
    freelancerAvatar: string;
    price: number;
    rating: number;
    reviews: number;
    image: string;
    images?: string[];
    videos?: string[];
    documents?: string[];
    category: string;
    subcategory?: string;
    status: 'draft' | 'submitted' | 'active' | 'paused' | 'rejected' | 'archived' | 'under_review';
    adminStatus?: 'pending' | 'approved' | 'rejected';
    isActive?: boolean;
    isVisible?: boolean;
    description: string;
    packages: GigPackage[];
    pricingMode?: 'packages' | 'milestones' | 'hourly';
    faqs?: GigFAQ[];
    requirements?: GigRequirement[];
    extras?: GigExtra[];
    milestones?: GigMilestone[];
    createdAt?: string;
    avgResponseTime?: string;
    memberSince?: string;
    languages?: string[];
    tags?: string[];
    rankingScore?: number;
    views?: number;
    clicks?: number;
    ordersCount?: number;
}

export interface Contract {
    id: string;
    title: string;
    clientId: string;
    clientName: string;
    freelancerId: string;
    freelancerName: string;
    type: 'fixed' | 'hourly';
    hourlyRate: number;
    paymentCycle: 'weekly' | 'bi-weekly' | 'monthly';
    status: 'active' | 'paused' | 'terminated' | 'completed';
    totalHoursLogged: number;
    totalPaid: number;
    startDate: string;
    description: string;
    hoursToday?: number;
    hoursThisWeek?: number;
    earningsPending?: number;
    activeSessionId?: string;
}

export type ContractStatus = Contract['status'];

export interface TimeEntry {
    id: string;
    contractId: string;
    freelancerId: string;
    startTime: string;
    endTime?: string;
    durationMinutes: number;
    description: string;
    status: 'pending' | 'approved' | 'paid' | 'rejected';
    earnings?: number;
    screenshots?: string[];
    activityScore?: number;
}

export interface Currency {
    code: string;
    name: string;
    symbol: string;
    rate: number;
    isActive: boolean;
    isDefault?: boolean;
}

export interface CategorySub {
    id: string;
    name: string;
    slug: string;
    status: 'active' | 'hidden';
    sortOrder: number;
    icon?: string;
}

export interface ListingCategory {
    id: string;
    name: string;
    slug: string;
    type: 'gig' | 'job';
    status: 'active' | 'hidden';
    count: number;
    sortOrder: number;
    subcategories: CategorySub[];
    description?: string;
    logo?: string;
    image?: string;
}

export interface Job {
    id: string;
    title: string;
    clientName: string;
    budget: string;
    type: 'Fixed Price' | 'Hourly' | 'Contract';
    postedTime: string;
    description: string;
    tags: string[];
    proposals: number;
    status: 'active' | 'closed' | 'draft' | 'submitted' | 'under_review' | 'rejected' | 'archived';
    isActive?: boolean;
    isVisible?: boolean;
    category: string;
    subcategory?: string;
    experienceLevel?: 'Entry' | 'Intermediate' | 'Expert';
    visibility?: 'public' | 'invite';
    duration?: string;
    attachments?: string[];
    isFeatured?: boolean;
    adminStatus?: 'pending' | 'approved' | 'rejected';
    meta?: any;
}

export interface Order {
    id: string;
    gigTitle: string;
    clientId: string;
    clientName: string;
    freelancerId: string;
    freelancerName: string;
    amount: number;
    status: 'Active' | 'Completed' | 'Delivered' | 'Cancelled';
    escrowStatus: 'Funded' | 'Released' | 'Refunded';
    dateOrdered: string;
    dueDate: string;
}

export enum TransactionType {
    DEPOSIT = 'deposit',
    WITHDRAWAL = 'withdrawal',
    ESCROW_HOLD = 'escrow_hold',
    ESCROW_RELEASE = 'escrow_release',
    FEE = 'fee',
    REFUND = 'refund',
    ADJUSTMENT = 'adjustment',
    TRANSFER = 'transfer',
    REWARD = 'reward'
}

export interface WalletTransaction {
    id: string;
    walletId: string;
    type: TransactionType;
    amount: number;
    status: 'cleared' | 'pending' | 'reversed' | 'failed';
    description: string;
    referenceId?: string;
    createdAt: string;
    adminNote?: string;
}

export interface Affiliate {
    id: string;
    userId: string;
    userName: string;
    code: string;
    earnings: number;
    referrals: number;
    status: 'active' | 'inactive';
    commissionRate: number;
    createdAt: string;
}

export interface Coupon {
    id: string;
    code: string;
    discountType: 'percentage' | 'fixed';
    value: number;
    usageLimit: number;
    usedCount: number;
    expiryDate: string;
    isActive: boolean;
}

export interface MarketingCampaign {
    id: string;
    name: string;
    type: 'email' | 'notification' | 'sms';
    status: 'draft' | 'scheduled' | 'active' | 'completed';
    targetAudience: 'all' | 'freelancers' | 'employers' | 'inactive';
    stats: { sent: number; opened: number; clicked: number };
    createdAt: string;
    scheduledAt?: string;
    subject?: string;
    content?: string;
}

export interface Conversation {
    id: string;
    type: 'direct' | 'group';
    participants: { id: string; name: string; avatar: string; isOnline?: boolean; role?: string }[];
    lastMessage: string;
    lastMessageAt: string;
    unreadCount: number;
    messages: Message[];
}

export interface MessageReaction {
    userId: string;
    emoji: string;
    timestamp: string;
}

export interface Message {
    id: string;
    conversationId: string;
    senderId: string;
    senderRole?: string;
    receiverId: string;
    text: string;
    timestamp: string;
    isRead: boolean;
    reactions?: MessageReaction[];
    aiFlagged?: boolean;
    aiReason?: string;
}

export interface KYCDocument {
    id: string;
    userId: string;
    userName: string;
    fullName: string;
    address: string;
    mobile: string;
    dob: string;
    nationality: string;
    type: 'ID Card' | 'Passport' | 'Driving License';
    status: 'Pending' | 'Approved' | 'Rejected';
    dateSubmitted: string;
    frontImage?: string;
    backImage?: string;
    adminNotes?: string;
}

export interface PlatformSettings {
    siteName: string;
    tagline: string;
    logoUrl: string;
    logoFileId?: string;
    faviconUrl: string;
    faviconFileId?: string;
    adminEmail: string;
    supportEmail: string;
    footerAboutTitle: string;
    footerAboutText: string;
    footerCopyright: string;
    footerLinks: any[]; 
    socialLinks: any[];
    system?: SystemConfig;
}

export interface SystemConfig {
    maintenanceMode: boolean;
    registrationsEnabled: boolean;
    kycEnforced: boolean;
    admin2FA: boolean;
    currency?: {
        autoExchangeRate: boolean;
        baseCurrency: string;
        provider: 'openexchangerates' | 'fixer' | 'mock';
        apiKey?: string;
    };
    storage?: {
        driver: string;
        s3: { accessKeyId: string; secretAccessKey: string; region: string; bucket: string };
        backblaze: { accessKeyId: string; secretAccessKey: string; region: string; bucket: string };
    };
    cache?: {
        driver: string;
        redis: { host: string; port: number; password: string };
    };
    email?: EmailProviderConfig;
    regionalCompliance?: ComplianceConfig[];
}

export interface ComplianceConfig {
    region: string;
    code: string;
    gdprEnabled: boolean;
    dataResidency: string;
    kycProvider: string;
    taxEngine: string;
    active: boolean;
}

export interface EmailProviderConfig {
    provider: 'smtp' | 'ses' | 'sendgrid' | 'mailgun';
    host: string;
    port: number;
    username: string;
    password: string;
    fromName: string;
    fromEmail: string;
}

export interface ContentBlock {
    id: string;
    type: 'text' | 'heading' | 'image' | 'video' | 'quote' | 'code';
    content: string;
    settings?: any;
}

export interface BlogPost {
    id: string;
    title: string;
    slug: string;
    content: string;
    blocks: ContentBlock[];
    excerpt: string;
    shortDescription?: string;
    featuredImage: string;
    status: 'published' | 'draft' | 'scheduled';
    visibility: 'public' | 'private';
    authorName: string;
    categoryId: string;
    categoryName: string;
    tags: string[];
    views: number;
    seo: { metaTitle: string; metaDescription: string; metaKeywords?: string[]; noIndex?: boolean };
    allowComments: boolean;
    isFeatured: boolean;
    createdAt: string;
    updatedAt: string;
    scheduledAt?: string;
}

export interface StaticPage {
    id: string;
    title: string;
    slug: string;
    content: string;
    blocks: ContentBlock[];
    status: 'PUBLISHED' | 'DRAFT';
    visibility: 'public' | 'private';
    updatedAt: string;
    categoryId: string;
    seo?: { metaTitle: string; metaDescription: string; metaKeywords?: string[] };
    images?: string[];
    videos?: string[];
}

export interface LandingContent {
    hero: HeroContent;
    stats: { value: string; label: string }[];
    howItWorks: HowItWorksContent;
    whyChoose: any;
    testimonials: any[];
    cta: CTAContent;
}

export interface HeroContent {
    headline: string;
    subheadline: string;
    primaryCtaText: string;
    primaryCtaLink: string;
    secondaryCtaText: string;
    secondaryCtaLink: string;
    backgroundImage: string;
    showTrustBadges?: boolean;
}

export interface HowItWorksContent {
    showVideo: boolean;
    employerSteps: { icon: string; title: string; description: string }[];
    freelancerSteps: { icon: string; title: string; description: string }[];
}

export interface CTAContent {
    headline: string;
    subheadline: string;
    buttonText: string;
    buttonLink: string;
}

export interface TrustContent {
    stats: { value: string; label: string }[];
}

export interface CategoriesContent {
    showIcons: boolean;
    viewMoreLink: string;
}

export interface FeaturedContent {
    source: 'gigs' | 'jobs';
    count: number;
    layout?: 'grid' | 'carousel';
    autoRotate?: boolean;
}

export interface PageCategory {
    id: string;
    name: string;
    slug: string;
    count: number;
    createdAt: string;
    updatedAt: string;
    status: 'active' | 'hidden';
    description?: string;
    image?: string;
}

export interface MediaItem {
    id: string;
    name: string;
    url: string;
    type: 'image' | 'video' | 'document';
    size: number;
    createdAt: string;
}

export interface BlogCategory {
    id: string;
    name: string;
    slug: string;
    description: string;
    status: 'active' | 'hidden';
    count: number;
}

export interface BlogSettings {
    pageTitle: string;
    metaTitle: string;
    metaDescription: string;
    bannerImage: string;
    postsPerPage: number;
    defaultCategory: string;
    showAuthor: boolean;
    showDate: boolean;
}

export type HomepageSectionType = 'hero' | 'trust' | 'categories' | 'how_it_works' | 'featured' | 'cta' | 'skill_matching' | 'trending_opps' | 'growth_dash' | 'gig_creation' | 'market_insights' | 'project_brief_generator' | 'top_pro_services' | 'trust_security';

export interface HomepageSection {
    id: string;
    type: HomepageSectionType;
    name: string;
    isActive: boolean;
    position: number;
    content: any; // Flexible content structure
    style?: any;
    startAt?: string;
    endAt?: string;
    targeting?: { roles: UserRole[] };
    abTestId?: string;
}

export interface SkillMatchingContent {
    // Add specific fields if needed
}

export interface TrendingOppsContent {
    title?: string;
}

export interface GrowthDashContent {
    tips?: string[];
}

export interface GigCreationContent {
    headline?: string;
    subheadline?: string;
    buttonText?: string;
}

export interface MarketInsightsContent {
    title?: string;
    regions?: string[];
}

export interface ProjectBriefContent {
    title?: string;
    subtitle?: string;
}

export interface TopProServicesContent {
    title?: string;
    count?: number;
}

export interface TrustSecurityContent {
    title?: string;
    features?: { icon: string; title: string; description: string }[];
}

export interface ABTest {
    id: string;
    name: string;
    sectionId: string;
    variants: any[];
    trafficSplit: number;
    status: 'running' | 'paused' | 'completed';
    metrics: { views: number; conversions: number };
    createdAt: string;
}

export interface HomepageTemplate {
    id: string;
    name: string;
    type: HomepageSectionType;
    content: any;
    style: any;
}

export interface HomepageVersion {
    id: string;
    createdAt: string;
    createdBy: string;
    snapshot: HomepageSection[];
    description: string;
}

export interface HomepageAnalytics {
    views: number;
    ctaClicks: number;
    bounceRate: number;
    avgTimeOnPage: number;
    deviceBreakdown: { desktop: number; mobile: number; tablet: number };
    sectionEngagement: { name: string; clicks: number; views: number }[];
}

export interface HeaderConfig {
    id: string;
    homeUrl: string;
    variant: 'light' | 'dark';
    searchEnabled: boolean;
    searchMode: 'keyword' | 'semantic';
    logoUrl: string;
    logoFileId?: string;
    faviconUrl: string;
    faviconFileId?: string;
    navigation: NavItem[];
    actions: { notifications: boolean; messages: boolean; orders: boolean; lists: boolean; switchSelling: boolean; profile: boolean };
    profileMenu: NavItem[];
}

export interface NavItem {
    id: string;
    label: string;
    url: string;
    visibility: UserRole[];
    icon?: string;
}

export interface FooterConfig {
    id: string;
    description: string;
    copyright: string;
    columns: { id: string; title: string; links: { id: string; label: string; url: string; visibility: UserRole[]; type: 'internal' | 'external' }[] }[];
    contact: { adminEmail: string; supportEmail: string; ticketRoute: string };
    socials: { id: string; platform: string; url: string; enabled: boolean; icon?: string }[];
    logoUrl?: string;
}

export interface HomeSlide {
    id: string;
    mediaType: 'image' | 'video';
    mediaUrl: string;
    title?: string;
    subtitle?: string;
    redirectUrl?: string;
    roleVisibility: UserRole[];
    sortOrder: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    backgroundColor?: string;
    fileId?: string;
}

export interface TrendingConfig {
    enabled: boolean;
    title: string;
    categoryIds: string[];
    scrollBehavior: 'manual' | 'auto';
    autoSlideInterval: number;
    visibility: UserRole[];
}

export interface AffiliatePageContent {
    heroTitle: string;
    heroSubtitle: string;
    heroButtonText: string;
    benefits: { title: string; description: string; icon: string }[];
}

export interface ActivityConfig {
    icons: NavIconConfig[];
    helpMenu: HelpLink[];
    design: {
        iconStyle: 'outline' | 'filled';
        iconSize: number;
        badgeColor: string;
        showBadges: boolean;
    };
}

export interface NavIconConfig {
    id: string;
    type: 'notifications' | 'messages' | 'favorites' | 'help';
    label: string;
    isEnabled: boolean;
    showLabel: boolean;
    sortOrder: number;
    roles: UserRole[];
}

export interface HelpLink {
    id: string;
    label: string;
    url: string;
    target: '_self' | '_blank';
    isEnabled: boolean;
}

export interface HeroSearchConfig {
    headline: string;
    subheadline: string;
    searchPlaceholder: string;
    searchSize: 'normal' | 'large' | 'xl';
    quickTags: { id: string; label: string; url: string; color?: string }[];
    trustedBrands: { enabled: boolean; title: string; logos: { id: string; src: string; alt: string }[] };
    valueProp: { enabled: boolean; heading: string; badges: { id: string; label: string; icon: string }[] };
}

export interface Attachment {
    id: string;
    name: string;
    url: string;
    type: 'image' | 'video' | 'document';
    size: number;
}

export interface SkillRecommendation {
    skill: string;
    demandGrowth: number;
    incomeUplift: number;
    difficulty: string;
    reason: string;
}

export interface Wallet {
    id: string;
    userId: string;
    availableBalance: number;
    pendingClearance: number;
    escrowBalance: number;
    frozen: boolean;
    currency: string;
    updatedAt: string;
}

export interface Escrow {
    id: string;
    orderId: string;
    clientId: string;
    clientName: string;
    freelancerId: string;
    freelancerName: string;
    amount: number;
    commission: number;
    status: EscrowStatus;
    fundedAt: string;
    releasedAt?: string;
}

export enum EscrowStatus {
    HELD = 'Funded',
    RELEASED = 'Released',
    REFUNDED = 'Refunded',
    DISPUTED = 'Disputed'
}

export interface UploadedFile {
    id: string;
    userId: string;
    ownerRole?: string;
    name: string;
    type: 'image' | 'video' | 'document';
    size: number;
    url: string;
    category: 'portfolio' | 'document' | 'verification' | 'chat';
    createdAt: string;
}

export interface EnterpriseHiringInsight {
    employerId: string;
    shortlistedCandidates: { id: string; name: string; fitScore: number; riskScore: number; costEfficiency: string }[];
    teamGaps: string[];
    marketPosition: string;
    budgetOptimization: string;
}

export interface BudgetAdvice {
    recommendedRange: string;
    successProbability: number;
    marketComparison: string;
    optimizationTips: string[];
}

export interface TrustScore {
    userId: string;
    overallScore: number;
    reliability: number;
    fairness: number;
    professionalism: number;
    trend: 'up' | 'down' | 'stable';
    riskIndicators: string[];
    history?: any[];
}

export interface PricingAdvice {
    min: number;
    optimal: number;
    max: number;
    confidence: number;
    reasoning: string;
}

export interface AIAbuseReport {
    userId: string;
    userName: string;
    message: string;
    reason: string;
    timestamp: string;
    actionTaken: string;
    severity: string;
}

export type AIModule = 'Support' | 'Payments' | 'Jobs' | 'Gigs' | 'KYC' | 'General';

export interface AIPrompt {
    id: string;
    module: AIModule;
    role: string;
    systemPrompt: string;
    enabled: boolean;
    updatedAt: string;
    updatedBy: string;
    version: number;
}

export interface AIConversationLog {
    id: string;
    userId: string;
    userRole: string;
    userName: string;
    timestamp: string;
    messages: { sender: 'user' | 'agent'; text: string; timestamp: string }[];
    source: 'AI' | 'STATIC';
    status: 'active' | 'resolved';
}

export interface PaymentGateway {
    id: string;
    name: string;
    isEnabled: boolean;
    mode: 'live' | 'test';
    logo: string;
    supportedCurrencies: string[];
    config?: any;
}

export type PaymentProviderId = 'stripe' | 'paypal' | 'paystack' | 'flutterwave' | 'payoneer' | 'paymongo' | 'monnify' | 'opay' | 'xendit' | 'dragonpay';

export interface WithdrawalRequest {
    id: string;
    userId: string;
    userName: string;
    userRole: string;
    amount: number;
    method: string;
    details: string;
    status: 'pending' | 'approved' | 'rejected';
    requestedAt: string;
    riskScore?: number;
    riskLevel?: string;
}

export interface CommissionRule {
    // Defines complex rules if needed
    id: string;
    role: UserRole;
    type: 'percentage' | 'fixed';
    value: number;
    minAmount?: number;
    maxAmount?: number;
}

export interface Subscriber {
    id: string;
    email: string;
    source: 'footer' | 'popup' | 'checkout' | 'blog';
    status: 'active' | 'verified' | 'pending' | 'unsubscribed';
    subscribedAt: string;
}

export interface StaffMember {
    id: string;
    name: string;
    email: string;
    username?: string;
    roleId: string;
    roleName: string;
    roleLevel?: number;
    avatar?: string;
    status: 'active' | 'suspended' | 'inactive';
    twoFactorEnabled?: boolean;
    forcePasswordReset?: boolean;
}

export interface StaffRole {
    id: string;
    name: string;
    level: number;
    permissions: any;
}

export interface Plan {
    id: string;
    name: string;
    type: 'freelancer' | 'employer';
    price: number;
    interval: 'monthly' | 'yearly' | 'lifetime';
    currency: string;
    isActive: boolean;
    isPopular: boolean;
    features: PlanFeature[];
}

export interface PlanFeature {
    id: string;
    name: string;
    included: boolean;
    limit?: string;
}

export type TicketStatus = 'Open' | 'In Review' | 'In Progress' | 'Waiting for User' | 'Resolved' | 'Closed';
export type TicketPriority = 'Low' | 'Medium' | 'High' | 'Critical';

export interface TicketReply {
    id: string;
    ticketId: string;
    sender: 'user' | 'admin';
    senderName: string;
    message: string;
    timestamp: string;
    attachments?: string[];
    internalNote?: boolean;
}

export interface SupportTicket {
    id: string;
    trackingCode?: string;
    userId: string;
    fullName: string;
    email: string;
    mobile?: string;
    subject: string;
    message: string;
    status: TicketStatus;
    priority: TicketPriority;
    category: string;
    createdAt: string;
    updatedAt: string;
    replies: TicketReply[];
    isReadByAdmin: boolean;
    isReadByUser: boolean;
    attachments?: string[];
}

export interface TicketCategory {
    id: string;
    name: string;
    isActive: boolean;
}

export interface FraudAlert {
    id: string;
    userId: string;
    userName: string;
    userRole: string;
    score: number;
    riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
    reason: string;
    contentSnippet: string;
    action: 'Allow' | 'Flagged' | 'Restricted' | 'Auto-Frozen' | 'Blocked';
    reviewed: boolean;
    timestamp: string;
}

export interface FraudLog {
    id: string;
    email?: string;
    ip?: string;
    riskScore: number;
    riskLevel: FraudAlert['riskLevel'];
    reasons: string[];
    actionTaken: FraudAlert['action'];
    timestamp: string;
}

export interface ChurnRisk {
    userId: string;
    userName: string;
    role: string;
    score: number;
    window: string;
    factors: string[];
    lastActive: string;
    projectedLoss: number;
}

export interface GrowthForecast {
    date: string;
    subscribers: number;
    revenue: number;
    source: 'current' | 'predicted';
}

export interface OptimizationProposal {
    id: string;
    module: string;
    issue: string;
    recommendation: string;
    impact: string;
    status: 'pending' | 'approved' | 'rejected' | 'applied';
    generatedAt: string;
    details?: string;
}

export interface AnomalyAlert {
    id: string;
    severity: 'info' | 'warning' | 'critical';
    area: string;
    message: string;
    value: string;
    baseline: string;
    timestamp: string;
    status: 'active' | 'resolved' | 'dismissed';
}

export interface MarketingROI {
    channel: string;
    spend: number;
    conversions: number;
    costPerAcquisition: number;
    revenue: number;
    roi: number;
}

export interface PlatformFinancials {
    totalEscrow: number;
    totalClearedUserFunds: number;
    totalPendingClearance: number;
    platformRevenue: number;
    refundPool: number;
}

export interface AIConfig {
    providers: {
        google: { provider: 'google'; apiKey: string; enabled: boolean; model: string };
        openai: { provider: 'openai'; apiKey: string; enabled: boolean; model: string };
    };
    routing: {
        support_chat: 'google' | 'openai';
        seo_tags: 'google' | 'openai';
        semantic_search: 'google' | 'openai';
        content_moderation: 'google' | 'openai';
    };
    safety: {
        maxTokens: number;
        temperature: number;
    };
    costControl?: {
        enabled?: boolean;
        monthlyLimitUSD: number;
        currentSpendUSD?: number;
    };
    fallback?: any;
}

export interface DisputePrediction {
    ticketId?: string;
    disputeId?: string;
    predictedOutcome: string;
    confidenceScore: number;
    riskLevel: 'Low' | 'Medium' | 'High';
    keyFactors: string[];
    suggestedResolution: string;
    evidenceGaps: string[];
    aiModelUsed?: string;
}

export interface GlobalCommissionSettings {
    freelancerFeeType: 'percentage' | 'fixed';
    freelancerFeeValue: number;
    employerFeeType: 'percentage' | 'fixed';
    employerFeeValue: number;
    minimumFee: number;
}

export interface ReferralIntelligence {
    topReferrers: { userId: string; name: string; totalReferrals: number; qualityScore: number; kFactor: number }[];
    fraudAlerts: { referrerId: string; reason: string; severity: string }[];
    campaignSuggestions: string[];
}

export interface TrendingSearch {
    id: string;
    keyword: string;
    count: number;
    isPinned: boolean;
    isBlocked: boolean;
    trend: 'up' | 'down' | 'stable';
    lastSearchedAt: string;
}

export interface SearchResult {
    id: string;
    type: 'gig' | 'job' | 'blog';
    title: string;
    description: string;
    image?: string;
    url: string;
    relevanceScore?: number;
    meta?: any;
}

export interface SearchConfig {
    aiEnabled: boolean;
    personalizedSuggestions: boolean;
    maxTrendingItems: number;
    blockedKeywords: string[];
}

export interface SearchSuggestion {
    text: string;
    type: 'keyword' | 'category' | 'history';
    category?: string;
}

export interface SearchHistory {
    id: string;
    userId: string;
    query: string;
    createdAt: string;
}

export interface RecommendedItem {
    id: string;
    type: 'gig' | 'job';
    title: string;
    description: string;
    image?: string;
    score: number;
    meta: any;
}

export interface ContractClauseSuggestion {
    id: string;
    title: string;
    text: string;
    category: string;
    reason: string;
    riskLevel: string;
}

export interface HiringMatch {
    freelancerId: string;
    freelancerName: string;
    score: number;
    matchReason: string;
}

export interface MatchingConfig {
    enabled: boolean;
    weights: {
        skills: number;
        experience: number;
        rating: number;
        responseTime: number;
        budgetFit: number;
    };
}

export interface RankingConfig {
    enabled: boolean;
    weights: {
        qualityScore: number;
        conversionRate: number;
        reviewSentiment: number;
        engagement: number;
    };
    demoteSpam: boolean;
    boostVerified: boolean;
}

export interface LTVMetric {
    userId: string;
    userName: string;
    role: UserRole;
    predictedLTV: number;
    confidenceScore: number;
    revenueVelocity: 'Low' | 'Medium' | 'High';
    churnRisk: number;
    nextAction: string;
}

export interface DemandForecast {
    skill: string;
    growthRate: number;
    recommendedPriceRange: string;
    regions: string[];
    confidence: number;
    timeframe: string;
    category: string;
}

export interface SkillCertification {
    id: string;
    userId: string;
    skill: string;
    level: SkillLevel;
    score: number;
    confidence: number;
    expiresAt: string;
    verifiedByAI: boolean;
    issuedAt: string;
    badgeUrl: string;
}

export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';

export interface TalentCreditScore {
    userId: string;
    score: number;
    riskLevel: string;
    recommendedLimit: number;
    confidence: number;
    lastUpdated: string;
}

export interface ForumThread {
    id: string;
    categoryId: string;
    categoryName: string;
    userId: string;
    userName: string;
    userAvatar: string;
    title: string;
    content: string;
    status: 'open' | 'solved' | 'locked';
    views: number;
    repliesCount: number;
    upvotes: number;
    isPinned: boolean;
    createdAt: string;
    tags: string[];
    interactions: InteractionCounts;
    userState: InteractionState;
}

export interface CommunityClub {
    id: string;
    name: string;
    description: string;
    visibility: 'public' | 'private';
    memberCount: number;
    coverImage: string;
    ownerId: string;
    isJoined?: boolean;
}

export interface CommunityEvent {
    id: string;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    type: 'workshop' | 'meetup' | 'webinar';
    hostName: string;
    attendees: number;
    image: string;
    isRegistered?: boolean;
}

export interface ContributorProfile {
    userId: string;
    userName: string;
    avatar: string;
    points: number;
    reputation: string;
    badges: string[];
}

export interface CommunityChannel {
    id: string;
    name: string;
    type: 'public' | 'private' | 'club' | 'event';
    isPaid: boolean;
    price: number;
    unreadCount: number;
    onlineCount: number;
    isLocked?: boolean;
}

export interface CommunityMessage {
    id: string;
    channelId: string;
    userId: string;
    userName: string;
    userAvatar: string;
    content: string;
    timestamp: string;
    aiFlagged: boolean;
    aiReason?: string;
}

export interface LeaderboardEntry {
    rank: number;
    userId: string;
    userName: string;
    userAvatar: string;
    score: number;
    trend: 'up' | 'down' | 'stable';
    contributions: number;
    category: string;
}

export interface CommunityAnalytics {
    healthScore: number;
    activeUsers: number;
    messagesToday: number;
    aiFlaggedCount: number;
    engagementTrend: number[];
    topChannels: { name: string; activity: number }[];
    toxicityScore: number;
}

export interface ReputationScore {
    userId: string;
    score: number;
    trustLevel: string;
    badges: string[];
    signals: { name: string; impact: number }[];
    history?: any[];
}

export interface CommunitySettings {
    modules: { forum: boolean; clubs: boolean; events: boolean; content: boolean; contributors: boolean };
    ai: { moderationEnabled: boolean; autoSummary: boolean; sentimentAnalysis: boolean; adminOverride: boolean };
    permissions: { requireApproval: boolean; allowMedia: boolean; allowEmbeds: boolean; allowTagging: boolean };
    editor: { enabledFeatures: string[]; maxContentLength: number };
}

export interface ModerationLog {
    id: string;
    userName: string;
    snippet: string;
    riskLevel: 'Low' | 'Medium' | 'High';
    reason: string;
    actionTaken: string;
}

export interface CommunityComment {
    id: string;
    threadId: string;
    parentId: string | null;
    userId: string;
    userName: string;
    userAvatar: string;
    userRole: string;
    content: string;
    createdAt: string;
    likes: number;
    isLiked: boolean;
    replies?: CommunityComment[];
    mentions?: string[];
}

export interface InteractionCounts {
    likes: number;
    comments: number;
    reposts: number;
    shares: number;
}

export interface InteractionState {
    liked: boolean;
    reposted: boolean;
}

export interface Notification {
    id: string;
    type: 'info' | 'success' | 'warning' | 'alert';
    title: string;
    message: string;
    actionUrl?: string;
    entityId?: string;
    isRead: boolean;
    timestamp: string;
}

export interface GcoinWallet {
    userId: string;
    recipientId: string;
    balance: number;
    lifetimeEarned: number;
    transactions: GcoinTransaction[];
    status: 'active' | 'frozen';
    fraudScore: number;
    updatedAt: string;
}

export interface GcoinTransaction {
    id: string;
    userId: string;
    userName: string;
    amount: number;
    type: 'reward' | 'transfer' | 'conversion' | 'admin_adjustment';
    reason: string;
    referenceId?: string;
    recipientId?: string;
    timestamp: string;
    status: 'approved' | 'pending' | 'rejected';
    source?: string;
}

export interface GcoinSettings {
    conversionRate: number;
    minWithdrawal: number;
    conversionEnabled: boolean;
    userTransfersEnabled: boolean;
}

export interface GcoinConversionRequest {
    id: string;
    userId: string;
    userName: string;
    amountGcoin: number;
    amountFiat: number;
    status: 'pending' | 'approved' | 'rejected';
    requestedAt: string;
}

export interface HiringPrediction {
    freelancerId: string;
    jobId?: string;
    successProbability: number;
    riskLevel: string;
    topFactors: string[];
    redFlags: string[];
}

export interface EscrowAdvice {
    escrowId: string;
    recommendation: 'Release' | 'Hold' | 'Partial Release';
    confidence: number;
    riskWarnings: string[];
    milestoneProgress: number;
}

export interface AIAnalytics {
    totalConversations: number;
    costEstimate: number;
    avgResponseTime: number;
    safetyStats: { spamTriggers: number };
    topRoles: { role: string; count: number }[];
    conversionImpact: { aiGigsCreated: number; aiHireRate: number; revenueUplift: number };
}

export interface AdCampaign {
    id: string;
    title: string;
    clientName: string;
    creativeUrl: string;
    targetUrl: string;
    placement: 'feed' | 'sidebar' | 'forum_top';
    targetRoles: UserRole[];
    impressions: number;
    clicks: number;
    ctr: number;
    startDate: string;
    endDate: string;
    status: 'active' | 'paused' | 'draft' | 'completed';
}
