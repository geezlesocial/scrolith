
import express from 'express';
import { devAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';
import { updateSystemSettings, updateUserStatus } from '../controllers/adminController';
import { getKycRequests, updateKycStatus } from '../controllers/adminKycController';
import { getStaff, getRoles, saveStaff, deleteStaff } from '../controllers/staffController';
import { 
    getCategories, saveCategory, deleteCategory,
    getGigs, saveGig, deleteGig,
    getJobs, saveJob, deleteJob
} from '../controllers/commerceController';
import gigsJobsAdminRoutes from './gigsJobsAdmin';

const router = express.Router();
router.use(devAuth);
router.use(requireAdmin);

// System
router.post('/settings/update', updateSystemSettings);
router.post('/users/status', updateUserStatus);

// KYC (Admin)
router.get('/kyc/requests', getKycRequests);
router.post('/kyc/:id/status', updateKycStatus);

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

// Staff & Roles
router.get('/staff', getStaff);
router.get('/staff/roles', getRoles);
router.post('/staff', saveStaff);
router.delete('/staff/:id', deleteStaff);

// Gigs & Jobs (admin dashboard)
router.use('/gigs-jobs', gigsJobsAdminRoutes);

export default router;
