import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!parsed.success) {
      return res.status(422).json({
        success: false,
        error: { message: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
      });
    }
    next();
  };
}

export default validate;
