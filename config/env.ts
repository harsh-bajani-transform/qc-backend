import { config } from 'dotenv';

config({ path: `.env` });

export const {
  PORT, NODE_ENV, SERVER_URL, PYTHON_URL,
  JWT_SECRET, JWT_EXPIRES_IN,
  EMAIL_USER, EMAIL_PASSWORD,
  DB_HOST, DB_PORT, DB_DATABASE,
  DB_USERNAME, DB_PASSWORD
} = process.env;