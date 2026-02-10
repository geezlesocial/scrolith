import express from 'express';
import {
  getAdminGigs,
  saveAdminGig,
  deleteAdminGig,
  approveAdminGig,
  getAdminJobs,
  saveAdminJob,
  deleteAdminJob,
  approveAdminJob,
  getGigCategoriesAdmin,
  getJobCategoriesAdmin,
  saveCategoryAdmin,
  deleteCategoryAdmin,
  getPlans,
  savePlan,
  getDashboardStats,
  listJobProposalsAdmin,
  rejectProposalAdmin
} from '../controllers/gigsJobsAdminController';

const router = express.Router();

router.get('/gigs', getAdminGigs);
router.post('/gigs', saveAdminGig);
router.delete('/gigs/:id', deleteAdminGig);
router.post('/gigs/:id/approve', approveAdminGig);

router.get('/jobs', getAdminJobs);
router.post('/jobs', saveAdminJob);
router.delete('/jobs/:id', deleteAdminJob);
router.post('/jobs/:id/approve', approveAdminJob);

router.get('/categories/gigs', getGigCategoriesAdmin);
router.get('/categories/jobs', getJobCategoriesAdmin);
router.post('/categories', saveCategoryAdmin);
router.delete('/categories/:id', deleteCategoryAdmin);

router.get('/plans', getPlans);
router.post('/plans', savePlan);

router.get('/dashboard/stats', getDashboardStats);

router.get('/jobs/:id/proposals', listJobProposalsAdmin);
router.post('/proposals/:id/reject', rejectProposalAdmin);

export default router;
