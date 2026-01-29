import { Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { PYTHON_URL } from '../config/env';
import { get_db_connection } from '../database/db';
import { PathResolver } from '../utils/path-resolver';

export const getTrackerData = async (req: Request, res: Response) => {
  try {
    if (!PYTHON_URL) {
      return res.status(500).json({
        success: false,
        message: 'Python backend URL not configured'
      });
    }

    // Fix the request body to match Python backend expectations
    const pythonRequestBody = {
      ...req.body,
      logged_in_user_id: req.body.user_id || req.body.logged_in_user_id
    };

    // Fetch data from Python backend
    const url = `${PYTHON_URL}/tracker/view`.replace(/\/+/g, '/');
    const response = await axios.post(url, pythonRequestBody);
    
    if (response.status !== 200) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch data from Python backend'
      });
    }

    const trackerData = response.data;
    const trackersWithFiles = trackerData.data.trackers.filter((tracker: any) => tracker.tracker_file);
    
    console.log(`Found ${trackersWithFiles.length} trackers with files`);
    
    // Get database connection to fetch task information
    const connection = await get_db_connection();
    
    // Add task information (including important_columns) to each tracker
    for (const tracker of trackersWithFiles) {
      try {
        const [taskRows] = await connection.execute(
          'SELECT task_id, task_name, important_columns FROM task WHERE task_id = ?',
          [tracker.task_id]
        ) as [any[], any];
        
        if (taskRows.length > 0) {
          const task = taskRows[0];
          let importantColumns: any[] = [];
          if (task.important_columns) {
            try {
              importantColumns = JSON.parse(task.important_columns);
            } catch (parseError) {
              console.error(
                `Error parsing important_columns for task ${task.task_id}:`,
                parseError
              );
              importantColumns = [];
            }
          }
          tracker.task_info = {
            task_id: task.task_id,
            task_name: task.task_name,
            important_columns: importantColumns
          };
        } else {
          tracker.task_info = {
            task_id: tracker.task_id,
            task_name: 'Unknown Task',
            important_columns: []
          };
        }
      } catch (error) {
        console.error(`Error fetching task info for task ${tracker.task_id}:`, error);
        tracker.task_info = {
          task_id: tracker.task_id,
          task_name: 'Error Loading Task',
          important_columns: []
        };
      }
    }
    
    await connection.end();
    
    // Display basic file information (no hash generation)
    for (const tracker of trackersWithFiles) {
      const filePath = tracker.tracker_file;
      const resolvedFilePath = PathResolver.resolveFilePath(filePath);
      
      console.log(`\n=== Processing Tracker ID: ${tracker.tracker_id} ===`);
      console.log(`Task ID: ${tracker.task_id}`);
      console.log(`Task Name: ${tracker.task_info.task_name}`);
      console.log(`Important Columns: ${tracker.task_info.important_columns.join(', ')}`);
      console.log(`Original file path: ${filePath}`);
      console.log(`Resolved file path: ${resolvedFilePath}`);
      
      // Debug file path if not found
      if (!fs.existsSync(resolvedFilePath)) {
        PathResolver.debugFilePath(filePath);
      }
      
      try {
        if (fs.existsSync(resolvedFilePath)) {
          const stats = fs.statSync(resolvedFilePath);
          console.log(`File size: ${stats.size} bytes`);
          
          const ext = path.extname(resolvedFilePath).toLowerCase();
          
          if (ext === '.xlsx' || ext === '.xls') {
            console.log('Excel file detected - showing basic info...');
            
            try {
              const workbook = new ExcelJS.Workbook();
              await workbook.xlsx.readFile(resolvedFilePath);
              
              console.log(`Worksheets found: ${workbook.worksheets.length}`);
              
              workbook.eachSheet((worksheet, sheetId) => {
                console.log(`Sheet ${sheetId}: ${worksheet.name} (${worksheet.rowCount} rows × ${worksheet.columnCount} columns)`);
              });
              
            } catch (excelError) {
              console.log('Error reading Excel file:', excelError instanceof Error ? excelError.message : String(excelError));
            }
          } else {
            console.log(`File type ${ext} not supported - only Excel files are processed`);
          }
        } else {
          console.log('File does not exist at resolved path:', resolvedFilePath);
        }
      } catch (error) {
        console.log('Error reading file:', error instanceof Error ? error.message : String(error));
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Tracker data fetched successfully',
      data: trackerData.data,
      processedFiles: trackersWithFiles.length
    });
  } catch (error) {
    console.error('Error in getTrackerData:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tracker data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
