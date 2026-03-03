import path from "path";
import fs from "fs";

export class PathResolver {
  /**
   * Resolves file paths from Python backend to actual file system paths
   * Handles both local and production environments
   */
  static resolveFilePath(pythonFilePath: string): string {
    let relativePath = pythonFilePath;

    // Normalize path by removing known prefixes
    if (pythonFilePath.startsWith("/python/uploads/")) {
      relativePath = pythonFilePath.replace("/python/uploads/", "");
    } else if (pythonFilePath.startsWith("uploads/")) {
      relativePath = pythonFilePath.replace("uploads/", "");
    } else if (pythonFilePath.includes("uploads/")) {
      // Handle cases like "backend/uploads/..."
      const parts = pythonFilePath.split("uploads/");
      relativePath = parts[parts.length - 1];
    }

    // List of possible base paths for the 'uploads' directory
    const possibleBasePaths = [
      path.join(process.cwd(), "uploads"),
      path.join(process.cwd(), "uploads", "tracker_files"),
      path.join(process.cwd(), "..", "hrms", "backend", "uploads"),
      path.join(
        process.cwd(),
        "..",
        "hrms",
        "backend",
        "uploads",
        "tracker_files",
      ),
      path.join(
        "C:",
        "Users",
        "HarshBajani",
        "OneDrive - TransForm Solutions (P) Limited",
        "Desktop",
        "hrms",
        "backend",
        "uploads",
      ),
      path.join(
        "C:",
        "Users",
        "HarshBajani",
        "OneDrive - TransForm Solutions (P) Limited",
        "Desktop",
        "hrms",
        "backend",
        "uploads",
        "tracker_files",
      ),
      path.join(
        "C:",
        "Users",
        "HarshBajani",
        "OneDrive - TransForm Solutions (P) Limited",
        "Desktop",
        "hrms-backup",
        "uploads",
      ),
      path.join(
        "C:",
        "Users",
        "HarshBajani",
        "OneDrive - TransForm Solutions (P) Limited",
        "Desktop",
        "hrms-backup",
        "uploads",
        "tracker_files",
      ),
      "/root/tfshrms/hrms-backend/uploads",
      "/root/tfshrms/hrms-backend/uploads/tracker_files",
    ];

    for (const basePath of possibleBasePaths) {
      const fullPath = path.join(basePath, relativePath);
      if (fs.existsSync(fullPath)) {
        console.log(`File found at: ${fullPath}`);
        return fullPath;
      }
    }

    // If no file found among base paths, return the original or a best guess
    console.log(`File not found in any base path: ${pythonFilePath}`);
    return pythonFilePath;
  }

  /**
   * Checks if a file exists at the resolved path
   */
  static fileExists(pythonFilePath: string): boolean {
    const resolvedPath = this.resolveFilePath(pythonFilePath);
    return fs.existsSync(resolvedPath);
  }

  /**
   * Gets file stats for the resolved path
   */
  static getFileStats(pythonFilePath: string): fs.Stats | null {
    const resolvedPath = this.resolveFilePath(pythonFilePath);
    try {
      return fs.statSync(resolvedPath);
    } catch (error) {
      return null;
    }
  }

  /**
   * Lists all possible file locations for debugging
   */
  static debugFilePath(pythonFilePath: string): void {
    console.log(`\n=== Debugging File Path ===`);
    console.log(`Original path from Python: ${pythonFilePath}`);

    let relativePath = pythonFilePath;
    if (pythonFilePath.startsWith("/python/uploads/")) {
      relativePath = pythonFilePath.replace("/python/uploads/", "");
    } else if (pythonFilePath.startsWith("uploads/")) {
      relativePath = pythonFilePath.replace("uploads/", "");
    } else if (pythonFilePath.includes("uploads/")) {
      const parts = pythonFilePath.split("uploads/");
      relativePath = parts[parts.length - 1];
    }

    console.log(`Identified relative path: ${relativePath}`);

    const possibleBasePaths = [
      path.join(process.cwd(), "uploads"),
      path.join(process.cwd(), "..", "hrms", "backend", "uploads"),
      path.join(
        "C:",
        "Users",
        "HarshBajani",
        "OneDrive - TransForm Solutions (P) Limited",
        "Desktop",
        "hrms",
        "backend",
        "uploads",
      ),
      path.join(
        "C:",
        "Users",
        "HarshBajani",
        "OneDrive - TransForm Solutions (P) Limited",
        "Desktop",
        "hrms-backup",
        "uploads",
      ),
      "/root/tfshrms/hrms-backend/uploads",
    ];

    console.log(`Checking possible base paths:`);
    possibleBasePaths.forEach((basePath, index) => {
      const fullPath = path.join(basePath, relativePath);
      const exists = fs.existsSync(fullPath);
      console.log(
        `  ${index + 1}. ${basePath} -> ${fullPath} (${exists ? "EXISTS" : "NOT FOUND"})`,
      );
    });
    console.log(`========================\n`);
  }
}

export default PathResolver;
