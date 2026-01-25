import { Request, Response } from 'express';

// Updated mock settings to match frontend structure
const mockSystemSettings = {
  system: {
    maintenanceMode: false,
    registrationsEnabled: true,
    kycEnforced: false,
    admin2FA: false,
    currency: {
      autoExchangeRate: true,
      baseCurrency: 'USD',
      provider: 'openexchangerates',
      apiKey: ''
    },
    storage: {
      driver: 'local',
      s3: { accessKeyId: '', secretAccessKey: '', region: '', bucket: '' },
      backblaze: { accessKeyId: '', secretAccessKey: '', region: '', bucket: '' }
    },
    cache: {
      driver: 'memory',
      redis: { host: 'localhost', port: 6379, password: '' }
    },
    email: {
      provider: 'smtp',
      host: 'smtp.gmail.com',
      port: 587,
      username: '',
      password: '',
      fromName: 'Geezle Support',
      fromEmail: 'support@geezle.com'
    },
    regionalCompliance: [
      {
        region: 'EU',
        code: 'GDPR',
        gdprEnabled: true,
        dataResidency: 'EU',
        kycProvider: 'local',
        taxEngine: 'local',
        active: true
      }
    ]
  }
};

// System settings functions
export const getSettings = async (req: Request, res: Response) => {
  try {
    res.json(mockSystemSettings);
  } catch (error) {
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const saveSettings = async (req: Request, res: Response) => {
  try {
    console.log('System settings saved:', req.body);
    res.json({ 
      success: true, 
      message: 'System settings saved successfully' 
    });
  } catch (error) {
    console.error('Error saving system settings:', error);
    res.status(500).json({ 
      error: 'Failed to save system settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Platform settings functions - ADD THESE!
export const getPlatformSettings = async (req: Request, res: Response) => {
  try {
    const platformSettings = {
      siteName: 'Geezle Marketplace',
      tagline: 'Find, hire, and work with the best talent',
      logoUrl: '/logo.svg',
      faviconUrl: '/favicon.ico',
      adminEmail: 'admin@geezle.com',
      supportEmail: 'support@geezle.com',
      footerAboutTitle: 'About Geezle',
      footerAboutText: 'Connecting talented freelancers with businesses worldwide.',
      footerCopyright: `© ${new Date().getFullYear()} Geezle Marketplace. All rights reserved.`,
      footerLinks: [
        { title: 'Privacy Policy', url: '/privacy' },
        { title: 'Terms of Service', url: '/terms' },
        { title: 'Cookie Policy', url: '/cookies' }
      ],
      socialLinks: [
        { platform: 'facebook', url: 'https://facebook.com/geezle' },
        { platform: 'twitter', url: 'https://twitter.com/geezle' },
        { platform: 'linkedin', url: 'https://linkedin.com/company/geezle' }
      ],
      system: mockSystemSettings.system
    };
    
    res.json(platformSettings);
  } catch (error) {
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const savePlatformSettings = async (req: Request, res: Response) => {
  try {
    console.log('Platform settings saved:', req.body);
    res.json({ 
      success: true, 
      message: 'Platform settings saved successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to save platform settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Categories functions
const mockCategories = [
  {
    id: '1',
    name: 'Development',
    slug: 'development',
    type: 'gig',
    status: 'active',
    count: 120,
    sortOrder: 1,
    subcategories: [
      { id: '1-1', name: 'Web Development', slug: 'web-development', count: 45 },
      { id: '1-2', name: 'Mobile Development', slug: 'mobile-development', count: 30 },
      { id: '1-3', name: 'Software Development', slug: 'software-development', count: 25 },
      { id: '1-4', name: 'API Development', slug: 'api-development', count: 20 }
    ]
  }
  // ... other categories
];

export const getCategories = async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    if (type) {
      const filteredCategories = mockCategories.filter(cat => cat.type === type);
      res.json(filteredCategories);
    } else {
      res.json(mockCategories);
    }
  } catch (error) {
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const saveCategory = async (req: Request, res: Response) => {
  try {
    console.log('Category saved:', req.body);
    res.json({ 
      success: true, 
      message: 'Category saved successfully',
      category: { id: `cat-${Date.now()}`, ...req.body }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to save category',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    console.log('Category deleted:', req.params.id);
    res.json({ 
      success: true, 
      message: 'Category deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to delete category',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Add other required functions
export const getPlans = async (req: Request, res: Response) => {
  try {
    const plans = [
      { 
        id: 'p1', 
        name: 'Basic', 
        type: 'freelancer', 
        price: 0, 
        interval: 'monthly', 
        currency: 'USD', 
        isActive: true, 
        isPopular: false, 
        features: [
          { id: 'f1', name: '5 Active Gigs', included: true, limit: '5' },
          { id: 'f2', name: 'Basic Analytics', included: true }
        ] 
      }
    ];
    
    res.json(plans);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get plans',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const savePlan = async (req: Request, res: Response) => {
  try {
    console.log('Plan saved:', req.body);
    res.json({ 
      success: true, 
      message: 'Plan saved successfully',
      plan: { id: `plan-${Date.now()}`, ...req.body }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to save plan',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const updatePlan = async (req: Request, res: Response) => {
  try {
    console.log('Plan updated:', req.params.id, req.body);
    res.json({ 
      success: true, 
      message: 'Plan updated successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update plan',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const deletePlan = async (req: Request, res: Response) => {
  try {
    console.log('Plan deleted:', req.params.id);
    res.json({ 
      success: true, 
      message: 'Plan deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to delete plan',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getOverviewStats = async (req: Request, res: Response) => {
  try {
    res.json({
      totalRevenue: 15420,
      activeUsers: 842,
      totalListings: 156
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get overview stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getRecentActivity = async (req: Request, res: Response) => {
  try {
    res.json([
      { id: '1', user: 'John Doe', action: 'Created a new listing', timestamp: '10 min ago' }
    ]);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get recent activity',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getAIAnalytics = async (req: Request, res: Response) => {
  try {
    res.json({
      totalConversations: 1250,
      costEstimate: 12.50
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get AI analytics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getFraudAlerts = async (req: Request, res: Response) => {
  try {
    res.json([
      { id: 'fa1', userId: 'u-suspicious', userName: 'Bot User' }
    ]);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get fraud alerts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    console.log('User status updated:', req.body);
    res.json({ 
      success: true, 
      message: 'User status updated successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update user status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Default export
export default {
  getSettings,
  saveSettings,
  getPlatformSettings,
  savePlatformSettings,
  getCategories,
  saveCategory,
  deleteCategory,
  getPlans,
  savePlan,
  updatePlan,
  deletePlan,
  getOverviewStats,
  getRecentActivity,
  getAIAnalytics,
  getFraudAlerts,
  updateUserStatus
};