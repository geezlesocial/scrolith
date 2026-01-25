import express, { Request, Response } from 'express';
import { getGigs, getCategories } from '../controllers/commerce.controller';

const router = express.Router();

// Get categories with optional type filter (gig|job)
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    
    // If using Prisma controller, call it
    try {
      const result = await getCategories(req, res);
      // If getCategories already sent response, return
      if (res.headersSent) return;
      
      // Otherwise, filter by type if provided
      const typed = result as unknown as { categories?: unknown[] } | undefined;
      const categories = Array.isArray(typed?.categories) ? typed!.categories : [];
      let filtered = categories;

      if (type === 'gig') {
        filtered = categories.filter((cat) => {
          const c = cat as Record<string, unknown>;
          const t = (c.type as string | undefined) ?? '';
          return t === 'GIG' || t === 'BOTH' || t === 'gig';
        });
      } else if (type === 'job') {
        filtered = categories.filter((cat) => {
          const c = cat as Record<string, unknown>;
          const t = (c.type as string | undefined) ?? '';
          return t === 'JOB' || t === 'BOTH' || t === 'job';
        });
      }
      
      res.json({ 
        success: true, 
        data: filtered 
      });
    } catch (error) {
      // Fallback to mock data if Prisma fails
      const mockCategories = [
        {
          id: '1',
          name: 'Graphics & Design',
          slug: 'graphics-design',
          type: 'gig',
          status: 'active',
          count: 24,
          sortOrder: 1,
          subcategories: []
        },
        {
          id: '2',
          name: 'Programming & Tech',
          slug: 'programming-tech',
          type: 'gig',
          status: 'active',
          count: 42,
          sortOrder: 2,
          subcategories: []
        },
        {
          id: '3',
          name: 'Software Development',
          slug: 'software-development',
          type: 'job',
          status: 'active',
          count: 15,
          sortOrder: 1,
          subcategories: []
        }
      ];
      
      let filtered = mockCategories;
      if (type === 'gig') {
        filtered = mockCategories.filter(cat => cat.type === 'gig');
      } else if (type === 'job') {
        filtered = mockCategories.filter(cat => cat.type === 'job');
      }
      
      res.json({ 
        success: true, 
        data: filtered,
        message: 'Using mock data'
      });
    }
  } catch (error: any) {
    console.error('Get categories error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch categories' 
    });
  }
});

// Get gigs
router.get('/gigs', getGigs);

export default router;