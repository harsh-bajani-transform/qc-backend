"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLOUDINARY_API_SECRET = exports.CLOUDINARY_API_KEY = exports.CLOUDINARY_CLOUD_NAME = exports.DB_PASSWORD = exports.DB_USERNAME = exports.DB_DATABASE = exports.DB_PORT = exports.DB_HOST = exports.UPLOADS_DIR = exports.SMTP_FROM_NAME = exports.SMTP_PASS = exports.SMTP_USER = exports.SMTP_PORT = exports.SMTP_HOST = exports.JWT_EXPIRES_IN = exports.JWT_SECRET = exports.PYTHON_URL = exports.SERVER_URL = exports.NODE_ENV = exports.PORT = void 0;
const dotenv_1 = require("dotenv");
const path_1 = __importDefault(require("path"));
// Load .env relative to this file to handle different working directories
const envPath = path_1.default.resolve(__dirname, "..", ".env");
(0, dotenv_1.config)({ path: envPath, override: true });
console.log(`[Config] Attempting to load .env from: ${envPath}`);
_a = process.env, exports.PORT = _a.PORT, exports.NODE_ENV = _a.NODE_ENV, exports.SERVER_URL = _a.SERVER_URL, exports.PYTHON_URL = _a.PYTHON_URL, exports.JWT_SECRET = _a.JWT_SECRET, exports.JWT_EXPIRES_IN = _a.JWT_EXPIRES_IN, exports.SMTP_HOST = _a.SMTP_HOST, exports.SMTP_PORT = _a.SMTP_PORT, exports.SMTP_USER = _a.SMTP_USER, exports.SMTP_PASS = _a.SMTP_PASS, exports.SMTP_FROM_NAME = _a.SMTP_FROM_NAME, exports.UPLOADS_DIR = _a.UPLOADS_DIR, exports.DB_HOST = _a.DB_HOST, exports.DB_PORT = _a.DB_PORT, exports.DB_DATABASE = _a.DB_DATABASE, exports.DB_USERNAME = _a.DB_USERNAME, exports.DB_PASSWORD = _a.DB_PASSWORD, exports.CLOUDINARY_CLOUD_NAME = _a.CLOUDINARY_CLOUD_NAME, exports.CLOUDINARY_API_KEY = _a.CLOUDINARY_API_KEY, exports.CLOUDINARY_API_SECRET = _a.CLOUDINARY_API_SECRET;
// Debug log for configuration validation
if (exports.NODE_ENV === "development" || process.env.DEBUG === "true") {
    if (!exports.CLOUDINARY_API_KEY) {
        console.warn("[Config] WARNING: CLOUDINARY_API_KEY is not defined in .env");
    }
    else {
        console.log("[Config] Cloudinary credentials loaded successfully.");
    }
}
