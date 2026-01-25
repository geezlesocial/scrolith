import { Gig, Job, ListingCategory, Plan } from '../types';

export const mockGigs: Gig[] = [
  {
    id: 'gig-1',
    title: 'I will design a modern logo for your brand',
    description: 'I will create a unique and professional logo design for your business. Specializing in modern, minimalistic designs that communicate your brand values effectively.',
    category: 'Graphics & Design',
    subcategory: 'Logo Design',
    price: 50,
    pricingMode: 'packages',
    packages: [
      {
        name: 'Basic',
        description: 'Simple logo design with 2 concepts',
        deliveryDays: 3,
        revisions: 1,
        price: 50,
        features: ['1 Logo Concept', 'Basic Source File', '72hrs Delivery']
      },
      {
        name: 'Standard',
        description: 'Professional logo with multiple concepts',
        deliveryDays: 5,
        revisions: 3,
        price: 100,
        features: ['3 Logo Concepts', 'Source Files', 'Social Media Kit']
      },
      {
        name: 'Premium',
        description: 'Complete branding package',
        deliveryDays: 7,
        revisions: -1,
        price: 200,
        features: ['Unlimited Concepts', 'All Source Files', 'Brand Guidelines', 'Stationery Design']
      }
    ],
    extras: [
      {
        id: 'extra-1',
        title: 'Fast Delivery',
        description: 'Get your design in 24 hours',
        price: 20,
        additionalDays: 0,
        appliesTo: 'all'
      }
    ],
    faqs: [
      {
        id: 'faq-1',
        question: 'Do you provide source files?',
        answer: 'Yes, all source files (AI, EPS, PNG, JPG) are included in all packages.'
      }
    ],
    requirements: [
      {
        id: 'req-1',
        question: 'What is your company name?',
        type: 'text',
        required: true
      }
    ],
    images: [
      'https://picsum.photos/800/600?random=1',
      'https://picsum.photos/800/600?random=2'
    ],
    videos: [],
    documents: [],
    freelancerName: 'Alex Johnson',
    freelancerId: 'user-1',
    freelancerAvatar: 'https://i.pravatar.cc/150?img=1',
    status: 'active',
    adminStatus: 'approved',
    rating: 4.9,
    reviews: 127,
    views: 1250,
    clicks: 340,
    ordersCount: 89,
    isVisible: true,
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-03-20T14:15:00Z'
  },
  // Add more mock gigs...
];

export const mockJobs: Job[] = [
  {
    id: 'job-1',
    title: 'React Developer Needed for E-commerce Project',
    description: 'We are looking for an experienced React developer to build a modern e-commerce dashboard. Must have experience with TypeScript, Redux, and Material-UI.',
    budget: '$5,000 - $10,000',
    type: 'fixed',
    category: 'Programming & Tech',
    subcategory: 'Web Development',
    tags: ['React', 'TypeScript', 'Redux', 'Material-UI'],
    status: 'active',
    adminStatus: 'approved',
    employerName: 'TechCorp Inc.',
    employerId: 'employer-1',
    postedTime: '2 days ago',
    applications: 24,
    isRemote: true,
    location: 'Remote',
    duration: '3-6 months',
    skills: ['React', 'TypeScript', 'Redux', 'Material-UI', 'REST APIs'],
    experienceLevel: 'intermediate',
    createdAt: '2024-03-18T09:00:00Z',
    updatedAt: '2024-03-18T09:00:00Z'
  }
];

export const mockCategories: ListingCategory[] = [
  {
    id: 'cat-1',
    name: 'Graphics & Design',
    slug: 'graphics-design',
    type: 'gig',
    status: 'active',
    count: 1245,
    sortOrder: 1,
    subcategories: [
      {
        id: 'sub-1',
        name: 'Logo Design',
        slug: 'logo-design',
        status: 'active',
        sortOrder: 1,
        icon: 'https://cdn-icons-png.flaticon.com/512/732/732004.png'
      },
      {
        id: 'sub-2',
        name: 'Brand Style Guides',
        slug: 'brand-style-guides',
        status: 'active',
        sortOrder: 2,
        icon: 'https://cdn-icons-png.flaticon.com/512/2972/2972544.png'
      }
    ],
    description: 'Design services including logos, branding, and graphics',
    logo: 'https://cdn-icons-png.flaticon.com/512/2972/2972544.png'
  }
];

export const mockPlans: Plan[] = [
  {
    id: 'plan-1',
    name: 'Freelancer Basic',
    type: 'freelancer',
    price: 9.99,
    interval: 'monthly',
    currency: 'USD',
    isActive: true,
    isPopular: false,
    features: [
      { id: 'ft-1', name: '5 Active Gigs', included: true },
      { id: 'ft-2', name: 'Basic Analytics', included: true },
      { id: 'ft-3', name: '24/7 Support', included: false }
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  }
];