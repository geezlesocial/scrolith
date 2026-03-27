import prisma from '../utils/prismaClient';
import { ensureDefaultPageCategories } from './defaultCategorySeed.service';

const CMS_PAGES_SCOPE = 'cms_pages';
const EFFECTIVE_DATE_LABEL = 'March 27, 2026';
const SUPPORT_EMAIL = 'support@scrolith.com';
const INFO_EMAIL = 'info@scrolith.com';
const CONTACT_EMAIL = 'contact@scrolith.com';
const INVESTOR_EMAIL = 'investors@scrith.com';
const SUPPORT_URL = 'https://scrolith.com/support';
const COMPANY_NAME = 'Scrolith';
const COMPANY_ADDRESS = 'Manila, Philippines';

type PageSeed = {
  id: string;
  title: string;
  slug: string;
  aliases: string[];
  categorySlug: string;
  content: string;
  seo: {
    meta_title: string;
    meta_description: string;
    meta_keywords: string[];
  };
};

const renderSummary = (items: string[]) =>
  [
    '<section>',
    '<h2>Summary</h2>',
    '<ul>',
    ...items.map((item) => `<li>${item}</li>`),
    '</ul>',
    '</section>'
  ].join('');

const aboutPageContent = [
  `<p>${COMPANY_NAME} is building an integrated work, talent, and community platform designed for modern internet business. We combine marketplace commerce, professional identity, secure payments, messaging, discovery, and creator-led community experiences in one connected environment.</p>`,
  `<p>This page explains who we are, what we are building, and how we operate. For help with a specific account, order, payout, technical issue, or platform request, please use our support desk at <a href="${SUPPORT_URL}">${SUPPORT_URL}</a>.</p>`,
  renderSummary([
    `${COMPANY_NAME} serves freelancers, employers, creators, teams, and communities in one platform.`,
    'We focus on trust, verification, operational control, and real-time product experiences.',
    `Our base of operations is ${COMPANY_ADDRESS}.`
  ]),
  '<section><h2>What Scrolith Does</h2><p>Scrolith is designed to support the full lifecycle of online work and digital collaboration. Users can create professional profiles, publish gigs, post jobs, communicate in real time, build reputation, participate in communities, manage files and deliverables, and move funds through platform-supported payment flows.</p><p>We also support business growth use cases such as discovery, creator monetization, business pages, paid visibility, knowledge content, and platform-guided onboarding. Our goal is to reduce fragmentation between separate tools and give users a more reliable operating surface for work and opportunity.</p></section>',
  '<section><h2>Who We Serve</h2><h3>Freelancers and independent professionals</h3><p>Scrolith helps professionals showcase expertise, receive verified opportunities, manage client communication, and operate with stronger trust signals.</p><h3>Employers and hiring teams</h3><p>Employers can discover talent, publish jobs, manage proposals, hire through structured workflows, and coordinate work with more visibility and control.</p><h3>Creators and communities</h3><p>We support social discovery, audience building, live engagement, and monetization paths that connect creators to real business outcomes.</p></section>',
  '<section><h2>How We Operate</h2><p>We design the platform around product reliability, user safety, and operational accountability. This includes moderation controls, policy enforcement tooling, identity and verification workflows, financial controls, and real-time infrastructure designed to support active user sessions across web and mobile experiences.</p><p>We also maintain administrative governance layers to help manage permissions, feature rollout, content safety, notifications, configuration changes, and platform operations without disrupting existing services.</p></section>',
  '<section><h2>Trust, Safety, and Compliance</h2><p>Trust is foundational to Scrolith. Depending on the feature set in use, we may apply verification, fraud review, payout controls, moderation workflows, content enforcement, and account-level restrictions to protect users, the platform, and applicable legal or financial obligations.</p><p>Users are expected to use Scrolith responsibly, provide accurate information, comply with our platform rules, and respect the rights, privacy, and safety of others.</p></section>',
  '<section><h2>Support, Partnerships, and Investor Contact</h2><p>For general support, account assistance, and service issues, contact <a href="mailto:support@scrolith.com">support@scrolith.com</a> or use the support page at <a href="' + SUPPORT_URL + '">' + SUPPORT_URL + '</a>.</p><p>For general inquiries, contact <a href="mailto:' + INFO_EMAIL + '">' + INFO_EMAIL + '</a>. For public or business contact, use <a href="mailto:' + CONTACT_EMAIL + '">' + CONTACT_EMAIL + '</a>. For investor-related communication, use <a href="mailto:' + INVESTOR_EMAIL + '">' + INVESTOR_EMAIL + '</a>.</p></section>',
  `<section><h2>Our Location</h2><p>${COMPANY_NAME}<br/>${COMPANY_ADDRESS}</p></section>`,
  `<section><h2>Contact</h2><p>If you need help understanding our services, legal terms, privacy commitments, or refund rules, please contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p></section>`
].join('');

const termsPageContent = [
  `<p>These Terms of Service govern your access to and use of the ${COMPANY_NAME} platform, website, applications, features, content, tools, communication channels, financial workflows, and related services. By creating an account, accessing the platform, or using any Scrolith service, you agree to be bound by these Terms.</p>`,
  `<p><strong>Effective date:</strong> ${EFFECTIVE_DATE_LABEL}</p>`,
  renderSummary([
    `These Terms apply to all users of ${COMPANY_NAME}, including guests, registered users, freelancers, employers, creators, agencies, moderators, and administrators.`,
    'Use of the platform is subject to our policies, moderation standards, payment rules, and compliance workflows.',
    `If you do not agree to these Terms, do not use ${COMPANY_NAME}.`
  ]),
  '<section><h2>1. Eligibility and Account Registration</h2><p>You must provide accurate, current, and complete information when creating or maintaining an account. You are responsible for all activity under your account and for keeping your credentials secure.</p><p>You may not create or use an account on behalf of another person or entity without authorization. We may require identity verification, business verification, age confirmation, or compliance review for certain features.</p></section>',
  '<section><h2>2. Platform Services</h2><p>Scrolith provides digital tools and infrastructure that may include user profiles, jobs, gigs, proposals, contracts, messaging, file exchange, live features, creator and community tools, payments, wallets, promotional tools, analytics, content publishing, and administrative controls. Some services may be added, removed, limited, or reconfigured over time.</p><p>We may impose eligibility criteria, usage limits, moderation rules, technical constraints, or geographic restrictions where necessary for safety, compliance, operational integrity, or product quality.</p></section>',
  '<section><h2>3. User Roles and Responsibility</h2><h3>Freelancers and sellers</h3><p>You are responsible for the accuracy of your listings, pricing, delivery commitments, communications, and representations to buyers.</p><h3>Employers and buyers</h3><p>You are responsible for job scope, hiring decisions, approvals, milestone releases, and lawful use of services purchased through the platform.</p><h3>Creators and community operators</h3><p>You are responsible for the content you publish, the audiences you manage, and the way you use monetization or promotional features.</p></section>',
  '<section><h2>4. Verification, Compliance, and Risk Controls</h2><p>Scrolith may require KYC, business verification, payment review, risk checks, device review, or enhanced due diligence before allowing access to certain features such as payouts, financial transfers, monetization, promotions, or enterprise functionality.</p><p>We may delay, restrict, hold, or refuse activity that presents fraud, compliance, sanctions, abuse, security, or operational risk.</p></section>',
  '<section><h2>5. Payments, Escrow, Wallets, and Payouts</h2><p>Where available, Scrolith may support checkout, wallet balances, escrow-like fund handling, settlement, payouts, withdrawals, tips, credits, or similar financial workflows. Availability may depend on account status, region, verification, processor support, and compliance review.</p><p>You authorize us and our service providers to process transactions, apply holds, verify activity, charge fees, reverse transactions where appropriate, and comply with legal or processor obligations. You are responsible for taxes, reporting, and lawful use of funds connected to your account.</p></section>',
  '<section><h2>6. Fees and Taxes</h2><p>Scrolith may charge service fees, processing fees, promotional fees, subscription fees, currency conversion adjustments, dispute fees, or other stated platform charges. Unless stated otherwise, fees are non-refundable once the applicable platform service has been provided or consumed.</p><p>You are responsible for any taxes, duties, withholdings, reporting obligations, or regulatory requirements that apply to your activity.</p></section>',
  '<section><h2>7. Orders, Jobs, Gigs, and Deliverables</h2><p>Users must clearly describe scope, timelines, revision limits, deliverables, dependencies, and acceptance expectations before entering into paid work. Disputes may arise if either side fails to communicate clearly, complete agreed work, or respond to reasonable requests.</p><p>Scrolith may provide internal tooling for milestones, approvals, revisions, extensions, evidence gathering, and dispute review, but we do not guarantee outcome, performance, or suitability of any user or service.</p></section>',
  '<section><h2>8. Acceptable Use and Prohibited Conduct</h2><p>You may not use Scrolith to engage in fraud, deception, impersonation, harassment, spam, malware distribution, unauthorized scraping, account takeover, money laundering, sanctions evasion, illegal commerce, IP infringement, abusive automation, exploitative content, or any activity that threatens users or the platform.</p><p>You may not bypass platform controls, evade enforcement, manipulate ratings or discovery, or use the platform in ways that create material operational, legal, or reputational harm.</p></section>',
  '<section><h2>9. User Content and Licenses</h2><p>You retain ownership of content you lawfully submit to Scrolith, subject to any rights you grant to customers, counterparties, or third parties through your transactions or settings. By uploading, publishing, or transmitting content through the platform, you grant Scrolith a non-exclusive, worldwide, royalty-free license to host, store, reproduce, adapt, transmit, moderate, format, and display that content as needed to operate, secure, improve, and promote the service.</p><p>You represent that you have all rights necessary to publish your content and that such content does not violate law or third-party rights.</p></section>',
  '<section><h2>10. Intellectual Property</h2><p>The Scrolith platform, including its software, design systems, branding, marks, content structure, and service features, is owned by or licensed to Scrolith and protected by applicable law. Except where expressly permitted, you may not copy, reverse engineer, frame, resell, or exploit platform materials or technology without authorization.</p></section>',
  '<section><h2>11. Service Availability and Changes</h2><p>We may update, suspend, limit, or discontinue any feature, workflow, or integration at any time. We may also perform maintenance, emergency mitigation, security interventions, or architecture changes that affect availability or functionality.</p><p>We do not guarantee uninterrupted uptime, lossless delivery, or permanent retention of every piece of data or content.</p></section>',
  '<section><h2>12. Suspension and Termination</h2><p>We may suspend, restrict, or terminate accounts, transactions, listings, promotions, payouts, messages, content, or access to any feature if we believe doing so is necessary to protect users, enforce policy, respond to legal requirements, mitigate risk, or preserve platform integrity.</p><p>Termination does not eliminate obligations already accrued, including payment obligations, dispute review, enforcement actions, or legal compliance responsibilities.</p></section>',
  '<section><h2>13. Refunds, Chargebacks, and Disputes</h2><p>Refunds are governed by our Refund Policy and applicable transaction rules. Filing a chargeback, initiating payment reversal abuse, or attempting to bypass dispute channels may result in account restrictions or recovery action where permitted by law.</p><p>For help, use our support page at <a href="' + SUPPORT_URL + '">' + SUPPORT_URL + '</a>.</p></section>',
  '<section><h2>14. Disclaimers</h2><p>Scrolith is provided on an &quot;as is&quot; and &quot;as available&quot; basis to the maximum extent permitted by law. We do not guarantee that the platform will always be secure, error-free, uninterrupted, suitable for your needs, or free from third-party misconduct.</p></section>',
  '<section><h2>15. Limitation of Liability</h2><p>To the maximum extent permitted by law, Scrolith and its affiliates, officers, employees, contractors, and service providers will not be liable for indirect, incidental, consequential, special, exemplary, or punitive damages, or for loss of profits, data, goodwill, opportunity, or business interruption arising out of or related to your use of the platform.</p><p>Where liability cannot be excluded, it will be limited to the amount you paid to Scrolith for the relevant service during the twelve months before the event giving rise to the claim, or one hundred United States dollars, whichever is greater.</p></section>',
  '<section><h2>16. Indemnification</h2><p>You agree to defend, indemnify, and hold harmless Scrolith and its affiliates from claims, losses, liabilities, damages, costs, and expenses arising from your content, conduct, transactions, misuse of the platform, or violation of these Terms or applicable law.</p></section>',
  '<section><h2>17. Governing Law</h2><p>These Terms are governed by the laws of the Republic of the Philippines, without regard to conflict-of-law rules, except where mandatory law requires otherwise. You agree that disputes may be resolved in the courts or dispute forums with jurisdiction over Scrolith or the applicable transaction, subject to mandatory consumer protections.</p></section>',
  '<section><h2>18. Changes to These Terms</h2><p>We may update these Terms from time to time. Material changes may be published through the platform, by email, by in-product notice, or through other reasonable notice methods. Your continued use of the platform after changes take effect constitutes acceptance of the updated Terms.</p></section>',
  `<section><h2>19. Contact</h2><p>${COMPANY_NAME}<br/>${COMPANY_ADDRESS}</p><p>Email: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>, <a href="mailto:${INFO_EMAIL}">${INFO_EMAIL}</a>, <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>, <a href="mailto:${INVESTOR_EMAIL}">${INVESTOR_EMAIL}</a></p><p>Support: <a href="${SUPPORT_URL}">${SUPPORT_URL}</a></p></section>`
].join('');

const privacyPageContent = [
  `<p>This Privacy Policy explains how ${COMPANY_NAME} collects, uses, shares, stores, and protects personal data when you use our website, applications, communications, payment flows, support channels, and related services.</p>`,
  `<p><strong>Effective date:</strong> ${EFFECTIVE_DATE_LABEL}</p>`,
  renderSummary([
    'We collect information needed to operate accounts, transactions, support, trust, safety, and platform improvement.',
    'We may use third-party processors, infrastructure providers, analytics tools, and compliance partners.',
    'Users may have privacy rights depending on their jurisdiction.'
  ]),
  '<section><h2>1. Information We Collect</h2><h3>Information you provide directly</h3><p>This may include your name, email address, username, profile details, business information, support requests, payment-related details, verification submissions, transaction details, uploaded files, messages, and other content you choose to provide.</p><h3>Information collected automatically</h3><p>We may collect device information, browser and application details, IP address, log data, session and event data, usage metrics, referral information, cookies, and similar technologies used to secure and improve the platform.</p><h3>Information from third parties</h3><p>We may receive information from payment processors, verification providers, anti-fraud services, analytics partners, advertising partners, social login providers, and other integration providers.</p></section>',
  '<section><h2>2. How We Use Personal Data</h2><p>We use personal data to provide and maintain the platform, authenticate users, process transactions, deliver support, enforce policies, manage disputes, prevent fraud, improve performance, personalize experiences, communicate with users, and comply with legal obligations.</p><p>Where permitted, we may also use data for product development, service analytics, security investigation, and legitimate marketing or business operations.</p></section>',
  '<section><h2>3. Legal Bases for Processing</h2><p>Depending on your jurisdiction, we may process personal data based on contractual necessity, legitimate interests, legal obligation, consent, vital interests, public interest, or other lawful bases recognized under applicable law.</p></section>',
  '<section><h2>4. Cookies and Similar Technologies</h2><p>We may use cookies, pixels, SDKs, local storage, and similar technologies for login state, fraud prevention, preferences, analytics, performance monitoring, campaign attribution, and service functionality. Some tools are necessary for core operations, while others help us understand and improve product performance.</p></section>',
  '<section><h2>5. Payments, Verification, and Compliance Data</h2><p>If you use payment, wallet, payout, monetization, or verification features, we or our processors may collect and process data needed for onboarding, transaction handling, compliance checks, tax or sanctions screening, KYC review, anti-money laundering controls, fraud monitoring, and settlement.</p><p>Some of this information may be processed by specialized third-party providers acting on our behalf or under their own compliance obligations.</p></section>',
  '<section><h2>6. How We Share Information</h2><p>We may share information with service providers, cloud infrastructure providers, payment processors, verification partners, communications vendors, analytics providers, legal advisors, auditors, affiliates, and public authorities where necessary to operate the platform or comply with law.</p><p>We may also share limited profile or transaction-related information with other users where required to facilitate orders, proposals, contracts, reputation systems, moderation, dispute resolution, or business workflows.</p></section>',
  '<section><h2>7. International Data Transfers</h2><p>Your information may be processed in jurisdictions other than your own. Where required, we use appropriate safeguards for cross-border transfers, including contractual protections and vendor controls, while acknowledging that legal protections may differ by jurisdiction.</p></section>',
  '<section><h2>8. Data Retention</h2><p>We retain data for as long as necessary to provide services, maintain records, enforce agreements, resolve disputes, prevent abuse, comply with law, and support legitimate business needs. Retention periods may vary by data type, legal obligation, risk profile, and operational need.</p></section>',
  '<section><h2>9. Security</h2><p>We use administrative, technical, and organizational safeguards intended to protect personal data. These may include access controls, audit logging, monitoring, encryption in transit where supported, moderation tooling, workflow controls, and incident management practices. No system is completely secure, and users should also take steps to protect their credentials and devices.</p></section>',
  '<section><h2>10. Your Rights and Choices</h2><p>Depending on applicable law, you may have rights to access, correct, update, delete, restrict, object to, or port certain personal data, and to withdraw consent where processing depends on consent. You may also have the right to lodge a complaint with a competent authority.</p><p>Some rights may be limited where data must be retained for security, legal, contractual, financial, or fraud-prevention reasons.</p></section>',
  '<section><h2>11. Children and Minors</h2><p>Scrolith is not intended for children below the age required by applicable law to use our services independently. If we learn that personal data was collected in violation of this standard, we may take steps to delete or restrict the relevant account and information.</p></section>',
  '<section><h2>12. Third-Party Services and Links</h2><p>The platform may contain links to third-party sites, services, embedded tools, and processors. Their privacy practices are governed by their own notices and policies, not this Privacy Policy.</p></section>',
  '<section><h2>13. Changes to This Policy</h2><p>We may update this Privacy Policy as our services, vendors, legal obligations, or processing activities evolve. Material changes may be communicated through the platform or by other reasonable notice methods.</p></section>',
  `<section><h2>14. Contact Us</h2><p>${COMPANY_NAME}<br/>${COMPANY_ADDRESS}</p><p>Privacy and support inquiries: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p><p>General inquiries: <a href="mailto:${INFO_EMAIL}">${INFO_EMAIL}</a> and <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p><p>Support page: <a href="${SUPPORT_URL}">${SUPPORT_URL}</a></p></section>`
].join('');

const refundPolicyContent = [
  `<p>This Refund Policy describes how ${COMPANY_NAME} handles refund requests, service reversals, disputes, credits, and related transaction issues across platform-supported purchases and financial workflows.</p>`,
  `<p><strong>Effective date:</strong> ${EFFECTIVE_DATE_LABEL}</p>`,
  renderSummary([
    'Refunds are not automatic and are reviewed against the transaction type, delivery status, evidence, and platform rules.',
    'Some fees, completed services, promotional purchases, and compliance-related charges may be non-refundable.',
    `Users should contact support through <a href="${SUPPORT_URL}">${SUPPORT_URL}</a> as early as possible.`
  ]),
  '<section><h2>1. Scope</h2><p>This policy applies to eligible transactions facilitated through Scrolith, including certain gig, job, service, promotional, subscription, or wallet-related transactions where a refund workflow exists. Availability may depend on the payment method, processor, region, transaction type, and account status.</p></section>',
  '<section><h2>2. General Refund Principles</h2><p>Refund decisions are based on transaction records, order status, milestone status, communications, evidence submitted by the parties, applicable processor requirements, platform rules, and risk or compliance constraints.</p><p>We may deny a refund where a service has already been delivered or substantially consumed, where the buyer approved completion, where policy violations or fraud are involved, or where the payment method does not support reversal.</p></section>',
  '<section><h2>3. Marketplace Orders, Gigs, and Services</h2><p>A refund may be considered where a seller does not deliver, materially departs from agreed scope, fails to respond within a reasonable period, or where both parties agree to cancel the work. Partial refunds may be used where part of the work has been completed or approved.</p><p>Refunds are less likely where the buyer changes requirements after work begins, fails to provide necessary inputs, delays approval unreasonably, or accepts delivery without timely objection.</p></section>',
  '<section><h2>4. Jobs, Contracts, and Milestones</h2><p>Where milestones or contract funding flows are used, refund outcomes may depend on approval status, work evidence, communications, dispute findings, and the underlying payment or payout state. Approved or released funds may not always be recoverable.</p></section>',
  '<section><h2>5. Fees, Subscriptions, Promotions, and Ad Spend</h2><p>Processing fees, platform fees, verification fees, promotional placements, ad purchases, and subscription charges are generally non-refundable once consumed, activated, delivered, or used, except where required by law or expressly stated otherwise.</p><p>If a promotional or subscription service was not delivered due to a verified platform fault, we may provide a refund, service credit, replacement run, or reasonable corrective action.</p></section>',
  '<section><h2>6. Wallet Balances, Credits, and Payout States</h2><p>Wallet entries, credits, pending clearances, settlement states, and internal balances may reflect processor timing, review holds, fraud controls, dispute states, or compliance obligations. A visible balance does not guarantee immediate refundability or withdrawal eligibility.</p></section>',
  '<section><h2>7. Fraud, Unauthorized Activity, and Chargebacks</h2><p>If you suspect unauthorized activity, contact us immediately. We may place holds, investigate the transaction, request evidence, limit account access, or work with processors and authorities as needed. Abuse of chargebacks, false claims, or intentional refund fraud may lead to account restrictions or recovery action.</p></section>',
  '<section><h2>8. How to Request a Refund</h2><p>Submit a support request through <a href="' + SUPPORT_URL + '">' + SUPPORT_URL + '</a> and include the relevant order, job, contract, or transaction details, together with a clear explanation and supporting evidence. Delays in reporting may limit our ability to investigate or assist effectively.</p></section>',
  '<section><h2>9. Review and Processing Time</h2><p>We aim to review refund-related requests as promptly as practical, but timing varies based on complexity, evidence, counterparty response, processor review, compliance checks, and weekends or holidays. Approved refunds may also take additional time to appear depending on the original payment method.</p></section>',
  `<section><h2>10. Contact</h2><p>Refund and payment support: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p><p>Support portal: <a href="${SUPPORT_URL}">${SUPPORT_URL}</a></p><p>${COMPANY_NAME}<br/>${COMPANY_ADDRESS}</p></section>`
].join('');

const DEFAULT_STATIC_PAGE_SEEDS: PageSeed[] = [
  {
    id: 'static-page-about',
    title: 'About Scrolith',
    slug: 'about',
    aliases: ['about-us', 'company'],
    categorySlug: 'public-marketing-pages',
    content: aboutPageContent,
    seo: {
      meta_title: 'About Scrolith',
      meta_description:
        'Learn what Scrolith is building, who we serve, how the platform works, and how to contact our team.',
      meta_keywords: ['Scrolith', 'about Scrolith', 'company', 'marketplace', 'freelance platform']
    }
  },
  {
    id: 'static-page-terms',
    title: 'Terms of Service',
    slug: 'terms',
    aliases: ['terms-of-service'],
    categorySlug: 'legal-policy-pages',
    content: termsPageContent,
    seo: {
      meta_title: 'Terms of Service | Scrolith',
      meta_description:
        'Read the Terms of Service governing access to Scrolith, including accounts, payments, content, and platform use.',
      meta_keywords: ['terms of service', 'Scrolith terms', 'platform agreement', 'user terms']
    }
  },
  {
    id: 'static-page-privacy',
    title: 'Privacy Policy',
    slug: 'privacy',
    aliases: ['privacy-policy', 'private-policy'],
    categorySlug: 'legal-policy-pages',
    content: privacyPageContent,
    seo: {
      meta_title: 'Privacy Policy | Scrolith',
      meta_description:
        'Read how Scrolith collects, uses, protects, and shares personal data across our platform and services.',
      meta_keywords: ['privacy policy', 'Scrolith privacy', 'data protection', 'personal data']
    }
  },
  {
    id: 'static-page-refund-policy',
    title: 'Refund Policy',
    slug: 'refund-policy',
    aliases: ['refund', 'refunds'],
    categorySlug: 'legal-policy-pages',
    content: refundPolicyContent,
    seo: {
      meta_title: 'Refund Policy | Scrolith',
      meta_description:
        'Read the Scrolith Refund Policy covering service reversals, disputes, credits, and eligible transaction refunds.',
      meta_keywords: ['refund policy', 'Scrolith refunds', 'payment disputes', 'service refunds']
    }
  }
];

const normalizeSlug = (value: unknown) => String(value || '').trim().toLowerCase();

const matchesSeed = (page: any, seed: PageSeed) => {
  const slug = normalizeSlug(page?.slug);
  return [seed.slug, ...seed.aliases].includes(slug);
};

export const resolveDefaultStaticPageSlug = (slug: string) => {
  const normalized = normalizeSlug(slug);
  const seed = DEFAULT_STATIC_PAGE_SEEDS.find((entry) => entry.slug === normalized || entry.aliases.includes(normalized));
  return seed?.slug || normalized;
};

const buildSeedPage = (seed: PageSeed, categoryId: string) => {
  const timestamp = new Date().toISOString();
  return {
    id: seed.id,
    title: seed.title,
    slug: seed.slug,
    content: seed.content,
    blocks: [],
    status: 'PUBLISHED',
    visibility: 'public',
    categoryId,
    category_id: categoryId,
    seo: {
      ...seed.seo,
      metaTitle: seed.seo.meta_title,
      metaDescription: seed.seo.meta_description,
      metaKeywords: seed.seo.meta_keywords
    },
    images: [],
    videos: [],
    updatedAt: timestamp,
    updated_at: timestamp,
    createdAt: timestamp,
    created_at: timestamp
  };
};

export const ensureDefaultStaticPages = async () => {
  const [record, categories] = await Promise.all([
    prisma.appSetting.findUnique({ where: { scope: CMS_PAGES_SCOPE } }),
    ensureDefaultPageCategories()
  ]);

  const currentData = record?.data as Record<string, any> | null;
  const existingPages = Array.isArray(currentData?.pages) ? currentData?.pages : [];
  const categoryIdBySlug = new Map(
    (Array.isArray(categories) ? categories : []).map((category: any) => [normalizeSlug(category?.slug), String(category?.id || '')])
  );

  const nextPages = [...existingPages];
  let mutated = false;

  for (const seed of DEFAULT_STATIC_PAGE_SEEDS) {
    const exists = nextPages.some((page) => matchesSeed(page, seed));
    if (exists) continue;

    const categoryId = categoryIdBySlug.get(seed.categorySlug) || '';
    nextPages.push(buildSeedPage(seed, categoryId));
    mutated = true;
  }

  if (mutated || !record) {
    const nextData = { ...(currentData || {}), pages: nextPages };
    await prisma.appSetting.upsert({
      where: { scope: CMS_PAGES_SCOPE },
      create: { scope: CMS_PAGES_SCOPE, data: nextData },
      update: { data: nextData }
    });
  }

  return nextPages;
};

export const findStaticPageBySlug = async (slug: string) => {
  const pages = await ensureDefaultStaticPages();
  const canonicalSlug = resolveDefaultStaticPageSlug(slug);
  const acceptedSlugs = new Set<string>([canonicalSlug]);

  const seed = DEFAULT_STATIC_PAGE_SEEDS.find((entry) => entry.slug === canonicalSlug);
  if (seed) {
    seed.aliases.forEach((alias) => acceptedSlugs.add(alias));
  }

  return pages.find((page: any) => acceptedSlugs.has(normalizeSlug(page?.slug))) || null;
};

export const DEFAULT_POLICY_PAGE_SLUGS = new Set(['terms', 'privacy']);
