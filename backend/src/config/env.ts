import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

let loaded = false;

export const loadEnv = (): void => {
  if (loaded) return;

  const cwd = process.cwd();
  const envPath = path.resolve(cwd, '.env');

  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }

  if (!process.env.APP_ENV) {
    process.env.APP_ENV = process.env.NODE_ENV || 'local';
  }

  // Never fall back to a hardcoded JWT secret: a known secret lets anyone forge
  // admin tokens. Require it in production; use a loud, explicitly-insecure
  // default only in non-production so local dev still works.
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set to a strong value (>= 16 chars) in production.');
    }
    console.warn('[env] JWT_SECRET is missing or weak — using an INSECURE development default. Set a strong JWT_SECRET before deploying.');
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-insecure-jwt-secret-change-me';
  }

  loaded = true;
};

