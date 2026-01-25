import express, { Request, Response } from 'express';

const router = express.Router();

// Auth routes (placeholder for now)
router.post('/login', (req: Request, res: Response) => {
  res.json({ message: 'Login route placeholder' });
});

router.post('/register', (req: Request, res: Response) => {
  res.json({ message: 'Register route placeholder' });
});

router.get('/profile', (req: Request, res: Response) => {
  res.json({ message: 'Profile route placeholder' });
});

export default router;