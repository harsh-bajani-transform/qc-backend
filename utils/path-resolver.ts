import path from "path";
import fs from "fs";
import { UPLOADS_DIR } from "../config/env";

export class PathResolver {
  /**
   * Returns the base uploads paths to search - driven by the UPLOADS_DIR env variable.
   * If UPLOADS_DIR is set, it is checked first (as both the root and with a tracker_files subdirectory).
   * Falls back to paths relative to the current working directory for local development.
   */
  private static getBasePaths(): string[] {
    const basePaths: string[] = [];

    // Primary: from environment variable (configured per deployment)
    if (UPLOADS_DIR) {
      basePaths.push(UPLOADS_DIR);
      basePaths.push(path.join(UPLOADS_DIR, "tracker_files"));
    }

    // Fallbacks for local development (cwd-relative)
    basePaths.push(path.join(process.cwd(), "uploads"));
    basePaths.push(path.join(process.cwd(), "uploads", "tracker_files"));
    basePaths.push(
      path.join(process.cwd(), "..", "hrms", "backend", "uploads"),
    );
    basePaths.push(
      path.join(
        process.cwd(),
        "..",
        "hrms",
        "backend",
        "uploads",
        "tracker_files",
      ),
    );
    basePaths.push(path.join(process.cwd(), "..", "hrms-backup", "uploads"));
    basePaths.push(
      path.join(process.cwd(), "..", "hrms-backup", "uploads", "tracker_files"),
    );

    return basePaths;
  }

  /**
   * Strips known upload prefixes from a Python-style file path to get the relative filename.
   */
  private static extractRelativePath(pythonFilePath: string): string {
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
  static resolveFilePath(pythonFilePath: string): string {
    const relativePath = this.extractRelativePath(pythonFilePath);

    for (const basePath of this.getBasePaths()) {
      const fullPath = path.join(basePath, relativePath);
      if (fs.existsSync(fullPath)) {
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
  static fileExists(pythonFilePath: string): boolean {
    const resolvedPath = this.resolveFilePath(pythonFilePath);
    return fs.existsSync(resolvedPath);
  }

  /**
   * Gets file stats for the resolved path.
   */
  static getFileStats(pythonFilePath: string): fs.Stats | null {
    const resolvedPath = this.resolveFilePath(pythonFilePath);
    try {
      return fs.statSync(resolvedPath);
    } catch {
      return null;
    }
  }

  /**
   * Lists all checked paths for debugging. Call this when a file is not resolving correctly.
   */
  static debugFilePath(pythonFilePath: string): void {
    const relativePath = this.extractRelativePath(pythonFilePath);
    console.log(`\n=== Debugging File Path ===`);
    console.log(`Original:  ${pythonFilePath}`);
    console.log(`Relative:  ${relativePath}`);
    console.log(`UPLOADS_DIR env: ${UPLOADS_DIR || "(not set)"}`);
    console.log(`Checking base paths:`);
    this.getBasePaths().forEach((basePath, index) => {
      const fullPath = path.join(basePath, relativePath);
      const exists = fs.existsSync(fullPath);
      console.log(`  ${index + 1}. [${exists ? "FOUND" : "    "}] ${fullPath}`);
    });
    console.log(`========================\n`);
  }
}

export default PathResolver;
