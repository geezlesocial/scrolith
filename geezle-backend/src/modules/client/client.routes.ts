import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';

const r = Router();

r.use(requireAuth, requireRole('CLIENT'));

r.get('/my-jobs', (req, res) => res.json({ ok: true }));
r.get('/proposals-offers', (req, res) => res.json({ ok: true }));

export default r;
