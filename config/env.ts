import { config } from "dotenv";
import path from "path";

// Load .env relative to this file to handle different working directories
const envPath = path.resolve(__dirname, "..", ".env");
config({ path: envPath, override: true });

console.log(`[Config] Attempting to load .env from: ${envPath}`);


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
  UPLOADS_DIR,
  DB_HOST,
  DB_PORT,
  DB_DATABASE,
  DB_USERNAME,
  DB_PASSWORD,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} = process.env;

// Debug log for configuration validation
if (NODE_ENV === "development" || process.env.DEBUG === "true") {
  if (!CLOUDINARY_API_KEY) {
    console.warn("[Config] WARNING: CLOUDINARY_API_KEY is not defined in .env");
  } else {
    console.log("[Config] Cloudinary credentials loaded successfully.");
  }
}
