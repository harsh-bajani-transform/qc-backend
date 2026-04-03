"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadBufferToCloudinary = void 0;
const cloudinary_1 = require("cloudinary");
const streamifier_1 = __importDefault(require("streamifier"));
const env_1 = require("../config/env");
// Defensive Cloudinary initialization with re-check
const initCloudinary = () => {
    const cloud_name = env_1.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
    const api_key = env_1.CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY;
    const api_secret = env_1.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET;
    cloudinary_1.v2.config({
        cloud_name,
        api_key,
        api_secret,
    });
    if (process.env.DEBUG === "true" || process.env.NODE_ENV === "development") {
        console.log(`[Cloudinary] Initialization check: cloud_name=${cloud_name}, api_key=${api_key ? "Present" : "Missing"}`);
        if (!api_key) {
            console.warn("[Cloudinary] API Key is missing. Attempts to upload will fail.");
        }
    }
};
initCloudinary();
const uploadBufferToCloudinary = (buffer, folder, filename, resourceType = "raw") => {
    // Last resort: make sure config is applied before calling the API
    if (!cloudinary_1.v2.config().api_key) {
        initCloudinary();
    }
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary_1.v2.uploader.upload_stream({
            folder: folder,
            public_id: filename,
            resource_type: resourceType,
            overwrite: true,
        }, (error, result) => {
            if (error)
                return reject(error);
            if (!result)
                return reject(new Error("Cloudinary upload failed: No result"));
            resolve({
                secure_url: result.secure_url,
                public_id: result.public_id,
            });
        });
        streamifier_1.default.createReadStream(buffer).pipe(uploadStream);
    });
};
exports.uploadBufferToCloudinary = uploadBufferToCloudinary;
