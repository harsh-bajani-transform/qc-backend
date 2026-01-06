import { config } from 'dotenv';

config({ path: `.env` });

export const {
  PORT, NODE_ENV, SERVER_URL,
  DB_URI,
  JWT_SECRET, JWT_EXPIRES_IN,
  EMAIL_USER, EMAIL_PASSWORD
} = process.env;