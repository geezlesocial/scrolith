import { Request, Response } from 'express';

export const getAIConfig = async (req: Request, res: Response) => {
  res.json({ message: 'AI config placeholder' });
};