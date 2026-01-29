import path from 'path';
import fs from 'fs';

export class PathResolver {
  /**
   * Resolves file paths from Python backend to actual file system paths
   * Handles both local and production environments
   */
  static resolveFilePath(pythonFilePath: string): string {
    // If path starts with /python/uploads, it's from production environment
    if (pythonFilePath.startsWith('/python/uploads/')) {
      // Remove the /python/uploads prefix and construct actual file path
      const relativePath = pythonFilePath.replace('/python/uploads/', '');
      
      // Try to find the actual file location
      // Common locations where files might be stored
      const possibleBasePaths = [
        // Local development paths
        path.join(process.cwd(), 'uploads'),
        path.join(process.cwd(), '..', 'hrms', 'backend', 'uploads'),
        // Production paths (adjust as needed)
        path.join('C:', 'Users', 'HarshBajani', 'OneDrive - TransForm Solutions (P) Limited', 'Desktop', 'hrms', 'backend', 'uploads'),
        // Add more paths as needed for your environment
      ];
      
      for (const basePath of possibleBasePaths) {
        const fullPath = path.join(basePath, relativePath);
        if (fs.existsSync(fullPath)) {
          console.log(`File found at: ${fullPath}`);
          return fullPath;
        }
      }
      
      // If no file found, return the last attempted path for error reporting
      const lastAttemptedPath = path.join(possibleBasePaths[0], relativePath);
      console.log(`File not found, last attempted path: ${lastAttemptedPath}`);
      return lastAttemptedPath;
    }
    
    // If path doesn't start with /python/uploads, assume it's already a file system path
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
    
    if (pythonFilePath.startsWith('/python/uploads/')) {
      const relativePath = pythonFilePath.replace('/python/uploads/', '');
      console.log(`Relative path: ${relativePath}`);
      
      const possibleBasePaths = [
        path.join(process.cwd(), 'uploads'),
        path.join(process.cwd(), '..', 'hrms', 'backend', 'uploads'),
        path.join('C:', 'Users', 'HarshBajani', 'OneDrive - TransForm Solutions (P) Limited', 'Desktop', 'hrms', 'backend', 'uploads'),
      ];
      
      console.log(`Checking possible base paths:`);
      possibleBasePaths.forEach((basePath, index) => {
        const fullPath = path.join(basePath, relativePath);
        const exists = fs.existsSync(fullPath);
        console.log(`  ${index + 1}. ${basePath} -> ${fullPath} (${exists ? 'EXISTS' : 'NOT FOUND'})`);
      });
    } else {
      console.log(`Path is already a file system path`);
      const exists = fs.existsSync(pythonFilePath);
      console.log(`File exists: ${exists}`);
    }
    console.log(`========================\n`);
  }
}

export default PathResolver;
