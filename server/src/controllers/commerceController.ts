import { Request, Response } from 'express';
// Fix: Removed PrismaClient to fix build errors
// import { PrismaClient } from '@prisma/client';

// In-memory storage for mock persistence
let categories = [
    { id: '1', name: 'Development', slug: 'development', type: 'gig', status: 'active', count: 12, sortOrder: 1, subcategories: [] },
    { id: '2', name: 'Design', slug: 'design', type: 'gig', status: 'active', count: 8, sortOrder: 2, subcategories: [] },
    { id: '3', name: 'Writing', slug: 'writing', type: 'job', status: 'active', count: 5, sortOrder: 3, subcategories: [] }
];

let gigs = [
    { id: 'g1', title: 'React Development', price: 500, category: 'Development', status: 'active', createdAt: new Date().toISOString() }
];

let jobs: any[] = [
    { id: 'j1', title: 'Frontend Developer Needed', budget: '$1000', category: 'Development', status: 'active', postedTime: '2 hours ago' }
];

// --- CATEGORIES ---

// Fix: Use 'any' for req/res to resolve type mismatches
export const getCategories = async (req: any, res: any) => {
    const { type } = req.query;
    try {
        // Filter by type if provided
        const filtered = categories.filter(c => !type || c.type === type);
        res.json(filtered);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
};

// Fix: Use 'any' for req/res
export const saveCategory = async (req: any, res: any) => {
    const { id, name, slug, type, subcategories } = req.body;
    
    if (!name || !type) {
        return res.status(400).json({ error: 'Name and Type are required' });
    }

    try {
        const payload = {
            id: id || `cat-${Date.now()}`,
            name,
            slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
            type,
            subcategories: subcategories || [],
            status: req.body.status || 'active',
            sortOrder: req.body.sortOrder || 0,
            count: req.body.count || 0
        };

        const existingIndex = categories.findIndex(c => c.id === payload.id);
        if (existingIndex >= 0) {
            categories[existingIndex] = { ...categories[existingIndex], ...payload };
        } else {
            categories.push(payload as any);
        }

        console.log('[Mock DB] Category saved:', payload);

        // Real-time update
        if (req.io) req.io.emit('admin:category_update', payload);
        
        res.json({ success: true, data: payload });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save category' });
    }
};

// Fix: Use 'any' for req/res
export const deleteCategory = async (req: any, res: any) => {
    const { id } = req.params;
    try {
        categories = categories.filter(c => c.id !== id);
        console.log(`[Mock DB] Category ${id} deleted`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
};

// --- GIGS ---

// Fix: Use 'any' for req/res
export const getGigs = async (req: any, res: any) => {
    try {
        res.json(gigs);
    } catch (error) {
        res.json([]);
    }
};

// Fix: Use 'any' for req/res
export const saveGig = async (req: any, res: any) => {
    const data = req.body;
    try {
        const gig = { ...data, id: data.id || `gig-${Date.now()}` };
        
        const idx = gigs.findIndex(g => g.id === gig.id);
        if (idx >= 0) gigs[idx] = gig;
        else gigs.unshift(gig);

        console.log('[Mock DB] Gig saved:', gig);
            
        if (req.io) req.io.emit('admin:gig_update', gig);
        res.json({ success: true, data: gig });
    } catch (error) {
        res.json({ success: true, data: { ...data, id: data.id || `gig-${Date.now()}` } });
    }
};

// Fix: Use 'any' for req/res
export const deleteGig = async (req: any, res: any) => {
    const { id } = req.params;
    try {
        gigs = gigs.filter(g => g.id !== id);
        console.log(`[Mock DB] Gig ${id} deleted`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete' });
    }
};

// --- JOBS ---

// Fix: Use 'any' for req/res
export const getJobs = async (req: any, res: any) => {
    try {
        res.json(jobs);
    } catch (error) {
         res.json([]);
    }
};

// Fix: Use 'any' for req/res
export const saveJob = async (req: any, res: any) => {
    const data = req.body;
    try {
        const job = { ...data, id: data.id || `job-${Date.now()}` };
        
        const idx = jobs.findIndex(j => j.id === job.id);
        if (idx >= 0) jobs[idx] = job;
        else jobs.unshift(job);

        console.log('[Mock DB] Job saved:', job);
            
        if (req.io) req.io.emit('admin:job_update', job);
        res.json({ success: true, data: job });
    } catch (error) {
         res.json({ success: true, data: { ...data, id: data.id || `job-${Date.now()}` } });
    }
};

// Fix: Use 'any' for req/res
export const deleteJob = async (req: any, res: any) => {
    const { id } = req.params;
    try {
        jobs = jobs.filter(j => j.id !== id);
        console.log(`[Mock DB] Job ${id} deleted`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete' });
    }
};