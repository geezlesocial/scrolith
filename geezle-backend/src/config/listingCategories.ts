export interface StandardListingCategory {
  name: string;
  description: string;
  subcategories: string[];
}

export const STANDARD_LISTING_CATEGORIES: StandardListingCategory[] = [
  {
    name: 'Graphic & Visual Design',
    description: 'Creative design services for brand, product, and digital experiences.',
    subcategories: [
      'Logo Design',
      'Brand Identity',
      'Social Media Graphics',
      'Infographics',
      'Packaging Design',
      'Illustration',
      'Character Design',
      'UI/UX Design (Wireframing & Mockups)',
      'Presentation Design',
      'Print Design (Flyers, Brochures, Posters)'
    ]
  },
  {
    name: 'Digital Marketing',
    description: 'Audience growth, campaign execution, and measurable marketing performance.',
    subcategories: [
      'Social Media Management',
      'Facebook & Instagram Ads',
      'Google Ads (Search, Display, YouTube)',
      'SEO (On-Page, Technical, Local)',
      'Email Marketing',
      'Content Strategy',
      'Influencer Outreach',
      'Marketing Analytics & Reporting',
      'Conversion Rate Optimization (CRO)',
      'Affiliate Marketing Setup'
    ]
  },
  {
    name: 'Writing & Content Creation',
    description: 'Content production for web, editorial, technical, and creative needs.',
    subcategories: [
      'Blog Writing',
      'Website Copywriting',
      'Product Descriptions',
      'Scriptwriting (Video, YouTube, Film)',
      'E-books & Whitepapers',
      'Resume & LinkedIn Writing',
      'Creative Writing (Fiction, Poetry)',
      'Technical Writing',
      'Proofreading & Editing',
      'Transcription (Audio/Video to Text)'
    ]
  },
  {
    name: 'Web, Mobile & Software Development',
    description: 'Modern software delivery across web, mobile, API, backend, and DevOps.',
    subcategories: [
      'Website Development (HTML, CSS, JS)',
      'WordPress Development',
      'E-commerce (Shopify, WooCommerce, Magento)',
      'Custom Web Apps (React, Vue, Angular)',
      'Mobile App Development (iOS, Android, Flutter, React Native)',
      'API Integration',
      'Frontend Development',
      'Backend Development (Node.js, Laravel, Django)',
      'DevOps & Deployment',
      'QA & Software Testing'
    ]
  },
  {
    name: 'Video & Animation',
    description: 'Video production, editing, animation, and visual storytelling.',
    subcategories: [
      'Video Editing (YouTube, TikTok, Reels, Ads)',
      'Motion Graphics',
      'Explainer Videos',
      '2D/3D Animation',
      'Whiteboard Animation',
      'Logo Animation',
      'Subtitling & Captioning',
      'Drone Footage Editing',
      'Color Grading & Visual Effects (VFX)',
      'Screen Recording & Tutorials'
    ]
  },
  {
    name: 'Audio & Music',
    description: 'Audio production services for voice, music, podcasts, and sound design.',
    subcategories: [
      'Voice Over (Commercials, Narration, Characters)',
      'Music Production',
      'Jingle & Sound Logo Creation',
      'Podcast Editing',
      'Audio Mixing & Mastering',
      'Sound Effects Design',
      'Songwriting',
      'Instrumental Recording',
      'Audiobook Narration',
      'Transcription (Audio to Text)'
    ]
  },
  {
    name: 'Business & Consulting',
    description: 'Business strategy, operations, finance, legal, and administrative support.',
    subcategories: [
      'Business Plan Writing',
      'Financial Modeling & Forecasting',
      'Market Research',
      'Startup Consulting',
      'Legal Consulting (General, Contracts, TOS)',
      'HR & Recruitment Support',
      'Project Management',
      'Virtual Assistant Services',
      'Customer Support Setup',
      'Operational Efficiency Consulting'
    ]
  },
  {
    name: 'E-Commerce & Sales',
    description: 'Store growth services for marketplaces, funnels, CRM, and retention.',
    subcategories: [
      'Product Listing Optimization',
      'Amazon FBA Management',
      'Shopify Store Setup',
      'Dropshipping Store Build',
      'Inventory Management',
      'Sales Funnel Creation',
      'CRM Setup (HubSpot, Zoho, Salesforce)',
      'Pricing Strategy',
      'Customer Retention Campaigns',
      'E-commerce SEO'
    ]
  },
  {
    name: 'Data, AI & Engineering',
    description: 'Data workflows, ML, AI systems, automation, and engineering tooling.',
    subcategories: [
      'Data Entry & Cleaning',
      'Data Analysis (Excel, Python, R)',
      'Machine Learning Models',
      'AI Prompt Engineering',
      'Chatbot Development',
      'Database Design (MySQL, PostgreSQL)',
      'IoT Solutions',
      'CAD & 3D Modeling (Engineering, Architecture)',
      'Scientific Research Assistance',
      'Automation Scripts (Python, Zapier)'
    ]
  },
  {
    name: 'Translation & Languages',
    description: 'Translation, localization, tutoring, and language quality services.',
    subcategories: [
      'General Translation (EN <-> ES, FR, AR, ZH, etc.)',
      'Legal & Medical Translation',
      'Website & App Localization',
      'Subtitle Translation',
      'Multilingual Proofreading',
      'Language Tutoring',
      'Transcreation (Culturally Adapted Content)',
      'Voice Dubbing',
      'Resume Translation',
      'Certified Translation Services'
    ]
  },
  {
    name: 'Photography',
    description: 'Photography production, retouching, and image optimization services.',
    subcategories: [
      'Product Photography',
      'Portrait & Headshots',
      'Real Estate Photography',
      'Event Photography',
      'Photo Editing & Retouching',
      'Stock Photography',
      'Drone Photography',
      'Lifestyle Photography',
      'E-commerce Image Optimization',
      'Color Correction'
    ]
  },
  {
    name: 'Customer Service & Support',
    description: 'Customer operations including support channels, onboarding, and systems.',
    subcategories: [
      'Live Chat Support',
      'Email Support Management',
      'Phone Support (Virtual)',
      'Help Desk Setup (Zendesk, Freshdesk)',
      'FAQ & Knowledge Base Creation',
      'Customer Feedback Analysis',
      'Multilingual Support',
      'Ticketing System Management',
      'CRM Data Entry',
      'Customer Onboarding Flows'
    ]
  }
];
