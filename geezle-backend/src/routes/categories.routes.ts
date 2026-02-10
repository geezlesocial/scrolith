import express from 'express';
import prisma from '../utils/prismaClient';

const router = express.Router();

const formatCategories = (categories: any[]) =>
  categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    subcategories: Array.isArray(cat.children)
      ? cat.children.map((child: any) => ({
          id: child.id,
          name: child.name
        }))
      : []
  }));

// Get gig categories
router.get('/gigs', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true, parentId: null, type: { in: ['GIG', 'BOTH'] } },
      orderBy: { order: 'asc' },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { order: 'asc' }
        }
      }
    });
    res.json({
      success: true,
      data: {
        categories: formatCategories(categories)
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
    const categories = await prisma.category.findMany({
      where: { isActive: true, parentId: null, type: { in: ['JOB', 'BOTH'] } },
      orderBy: { order: 'asc' },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { order: 'asc' }
        }
      }
    });
    res.json({
      success: true,
      data: {
        categories: formatCategories(categories)
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
