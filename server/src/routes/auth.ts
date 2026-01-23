import express from 'express';

const router = express.Router();

// Minimal placeholder auth routes to satisfy server imports during local development.
// Real auth lives elsewhere; do not modify production auth logic.
router.get('/health', (_req, res) => res.json({ success: true }));

export default router;
