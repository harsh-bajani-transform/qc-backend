import { Request, Response } from "express";
import get_db_connection from "../database/db";
import crypto from "crypto";

// ──────────────────────────────────────────────
// Simple symmetric encryption using AES-256-GCM
// Key is derived from ENCRYPTION_SECRET in .env
// ──────────────────────────────────────────────

const ENCRYPTION_SECRET =
  process.env.ENCRYPTION_SECRET || "default-tfs-secret-key-32chars!!";

function deriveKey(): Buffer {
  return crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest();
}

function encryptKey(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptKey(token: string): string {
  const [ivHex, authTagHex, encryptedHex] = token.split(":");
  if (!ivHex || !authTagHex || !encryptedHex)
    throw new Error("Invalid encrypted key format");
  const key = deriveKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// ──────────────────────────────────────────────
// Save Gemini API Key
// POST /api/v1/gemini-key/save
// Body: { user_id, gemini_api_key }
// ──────────────────────────────────────────────
export const saveGeminiKey = async (req: Request, res: Response) => {
  const { user_id, gemini_api_key } = req.body;

  if (!user_id || !gemini_api_key) {
    return res
      .status(400)
      .json({
        success: false,
        message: "user_id and gemini_api_key are required",
      });
  }

  const connection = await get_db_connection();
  try {
    const encrypted = encryptKey(String(gemini_api_key).trim());
    await connection.execute(
      "UPDATE tfs_user SET gemini_api_key = ?, updated_date = NOW() WHERE user_id = ?",
      [encrypted, user_id],
    );
    res
      .status(200)
      .json({ success: true, message: "Gemini API key saved successfully" });
  } catch (err) {
    console.error("saveGeminiKey error:", err);
    res.status(500).json({ success: false, message: "Failed to save API key" });
  } finally {
    await connection.end();
  }
};

// ──────────────────────────────────────────────
// Get Gemini API Key (returns masked + success flag)
// POST /api/v1/gemini-key/get
// Body: { user_id }
// ──────────────────────────────────────────────
export const getGeminiKey = async (req: Request, res: Response) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res
      .status(400)
      .json({ success: false, message: "user_id is required" });
  }

  const connection = await get_db_connection();
  try {
    const [rows] = (await connection.execute(
      "SELECT gemini_api_key FROM tfs_user WHERE user_id = ?",
      [user_id],
    )) as [any[], any];

    if (!rows || rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const encrypted = rows[0]?.gemini_api_key;
    if (!encrypted) {
      return res
        .status(200)
        .json({ success: true, hasKey: false, gemini_api_key: null });
    }

    const decrypted = decryptKey(encrypted);
    // Return the key for frontend use (stored securely in memory/sessionStorage)
    res
      .status(200)
      .json({ success: true, hasKey: true, gemini_api_key: decrypted });
  } catch (err) {
    console.error("getGeminiKey error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to retrieve API key" });
  } finally {
    await connection.end();
  }
};

// ──────────────────────────────────────────────
// Delete Gemini API Key
// POST /api/v1/gemini-key/delete
// Body: { user_id }
// ──────────────────────────────────────────────
export const deleteGeminiKey = async (req: Request, res: Response) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res
      .status(400)
      .json({ success: false, message: "user_id is required" });
  }

  const connection = await get_db_connection();
  try {
    await connection.execute(
      "UPDATE tfs_user SET gemini_api_key = NULL, updated_date = NOW() WHERE user_id = ?",
      [user_id],
    );
    res.status(200).json({ success: true, message: "Gemini API key removed" });
  } catch (err) {
    console.error("deleteGeminiKey error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to remove API key" });
  } finally {
    await connection.end();
  }
};
