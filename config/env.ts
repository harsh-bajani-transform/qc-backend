import { config } from "dotenv";

config({ path: `.env` });

export const {
  PORT,
  NODE_ENV,
  SERVER_URL,
  PYTHON_URL,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM_NAME,
  DB_HOST,
  DB_PORT,
  DB_DATABASE,
  DB_USERNAME,
  DB_PASSWORD,
} = process.env;
