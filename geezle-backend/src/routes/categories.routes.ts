import express from 'express';

const router = express.Router();

// Mock categories data - replace with actual database queries
const gigCategories = [
  {
    id: 'design',
    name: 'Design',
    subcategories: [
      { id: 'logo-design', name: 'Logo Design' },
      { id: 'web-design', name: 'Web Design' },
      { id: 'graphic-design', name: 'Graphic Design' },
      { id: 'print-design', name: 'Print Design' }
    ]
  },
  {
    id: 'programming',
    name: 'Programming',
    subcategories: [
      { id: 'web-development', name: 'Web Development' },
      { id: 'mobile-development', name: 'Mobile Development' },
      { id: 'desktop-software', name: 'Desktop Software' },
      { id: 'game-development', name: 'Game Development' }
    ]
  },
  {
    id: 'writing',
    name: 'Writing',
    subcategories: [
      { id: 'content-writing', name: 'Content Writing' },
      { id: 'blog-writing', name: 'Blog Writing' },
      { id: 'technical-writing', name: 'Technical Writing' },
      { id: 'creative-writing', name: 'Creative Writing' }
    ]
  }
];

const jobCategories = [
  {
    id: 'technology',
    name: 'Technology',
    subcategories: [
      { id: 'software-development', name: 'Software Development' },
      { id: 'web-development', name: 'Web Development' },
      { id: 'mobile-apps', name: 'Mobile Apps' },
      { id: 'data-science', name: 'Data Science' }
    ]
  },
  {
    id: 'design',
    name: 'Design',
    subcategories: [
      { id: 'ui-ux-design', name: 'UI/UX Design' },
      { id: 'graphic-design', name: 'Graphic Design' },
      { id: 'product-design', name: 'Product Design' },
      { id: 'branding', name: 'Branding' }
    ]
  },
  {
    id: 'marketing',
    name: 'Marketing',
    subcategories: [
      { id: 'digital-marketing', name: 'Digital Marketing' },
      { id: 'content-marketing', name: 'Content Marketing' },
      { id: 'social-media', name: 'Social Media Marketing' },
      { id: 'seo', name: 'SEO' }
    ]
  }
];

// Get gig categories
router.get('/gigs', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        categories: gigCategories
      }
    });
  } catch (error) {
    console.error('Error fetching gig categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch gig categories'
    });
  }
});

// Get job categories
router.get('/jobs', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        categories: jobCategories
      }
    });
  } catch (error) {
    console.error('Error fetching job categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job categories'
    });
  }
});

export default router;