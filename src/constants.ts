
import {
    Contract, TimeEntry, Currency, ListingCategory, Gig, Job, Order,
    WalletTransaction, Affiliate, Coupon, MarketingCampaign, Conversation,
    KYCDocument, UserRole, TransactionType
} from './types';

export const INITIAL_CURRENCIES: Currency[] = [
    { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1, isActive: true, isDefault: true },
    { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.92, isActive: true },
    { code: 'GBP', name: 'British Pound', symbol: '£', rate: 0.79, isActive: true },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥', rate: 150.5, isActive: true },
    { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', rate: 7.19, isActive: true },
    { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr', rate: 0.88, isActive: true },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', rate: 1.35, isActive: true },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', rate: 1.52, isActive: true },
    { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', rate: 1.34, isActive: true },
    { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', rate: 7.82, isActive: true },
    { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', rate: 1.63, isActive: true },
    { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', rate: 1500, isActive: true },
    { code: 'KRW', name: 'South Korean Won', symbol: '₩', rate: 1330, isActive: true },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹', rate: 83.5, isActive: true },
    { code: 'PHP', name: 'Philippine Peso', symbol: '₱', rate: 56.2, isActive: true },
    { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', rate: 135, isActive: true },
    { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', rate: 15600, isActive: true },
    { code: 'THB', name: 'Thai Baht', symbol: '฿', rate: 36.1, isActive: true },
    { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', rate: 4.75, isActive: true },
    { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', rate: 24600, isActive: true },
    { code: 'MXN', name: 'Mexican Peso', symbol: '$', rate: 16.8, isActive: true },
    { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', rate: 5.05, isActive: true },
    { code: 'ZAR', name: 'South African Rand', symbol: 'R', rate: 18.9, isActive: true },
    { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', rate: 3.75, isActive: true },
    { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', rate: 3.67, isActive: true },
    { code: 'TRY', name: 'Turkish Lira', symbol: '₺', rate: 31.5, isActive: true },
];

export const CATEGORIES: ListingCategory[] = [
    { id: '1', name: 'Development', slug: 'development', type: 'gig', status: 'active', count: 120, sortOrder: 1, subcategories: [] },
    { id: '2', name: 'Design', slug: 'design', type: 'gig', status: 'active', count: 85, sortOrder: 2, subcategories: [] },
    { id: '3', name: 'Marketing', slug: 'marketing', type: 'gig', status: 'active', count: 60, sortOrder: 3, subcategories: [] },
    { id: '4', name: 'Writing', slug: 'writing', type: 'gig', status: 'active', count: 45, sortOrder: 4, subcategories: [] },
    { id: '5', name: 'Video', slug: 'video', type: 'gig', status: 'active', count: 30, sortOrder: 5, subcategories: [] },
    { id: '6', name: 'AI Services', slug: 'ai-services', type: 'gig', status: 'active', count: 50, sortOrder: 6, subcategories: [] }
];

export const MOCK_GIGS: Gig[] = [
    {
        id: 'g1',
        title: 'I will build a modern React website',
        freelancerName: 'Dev Mike',
        freelancerAvatar: 'https://ui-avatars.com/api/?name=Dev+Mike',
        price: 300,
        rating: 4.9,
        reviews: 120,
        image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=400&q=80',
        category: 'Development',
        status: 'active',
        isActive: true,
        isVisible: true,
        freelancerId: 'free-2',
        description: 'Professional React development services.',
        packages: [
            { name: 'Basic', description: 'Single page app', deliveryDays: 3, revisions: 1, price: 300, features: ['Responsive Design'] },
            { name: 'Standard', description: 'Up to 5 pages', deliveryDays: 7, revisions: 3, price: 600, features: ['Responsive Design', 'SEO Optimization'] },
            { name: 'Premium', description: 'Full functionality', deliveryDays: 14, revisions: -1, price: 1200, features: ['Responsive Design', 'SEO', 'Admin Panel'] }
        ]
    },
    {
        id: 'g2',
        title: 'I will design a stunning logo',
        freelancerName: 'Sarah Art',
        freelancerAvatar: 'https://ui-avatars.com/api/?name=Sarah+Art',
        price: 50,
        rating: 4.8,
        reviews: 85,
        image: 'https://images.unsplash.com/photo-1626785774573-4b799314346d?auto=format&fit=crop&w=400&q=80',
        category: 'Design',
        status: 'active',
        isActive: true,
        isVisible: true,
        freelancerId: 'free-3',
        description: 'I will create a unique, modern, and minimalist logo for your business.',
        packages: [
            { name: 'Basic', description: '1 Logo Concept', deliveryDays: 2, revisions: 2, price: 50, features: ['High Resolution'] }
        ]
    },
    {
        id: 'g3',
        title: 'I will write SEO optimized blog posts',
        freelancerName: 'Writer Jane',
        freelancerAvatar: 'https://ui-avatars.com/api/?name=Writer+Jane',
        price: 30,
        rating: 5.0,
        reviews: 42,
        image: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=400&q=80',
        category: 'Writing',
        status: 'active',
        isActive: true,
        isVisible: true,
        freelancerId: 'free-4',
        description: 'High quality SEO optimized articles and blog posts on any topic.',
        packages: [
            { name: 'Basic', description: '500 words article', deliveryDays: 2, revisions: 1, price: 30, features: ['SEO Keywords'] }
        ]
    },
    {
        id: 'g4',
        title: 'I will create explainer videos',
        freelancerName: 'Motion Tom',
        freelancerAvatar: 'https://ui-avatars.com/api/?name=Motion+Tom',
        price: 150,
        rating: 4.7,
        reviews: 28,
        image: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=400&q=80',
        category: 'Video',
        status: 'active',
        isActive: true,
        isVisible: true,
        freelancerId: 'free-5',
        description: 'Engaging explainer videos to boost your sales and conversions.',
        packages: [
            { name: 'Basic', description: '30 seconds video', deliveryDays: 5, revisions: 2, price: 150, features: ['Background Music'] }
        ]
    }
];

export const MOCK_JOBS: Job[] = [
    {
        id: 'j1',
        title: 'Frontend Developer Needed for E-commerce',
        clientName: 'Shopify Store Owner',
        budget: '$1000 - $2000',
        type: 'Fixed Price',
        postedTime: '2 hours ago',
        description: 'Looking for an experienced React developer to build a custom storefront.',
        tags: ['React', 'Shopify', 'Tailwind'],
        proposals: 5,
        status: 'active',
        isActive: true,
        isVisible: true,
        category: 'Development'
    },
    {
        id: 'j2',
        title: 'Logo Redesign for Tech Startup',
        clientName: 'TechFlow Inc.',
        budget: '$200 - $500',
        type: 'Fixed Price',
        postedTime: '5 hours ago',
        description: 'We need a modern, minimalist logo for our AI startup.',
        tags: ['Logo Design', 'Illustrator', 'Branding'],
        proposals: 12,
        status: 'active',
        isActive: true,
        isVisible: true,
        category: 'Design'
    },
    {
        id: 'j3',
        title: 'Content Writer for Travel Blog',
        clientName: 'Wanderlust Media',
        budget: '$0.10 / word',
        type: 'Hourly',
        postedTime: '1 day ago',
        description: 'Ongoing work for a travel enthusiast who can write engaging articles.',
        tags: ['Writing', 'SEO', 'Travel'],
        proposals: 20,
        status: 'active',
        isActive: true,
        isVisible: true,
        category: 'Writing'
    }
];

export const MOCK_ORDERS: Order[] = [
    {
        id: 'o1',
        gigTitle: 'I will build a modern React website',
        clientId: 'client-1',
        clientName: 'John Buyer',
        freelancerId: 'u1',
        freelancerName: 'Me',
        amount: 300,
        status: 'Active',
        escrowStatus: 'Funded',
        dateOrdered: '2023-10-25',
        dueDate: '2023-11-01'
    },
    {
        id: 'o2',
        gigTitle: 'I will design a stunning logo',
        clientId: 'client-2',
        clientName: 'Alice Corp',
        freelancerId: 'u1',
        freelancerName: 'Me',
        amount: 50,
        status: 'Completed',
        escrowStatus: 'Released',
        dateOrdered: '2023-10-15',
        dueDate: '2023-10-18'
    },
    {
        id: 'o3',
        gigTitle: 'I will write SEO optimized blog posts',
        clientId: 'client-3',
        clientName: 'Blog Master',
        freelancerId: 'u1',
        freelancerName: 'Me',
        amount: 90,
        status: 'Delivered',
        escrowStatus: 'Funded',
        dateOrdered: '2023-10-28',
        dueDate: '2023-10-30'
    }
];

export const MOCK_CONTRACTS: Contract[] = [
    {
        id: 'cnt-101',
        title: 'Ongoing Frontend Development',
        clientId: 'u1', // Matches John Client in conversations
        clientName: 'John Client',
        freelancerId: 'free-2', // Dev Mike
        freelancerName: 'Dev Mike',
        type: 'hourly',
        hourlyRate: 45,
        paymentCycle: 'weekly',
        status: 'active',
        totalHoursLogged: 12.5,
        totalPaid: 450,
        startDate: '2023-10-01',
        description: 'React development for e-commerce platform.'
    },
    {
        id: 'cnt-102',
        title: 'Mobile App UI Design',
        clientId: 'client-5',
        clientName: 'AppWorks Inc.',
        freelancerId: 'u1', // Matches default Freelancer login ID
        freelancerName: 'Me',
        type: 'hourly',
        hourlyRate: 65,
        paymentCycle: 'bi-weekly',
        status: 'active',
        totalHoursLogged: 5.0,
        totalPaid: 0,
        startDate: '2023-11-01',
        description: 'UI/UX design for new iOS app.'
    }
];

export const MOCK_TIME_ENTRIES: TimeEntry[] = [
    {
        id: 'te-1',
        contractId: 'cnt-101',
        freelancerId: 'free-2',
        startTime: '2023-10-30T09:00:00Z',
        endTime: '2023-10-30T11:30:00Z',
        durationMinutes: 150,
        description: 'Implemented checkout flow logic.',
        status: 'approved',
        earnings: 112.50
    },
    {
        id: 'te-2',
        contractId: 'cnt-101',
        freelancerId: 'free-2',
        startTime: '2023-10-31T14:00:00Z',
        endTime: '2023-10-31T16:00:00Z',
        durationMinutes: 120,
        description: 'Debugging payment gateway integration.',
        status: 'pending',
        earnings: 90.00
    },
    {
        id: 'te-3',
        contractId: 'cnt-102',
        freelancerId: 'u1',
        startTime: '2023-11-02T10:00:00Z',
        endTime: '2023-11-02T12:00:00Z',
        durationMinutes: 120,
        description: 'Initial wireframes for dashboard.',
        status: 'pending',
        earnings: 130.00
    }
];

export const MOCK_TRANSACTIONS: WalletTransaction[] = [
    {
        id: 'tx-1',
        walletId: 'w-u1',
        type: TransactionType.DEPOSIT,
        amount: 500,
        status: 'cleared',
        description: 'Deposit via PayPal',
        createdAt: '2023-10-01T10:00:00Z'
    },
    {
        id: 'tx-2',
        walletId: 'w-u1',
        type: TransactionType.ESCROW_HOLD,
        amount: -300,
        status: 'cleared',
        referenceId: 'o1',
        description: 'Escrow for Order #o1',
        createdAt: '2023-10-25T14:30:00Z'
    },
    {
        id: 'tx-3',
        walletId: 'w-u1',
        type: TransactionType.ESCROW_RELEASE,
        amount: 50,
        status: 'cleared',
        referenceId: 'o2',
        description: 'Payment released for Order #o2',
        createdAt: '2023-10-18T16:00:00Z'
    }
];

export const MOCK_AFFILIATES: Affiliate[] = [
    { id: 'aff-1', userId: 'u10', userName: 'Tech Blogger', code: 'TECH20', earnings: 1540, referrals: 125, status: 'active', commissionRate: 0.15, createdAt: '2023-01-15' },
    { id: 'aff-2', userId: 'u11', userName: 'Design Guru', code: 'DESIGN10', earnings: 850, referrals: 45, status: 'active', commissionRate: 0.10, createdAt: '2023-03-20' },
    { id: 'aff-3', userId: 'u12', userName: 'Course Creator', code: 'LEARN50', earnings: 2100, referrals: 300, status: 'active', commissionRate: 0.20, createdAt: '2023-05-10' }
];

export const MOCK_COUPONS: Coupon[] = [
    { id: 'cpn-1', code: 'WELCOME20', discountType: 'percentage', value: 20, usageLimit: 1000, usedCount: 450, expiryDate: '2024-12-31', isActive: true },
    { id: 'cpn-2', code: 'SAVE10', discountType: 'fixed', value: 10, usageLimit: 500, usedCount: 120, expiryDate: '2024-06-30', isActive: true }
];

export const MOCK_CAMPAIGNS: MarketingCampaign[] = [
    { id: 'cmp-1', name: 'October Newsletter', type: 'email', status: 'completed', targetAudience: 'all', stats: { sent: 15000, opened: 4500, clicked: 800 }, createdAt: '2023-10-01' },
    { id: 'cmp-2', name: 'Black Friday Teaser', type: 'notification', status: 'scheduled', targetAudience: 'freelancers', stats: { sent: 0, opened: 0, clicked: 0 }, createdAt: '2023-11-15', scheduledAt: '2023-11-20' }
];

export const MOCK_CONVERSATIONS: Conversation[] = [
    {
        id: 'c1',
        type: 'direct',
        participants: [
            { id: 'u1', name: 'Me', avatar: 'https://ui-avatars.com/api/?name=Me', isOnline: true, role: 'freelancer' },
            { id: 'client-1', name: 'John Buyer', avatar: 'https://ui-avatars.com/api/?name=John+Buyer', isOnline: false, role: 'employer' }
        ],
        lastMessage: 'Thanks for the update!',
        lastMessageAt: '2023-10-30T10:00:00Z',
        unreadCount: 0,
        messages: [
            { id: 'm1', conversationId: 'c1', senderId: 'client-1', receiverId: 'u1', text: 'Hi, how is the progress?', timestamp: '2023-10-30T09:00:00Z', isRead: true },
            { id: 'm2', conversationId: 'c1', senderId: 'u1', receiverId: 'client-1', text: 'Going well, almost done with the home page.', timestamp: '2023-10-30T09:30:00Z', isRead: true },
            { id: 'm3', conversationId: 'c1', senderId: 'client-1', receiverId: 'u1', text: 'Thanks for the update!', timestamp: '2023-10-30T10:00:00Z', isRead: true }
        ]
    }
];

export const MOCK_KYC_DOCS: KYCDocument[] = [
    {
        id: 'kyc-1',
        userId: 'u5',
        userName: 'New User',
        fullName: 'John Doe',
        address: '123 Main St',
        mobile: '+1234567890',
        dob: '1990-01-01',
        nationality: 'US',
        type: 'ID Card',
        status: 'Pending',
        dateSubmitted: '2023-11-01T10:00:00Z',
        frontImage: 'https://via.placeholder.com/300x200?text=ID+Front'
    }
];
