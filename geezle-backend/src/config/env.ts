export const env = {
  PORT: process.env.PORT || '5000',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret',
  NODE_ENV: process.env.NODE_ENV || 'development',
};

export default env;
