import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} from "../config/env";

// Defensive Cloudinary initialization with re-check
const initCloudinary = () => {
  const cloud_name = CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY;
  const api_secret = CLOUDINARY_API_SECRET || process.env.CLOUDINARY_API_SECRET;

  cloudinary.config({
    cloud_name,
    api_key,
    api_secret,
  });

  if (process.env.DEBUG === "true" || process.env.NODE_ENV === "development") {
    console.log(
      `[Cloudinary] Initialization check: cloud_name=${cloud_name}, api_key=${
        api_key ? "Present" : "Missing"
      }`
    );
    if (!api_key) {
      console.warn(
        "[Cloudinary] API Key is missing. Attempts to upload will fail."
      );
    }
  }
};

initCloudinary();


export const uploadBufferToCloudinary = (
  buffer: Buffer,
  folder: string,
  filename: string,
  resourceType: "auto" | "image" | "raw" | "video" = "raw",
): Promise<{ secure_url: string; public_id: string }> => {
  // Last resort: make sure config is applied before calling the API
  if (!cloudinary.config().api_key) {
    initCloudinary();
  }

  return new Promise((resolve, reject) => {

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        public_id: filename,
        resource_type: resourceType,
        overwrite: true,
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result)
          return reject(new Error("Cloudinary upload failed: No result"));
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};
