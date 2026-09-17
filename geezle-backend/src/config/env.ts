import { requiredSecret } from '../utils/security/requiredSecret';

export const env = {
  PORT: process.env.PORT || '5000',
  JWT_SECRET: requiredSecret('JWT_SECRET', 'dev-secret'),
  NODE_ENV: process.env.NODE_ENV || 'development',
};

export default env;
