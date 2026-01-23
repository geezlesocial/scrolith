
import express from 'express';
import { updateSystemSettings, updateUserStatus } from '../controllers/adminController';
import { 
    getCategories, saveCategory, deleteCategory,
    getGigs, saveGig, deleteGig,
    getJobs, saveJob, deleteJob
} from '../controllers/commerceController';

const router = express.Router();

// System
router.post('/settings/update', updateSystemSettings);
router.post('/users/status', updateUserStatus);

// Commerce - Categories
router.get('/commerce/categories', getCategories);
router.post('/commerce/categories', saveCategory);
router.delete('/commerce/categories/:id', deleteCategory);

// Commerce - Gigs
router.get('/commerce/gigs', getGigs);
router.post('/commerce/gigs', saveGig);
router.delete('/commerce/gigs/:id', deleteGig);

// Commerce - Jobs
router.get('/commerce/jobs', getJobs);
router.post('/commerce/jobs', saveJob);
router.delete('/commerce/jobs/:id', deleteJob);

export default router;
