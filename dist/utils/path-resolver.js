"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathResolver = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("../config/env");
class PathResolver {
    /**
     * Returns the base uploads paths to search - driven by the UPLOADS_DIR env variable.
     * If UPLOADS_DIR is set, it is checked first (as both the root and with a tracker_files subdirectory).
     * Falls back to paths relative to the current working directory for local development.
     */
    static getBasePaths() {
        const basePaths = [];
        // Primary: from environment variable (configured per deployment)
        if (env_1.UPLOADS_DIR) {
            basePaths.push(env_1.UPLOADS_DIR);
            basePaths.push(path_1.default.join(env_1.UPLOADS_DIR, "tracker_files"));
        }
        // Fallbacks for local development (cwd-relative)
        basePaths.push(path_1.default.join(process.cwd(), "uploads"));
        basePaths.push(path_1.default.join(process.cwd(), "uploads", "tracker_files"));
        basePaths.push(path_1.default.join(process.cwd(), "..", "hrms", "backend", "uploads"));
        basePaths.push(path_1.default.join(process.cwd(), "..", "hrms", "backend", "uploads", "tracker_files"));
        basePaths.push(path_1.default.join(process.cwd(), "..", "hrms-backup", "uploads"));
        basePaths.push(path_1.default.join(process.cwd(), "..", "hrms-backup", "uploads", "tracker_files"));
        // VPS production fallback (Hostinger)
        basePaths.push("/root/tfshrms/hrms-backend/uploads");
        basePaths.push("/root/tfshrms/hrms-backend/uploads/tracker_files");
        return basePaths;
    }
    /**
     * Strips known upload/download prefixes from a Python-style file path or full URL
     * to get just the relative filename.
     *
     * Handles:
     *  - Full HTTP URLs: http://host:port/downloads/tracker/file.xlsx  → file.xlsx
     *  - /python/uploads/tracker_files/file.xlsx                       → tracker_files/file.xlsx
     *  - uploads/tracker_files/file.xlsx                               → tracker_files/file.xlsx
     *  - Plain filenames passed through unchanged
     */
    static extractRelativePath(pythonFilePath) {
        // Strip full HTTP(S) URLs.
        // The Python backend serves files via /downloads/tracker/ but stores them
        // in uploads/tracker_files/ on disk. Since UPLOADS_DIR already points at
        // the tracker_files directory, we only need the bare filename.
        if (/^https?:\/\//i.test(pythonFilePath)) {
            try {
                const { pathname } = new URL(pythonFilePath);
                return path_1.default.basename(pathname); // e.g. "Mfunds_...xlsx"
            }
            catch (_a) {
                // URL parse failed – fall through to string-based extraction
                return path_1.default.basename(pythonFilePath);
            }
        }
        if (pythonFilePath.startsWith("/python/uploads/")) {
            return pythonFilePath.replace("/python/uploads/", "");
        }
        if (pythonFilePath.includes("uploads/")) {
            const parts = pythonFilePath.split("uploads/");
            return parts[parts.length - 1];
        }
        return pythonFilePath;
    }
    /**
     * Resolves a Python-backend file path to an absolute path on the local filesystem.
     * Checks UPLOADS_DIR first, then cwd-relative fallbacks.
     */
    static resolveFilePath(pythonFilePath) {
        const relativePath = this.extractRelativePath(pythonFilePath);
        for (const basePath of this.getBasePaths()) {
            const fullPath = path_1.default.join(basePath, relativePath);
            if (fs_1.default.existsSync(fullPath)) {
                console.log(`File found at: ${fullPath}`);
                return fullPath;
            }
        }
        console.log(`File not found in any base path: ${pythonFilePath}`);
        return pythonFilePath;
    }
    /**
     * Checks if a file exists at the resolved path.
     */
    static fileExists(pythonFilePath) {
        const resolvedPath = this.resolveFilePath(pythonFilePath);
        return fs_1.default.existsSync(resolvedPath);
    }
    /**
     * Gets file stats for the resolved path.
     */
    static getFileStats(pythonFilePath) {
        const resolvedPath = this.resolveFilePath(pythonFilePath);
        try {
            return fs_1.default.statSync(resolvedPath);
        }
        catch (_a) {
            return null;
        }
    }
    /**
     * Lists all checked paths for debugging. Call this when a file is not resolving correctly.
     */
    static debugFilePath(pythonFilePath) {
        const relativePath = this.extractRelativePath(pythonFilePath);
        console.log(`\n=== Debugging File Path ===`);
        console.log(`Original:  ${pythonFilePath}`);
        console.log(`Relative:  ${relativePath}`);
        console.log(`UPLOADS_DIR env: ${env_1.UPLOADS_DIR || "(not set)"}`);
        console.log(`Checking base paths:`);
        this.getBasePaths().forEach((basePath, index) => {
            const fullPath = path_1.default.join(basePath, relativePath);
            const exists = fs_1.default.existsSync(fullPath);
            console.log(`  ${index + 1}. [${exists ? "FOUND" : "    "}] ${fullPath}`);
        });
        console.log(`========================\n`);
    }
}
exports.PathResolver = PathResolver;
exports.default = PathResolver;
