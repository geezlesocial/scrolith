import { Request, Response, NextFunction } from 'express';
import { fail } from '../utils/apiResponse';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const status = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Something went wrong';
  const details = err.details;

  res.status(status).json(fail(message, code, details));
}

export default errorHandler;
