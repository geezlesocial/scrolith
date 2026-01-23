import express from 'express';

const router = express.Router();

// Placeholder CMS routes for local/dev testing only.
router.get('/health', (_req, res) => res.json({ success: true }));

export default router;
