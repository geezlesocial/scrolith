import express, { Request, Response } from 'express';

const router = express.Router();

// AI routes (placeholder for now)
router.get('/config', (req: Request, res: Response) => {
  res.json({ message: 'AI config route placeholder' });
});

export default router;