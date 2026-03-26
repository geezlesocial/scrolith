import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { serializeGig } from './gigs.controller';
import { STANDARD_LISTING_CATEGORIES } from '../config/listingCategories';
import { ensureStandardListingCategoriesSeeded } from '../services/defaultCategorySeed.service';

const formatStandardCategoryFallback = (type: 'gig' | 'job') =>
  STANDARD_LISTING_CATEGORIES.map((category, index) => ({
    id: `${type}-standard-${index + 1}`,
    name: category.name,
    slug: category.name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, ''),
    type,
    status: 'active',
    count: 0,
    sortOrder: index + 1,
    subcategories: category.subcategories.map((subcategory, subIndex) => ({
      id: `${type}-standard-${index + 1}-sub-${subIndex + 1}`,
      name: subcategory,
      slug: `${category.name}-${subcategory}`
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, ''),
      status: 'active',
      sortOrder: subIndex + 1
    })),
    description: category.description || undefined
  }));

export const getGigs = async (req: Request, res: Response) => {
  try {
    const gigs = await prisma.gig.findMany({
      where: { isActive: true, status: 'ACTIVE', adminStatus: 'APPROVED' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            profile: {
              select: {
                rating: true,
                completedJobs: true
              }
            }
          }
        },
        category: true
      },
      take: 20
    });
    return res.json({ success: true, data: gigs.map(serializeGig) });
  } catch (error: any) {
    console.error('Get gigs error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch gigs' });
  }
};

export const getGigById = async (req: Request, res: Response) => {
  try {
    const gig = await prisma.gig.findFirst({
      where: { id: req.params.id, isActive: true, status: 'ACTIVE', adminStatus: 'APPROVED' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            profile: {
              select: {
                rating: true,
                completedJobs: true
              }
            }
          }
        },
        category: true
      }
    });

    if (!gig) {
      return res.status(404).json({ success: false, error: 'Gig not found' });
    }

    return res.json({ success: true, data: serializeGig(gig) });
  } catch (error: any) {
    console.error('Get gig by id error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch gig' });
  }
};

export const getCategories = async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    await ensureStandardListingCategoriesSeeded();
    
    // Build where clause based on type filter
    let whereClause: any = { isActive: true, parentId: null };
    
    if (type === 'gig') {
      whereClause.type = { in: ['GIG', 'BOTH'] };
    } else if (type === 'job') {
      whereClause.type = { in: ['JOB', 'BOTH'] };
    }
    
    const categories = await prisma.category.findMany({
      where: whereClause,
      orderBy: { order: 'asc' },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { order: 'asc' }
        }
      }
    });

    // Transform to match frontend format
    const formattedCategories = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      type:
        type === 'job'
          ? 'job'
          : type === 'gig'
          ? 'gig'
          : cat.type === 'JOB'
          ? 'job'
          : 'gig',
      status: cat.isActive ? 'active' : 'hidden',
      count: 0, // TODO: Calculate actual count
      sortOrder: cat.order || 0,
      subcategories: cat.children.map(child => ({
        id: child.id,
        name: child.name,
        slug: child.slug,
        status: child.isActive ? 'active' : 'hidden',
        sortOrder: child.order || 0,
        icon: child.icon || undefined
      })),
      description: cat.description || undefined,
      logo: cat.icon || undefined
    }));

    res.json({ 
      success: true,
      data: formattedCategories 
    });
  } catch (error: any) {
    console.error('Get categories error:', error);
    const gigFallback = formatStandardCategoryFallback('gig');
    const jobFallback = formatStandardCategoryFallback('job');
    let filtered = [...gigFallback, ...jobFallback];
    if (req.query.type === 'gig') filtered = gigFallback;
    else if (req.query.type === 'job') filtered = jobFallback;
    
    res.json({ 
      success: true,
      data: filtered,
      message: 'Using mock data due to database error'
    });
  }
};
