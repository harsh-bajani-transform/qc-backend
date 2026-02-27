import { Request, Response } from "express";
import get_db_connection from "../database/db";
import userQueries from "../queries/user-queries";
import AIService from "../config/ai";
import {
  findDuplicates,
  generateAIPrompt,
  generateHashes,
  getExistingHashes,
  parseAIResponse,
  parseImportantColumns,
  aggregateAIResults,
} from "../utils/ai-evaluation-utils";
import multer, { FileFilterCallback } from "multer";
import xlsx from "xlsx";
import crypto from "crypto";

// Extend Request interface to include file
interface AuthenticatedRequest extends Request {
  file?: Express.Multer.File;
}

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (
    req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback,
  ) => {
    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel files are allowed"));
    }
  },
});

// AI evaluation of Excel file
export const evaluateExcelFile = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    // Use multer middleware to handle file upload
    upload.single("file")(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }

      const file = req.file;
      const { user_id, project_id, task_id, gemini_api_key } = req.body;

      const userId = Number(user_id);
      const projectId = Number(project_id);
      const taskId = Number(task_id);
      const userApiKey = gemini_api_key
        ? String(gemini_api_key).trim()
        : undefined;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      if (!userId || !projectId || !taskId) {
        return res.status(400).json({
          success: false,
          message: "user_id, project_id, and task_id are required",
        });
      }

      const connection = await get_db_connection();

      try {
        // Verify user is QC agent or higher
        const user = await userQueries.getUserWithDesignation(userId);

        if (!user || user.designation_id < 1) {
          return res.status(403).json({
            success: false,
            message: "Access denied. Only agents can perform AI evaluation.",
          });
        }

        // Parse Excel file
        let workbook;
        try {
          workbook = xlsx.read(file.buffer, { type: "buffer" });
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: "Invalid Excel file format",
          });
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Excel file is empty",
          });
        }

        // Get task details for important columns
        const [taskDetails] = (await connection.execute(
          "SELECT important_columns FROM task WHERE task_id = ? AND project_id = ?",
          [taskId, projectId],
        )) as [any[], any];

        const importantColumns = taskDetails[0]?.important_columns || "";

        // --- BATCH PROCESSING ---
        const BATCH_SIZE = 50;
        const totalRecords = jsonData.length;
        const batches = [];

        for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
          batches.push(jsonData.slice(i, i + BATCH_SIZE));
        }

        console.log(
          `Processing ${totalRecords} records in ${batches.length} batches...`,
        );

        // Process all batches in parallel
        const batchPromises = batches.map(async (batch, index) => {
          const aiPrompt = generateAIPrompt(batch, importantColumns);
          const aiResponse = await AIService.evaluateData(aiPrompt, userApiKey);
          return parseAIResponse(aiResponse, batch.length);
        });

        const batchResults = await Promise.all(batchPromises);

        // Aggregate results
        const aggregatedResult = aggregateAIResults(batchResults);

        res.status(200).json({
          success: aggregatedResult?.status === "success" || true,
          message:
            aggregatedResult?.message || "AI evaluation completed successfully",
          data: aggregatedResult,
        });
      } finally {
        await connection.end();
      }
    });
  } catch (error) {
    console.error("AI evaluation error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during AI evaluation",
    });
  }
};

// Check for duplicates
export const checkDuplicates = async (
  req: AuthenticatedRequest,
  res: Response,
) => {
  try {
    upload.single("file")(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message,
        });
      }

      const file = req.file;
      const { user_id, project_id, task_id } = req.body;

      const userId = Number(user_id);
      const projectId = Number(project_id);
      const taskId = Number(task_id);

      if (!file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      if (!userId || !projectId || !taskId) {
        return res.status(400).json({
          success: false,
          message: "user_id, project_id, and task_id are required",
        });
      }

      const connection = await get_db_connection();

      try {
        // Verify user is QC agent or higher
        const user = await userQueries.getUserWithDesignation(userId);

        if (!user || user.designation_id < 1) {
          return res.status(403).json({
            success: false,
            message: "Access denied. Only agents can perform duplicate check.",
          });
        }

        // Get task details to understand important columns
        const [taskDetails] = (await connection.execute(
          "SELECT important_columns FROM task WHERE task_id = ? AND project_id = ?",
          [taskId, projectId],
        )) as [any[], any];

        if (taskDetails.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Task not found",
          });
        }

        // Parse Excel file
        let workbook;
        try {
          workbook = xlsx.read(file.buffer, { type: "buffer" });
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: "Invalid Excel file format",
          });
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          return res.status(400).json({
            success: false,
            message: "Excel file is empty",
          });
        }

        const fallbackHeaders =
          jsonData[0] && typeof jsonData[0] === "object"
            ? Object.keys(jsonData[0] as any)
            : [];
        const importantColumns = parseImportantColumns(
          taskDetails[0].important_columns,
          fallbackHeaders,
        );

        // Generate hashes for current file records
        const currentHashes = generateHashes(jsonData, importantColumns);

        // DEBUG: Log sample of generated hashes
        if (currentHashes.length > 0) {
          console.log(
            `[Duplicate Check] Sample Hash Input: "${currentHashes[0].hashInput}" -> Hash: ${currentHashes[0].hash}`,
          );
        }

        // Get existing hashes from tracker_records table (Global Check)
        const existingHashes = await getExistingHashes(connection);

        console.log(
          `[Duplicate Check] Found ${existingHashes.length} existing hashes in DB (Global Check)`,
        );
        if (existingHashes.length > 0) {
          console.log(`[Duplicate Check] Sample DB Hash: ${existingHashes[0]}`);
        }

        // Find duplicates
        const duplicates = findDuplicates(
          currentHashes,
          existingHashes,
          jsonData,
          importantColumns,
        );

        res.status(200).json({
          success: true,
          message: "Duplicate check completed",
          data: {
            hasDuplicates: duplicates.length > 0,
            duplicateCount: duplicates.length,
            duplicates: duplicates.slice(0, 10), // Return first 10 duplicates
            totalRecords: jsonData.length,
            uniqueRecords: jsonData.length - duplicates.length,
          },
        });
      } finally {
        await connection.end();
      }
    });
  } catch (error) {
    console.error("Duplicate check error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during duplicate check",
    });
  }
};
