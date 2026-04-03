"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteGeminiKey = exports.getGeminiKey = exports.saveGeminiKey = void 0;
const db_1 = __importDefault(require("../database/db"));
const crypto_1 = __importDefault(require("crypto"));
// ──────────────────────────────────────────────
// Simple symmetric encryption using AES-256-GCM
// Key is derived from ENCRYPTION_SECRET in .env
// ──────────────────────────────────────────────
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || "default-tfs-secret-key-32chars!!";
function deriveKey() {
    return crypto_1.default.createHash("sha256").update(ENCRYPTION_SECRET).digest();
}
function encryptKey(plaintext) {
    const key = deriveKey();
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}
function decryptKey(token) {
    const [ivHex, authTagHex, encryptedHex] = token.split(":");
    if (!ivHex || !authTagHex || !encryptedHex)
        throw new Error("Invalid encrypted key format");
    const key = deriveKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encryptedHex, "hex");
    const decipher = crypto_1.default.createDecipheriv("aes-256-gcm", key, iv);
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
const saveGeminiKey = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { user_id, gemini_api_key } = req.body;
    if (!user_id || !gemini_api_key) {
        return res
            .status(400)
            .json({
            success: false,
            message: "user_id and gemini_api_key are required",
        });
    }
    const connection = yield (0, db_1.default)();
    try {
        const encrypted = encryptKey(String(gemini_api_key).trim());
        yield connection.execute("UPDATE tfs_user SET gemini_api_key = ?, updated_date = NOW() WHERE user_id = ?", [encrypted, user_id]);
        res
            .status(200)
            .json({ success: true, message: "Gemini API key saved successfully" });
    }
    catch (err) {
        console.error("saveGeminiKey error:", err);
        res.status(500).json({ success: false, message: "Failed to save API key" });
    }
    finally {
        yield connection.end();
    }
});
exports.saveGeminiKey = saveGeminiKey;
// ──────────────────────────────────────────────
// Get Gemini API Key (returns masked + success flag)
// POST /api/v1/gemini-key/get
// Body: { user_id }
// ──────────────────────────────────────────────
const getGeminiKey = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { user_id } = req.body;
    if (!user_id) {
        return res
            .status(400)
            .json({ success: false, message: "user_id is required" });
    }
    const connection = yield (0, db_1.default)();
    try {
        const [rows] = (yield connection.execute("SELECT gemini_api_key FROM tfs_user WHERE user_id = ?", [user_id]));
        if (!rows || rows.length === 0) {
            return res
                .status(404)
                .json({ success: false, message: "User not found" });
        }
        const encrypted = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.gemini_api_key;
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
    }
    catch (err) {
        console.error("getGeminiKey error:", err);
        res
            .status(500)
            .json({ success: false, message: "Failed to retrieve API key" });
    }
    finally {
        yield connection.end();
    }
});
exports.getGeminiKey = getGeminiKey;
// ──────────────────────────────────────────────
// Delete Gemini API Key
// POST /api/v1/gemini-key/delete
// Body: { user_id }
// ──────────────────────────────────────────────
const deleteGeminiKey = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { user_id } = req.body;
    if (!user_id) {
        return res
            .status(400)
            .json({ success: false, message: "user_id is required" });
    }
    const connection = yield (0, db_1.default)();
    try {
        yield connection.execute("UPDATE tfs_user SET gemini_api_key = NULL, updated_date = NOW() WHERE user_id = ?", [user_id]);
        res.status(200).json({ success: true, message: "Gemini API key removed" });
    }
    catch (err) {
        console.error("deleteGeminiKey error:", err);
        res
            .status(500)
            .json({ success: false, message: "Failed to remove API key" });
    }
    finally {
        yield connection.end();
    }
});
exports.deleteGeminiKey = deleteGeminiKey;
