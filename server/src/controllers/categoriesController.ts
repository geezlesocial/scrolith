import { Request, Response } from 'express';
import { prisma } from '../db';

const mapCategory = (category: any) => ({
  id: category.id,
  name: category.name,
  slug: category.slug,
  type: category.type?.toLowerCase?.() || category.type,
  status: category.status,
  count: category.count || 0,
  sortOrder: category.sortOrder || 0,
  icon: category.icon,
  description: category.description,
  image: category.image,
  subcategories: Array.isArray(category.subcategories)
    ? category.subcategories.map((sub: any) => ({
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        status: sub.status,
        sortOrder: sub.sortOrder || 0,
        icon: sub.icon
      }))
    : []
});

const listByType = async (type: 'gig' | 'job') => {
  if (!prisma) return [];
  const types = type === 'gig' ? ['GIG', 'BOTH'] : ['JOB', 'BOTH'];
  const categories = await prisma.category.findMany({
    where: { parentId: null, type: { in: types }, status: 'active' },
    include: { subcategories: { where: { status: 'active' }, orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' }
  });
  return categories.map(mapCategory);
};

export const getGigCategories = async (_req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const categories = await listByType('gig');
  return res.json({ success: true, data: { categories } });
};

export const getJobCategories = async (_req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const categories = await listByType('job');
  return res.json({ success: true, data: { categories } });
};

export const listCommerceCategories = async (req: Request, res: Response) => {
  if (!prisma) return res.status(500).json({ success: false, error: 'Database not initialized' });
  const type = (req.query.type as string | undefined)?.toLowerCase();
  const categories = type === 'gig' || type === 'job'
    ? await listByType(type)
    : [
        ...(await listByType('gig')),
        ...(await listByType('job'))
      ];
  return res.json({ success: true, data: { categories } });
};
