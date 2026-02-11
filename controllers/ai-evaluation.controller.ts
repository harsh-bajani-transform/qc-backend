import { Request, Response } from 'express';
import get_db_connection from '../database/db';
import userQueries from '../queries/user-queries';
import { generateAIPrompt, parseAIResponse, generateHashes, getExistingHashes, findDuplicates } from '../utils/ai-evaluation-utils';
import { getAIServiceQueue } from '../utils/ai-service-queue';
import multer, { FileFilterCallback } from 'multer';
import xlsx from 'xlsx';
import { SCALING_CONFIG } from '../config/scaling-config';

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
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'));
    }
  }
});

// AI evaluation of Excel file
export const evaluateExcelFile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Use multer middleware to handle file upload
    upload.single('file')(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      const file = req.file;
      const { user_id, project_id, task_id } = req.body;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      if (!user_id || !project_id || !task_id) {
        return res.status(400).json({
          success: false,
          message: 'user_id, project_id, and task_id are required'
        });
      }

      const connection = await get_db_connection();

      try {
        // Verify user is QC agent or higher
        const user = await userQueries.getUserWithDesignation(user_id);
        
        if (!user || user.designation_id < 1) {
          return res.status(403).json({
            success: false,
            message: 'Access denied. Only agents can perform AI evaluation.'
          });
        }

        // Get project details to determine project category (for future use if needed)
        const [projectDetails] = await connection.execute(
          'SELECT project_category_id FROM project WHERE project_id = ?',
          [project_id]
        ) as [any[], any];

        if (projectDetails.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Project not found'
          });
        }
        
        // Parse Excel file
        let workbook;
        try {
          workbook = xlsx.read(file.buffer, { type: 'buffer' });
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: 'Invalid Excel file format'
          });
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Excel file is empty'
          });
        }

        // Get task details for important columns
        const [taskDetails] = await connection.execute(
          'SELECT important_columns FROM task WHERE task_id = ? AND project_id = ?',
          [task_id, project_id]
        ) as [any[], any];

        // Prepare AI prompt with default criteria and data
        const aiPrompt = generateAIPrompt(jsonData, taskDetails[0]?.important_columns || '');
        
        // Call AI service through queue for rate limiting
        const aiQueue = getAIServiceQueue();
        const aiResponse = await aiQueue.evaluateData(aiPrompt);
        
        // Parse AI response and format results
        const evaluationResult = parseAIResponse(aiResponse, jsonData.length);

        res.status(200).json({
          success: true,
          message: 'AI evaluation completed successfully',
          data: evaluationResult
        });

      } finally {
        await connection.end();
      }
    });
  } catch (error) {
    console.error('AI evaluation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during AI evaluation'
    });
  }
};

// Check for duplicates
export const checkDuplicates = async (req: AuthenticatedRequest, res: Response) => {
  try {
    upload.single('file')(req, res, async (err: any) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      const file = req.file;
      const { user_id, project_id, task_id } = req.body;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      if (!user_id || !project_id || !task_id) {
        return res.status(400).json({
          success: false,
          message: 'user_id, project_id, and task_id are required'
        });
      }

      const connection = await get_db_connection();

      try {
        // Verify user is QC agent or higher
        const user = await userQueries.getUserWithDesignation(user_id);
        
        if (!user || user.designation_id < 1) {
          return res.status(403).json({
            success: false,
            message: 'Access denied. Only agents can perform duplicate check.'
          });
        }

        // Get task details to understand important columns
        const [taskDetails] = await connection.execute(
          'SELECT important_columns FROM task WHERE task_id = ? AND project_id = ?',
          [task_id, project_id]
        ) as [any[], any];

        if (taskDetails.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Task not found'
          });
        }

        // Parse Excel file
        let workbook;
        try {
          workbook = xlsx.read(file.buffer, { type: 'buffer' });
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: 'Invalid Excel file format'
          });
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Excel file is empty'
          });
        }

        // Get important columns for hash generation
        const importantColumns = taskDetails[0].important_columns 
          ? taskDetails[0].important_columns.split(',').map((col: string) => col.trim())
          : (jsonData[0] && typeof jsonData[0] === 'object' ? Object.keys(jsonData[0]) : []);

        // Generate hashes for current file records
        const currentHashes = generateHashes(jsonData, importantColumns);
        
        // Get existing hashes from tracker_records table
        const existingHashes = await getExistingHashes(connection, project_id);
        
        // Find duplicates
        const duplicates = findDuplicates(currentHashes, existingHashes, jsonData);
        
        res.status(200).json({
          success: true,
          message: 'Duplicate check completed',
          data: {
            hasDuplicates: duplicates.length > 0,
            duplicateCount: duplicates.length,
            duplicates: duplicates.slice(0, 10), // Return first 10 duplicates
            totalRecords: jsonData.length,
            uniqueRecords: jsonData.length - duplicates.length
          }
        });

      } finally {
        await connection.end();
      }
    });
  } catch (error) {
    console.error('Duplicate check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during duplicate check'
    });
  }
};
