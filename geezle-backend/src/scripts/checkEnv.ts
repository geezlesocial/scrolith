#!/usr/bin/env ts-node
import dotenv from 'dotenv';
import validateEnv from '../utils/validateEnv';

// Load .env so this script sees values from the repository .env file
dotenv.config();

function run() {
  const result = validateEnv();
  const missing = result.missingCritical || [];
  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    console.error('Missing critical environment variables.');
    process.exit(1);
  }
  console.log('Environment validation complete.');
  if (result.missingCritical.length) {
    console.warn('Missing critical:', result.missingCritical.join(', '));
  }
  if (result.missingOptional.length) {
    console.info('Missing optional:', result.missingOptional.slice(0,20).join(', '));
  }
}

run();
