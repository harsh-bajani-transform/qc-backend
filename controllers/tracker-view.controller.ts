import { Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { PYTHON_URL } from '../config/env';

export const getTrackerData = async (req: Request, res: Response) => {
  try {
    if (!PYTHON_URL) {
      return res.status(500).json({
        success: false,
        message: 'Python backend URL not configured'
      });
    }

    // Fetch data from Python backend
    const url = `${PYTHON_URL}/tracker/view`.replace(/\/+/g, '/');
    const response = await axios.post(url, req.body);
    
    if (response.status !== 200) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch data from Python backend'
      });
    }

    const trackerData = response.data;
    const trackersWithFiles = trackerData.data.trackers.filter((tracker: any) => tracker.tracker_file);
    
    console.log(`Found ${trackersWithFiles.length} trackers with files`);
    
    for (const tracker of trackersWithFiles) {
      const filePath = tracker.tracker_file;
      console.log(`\n=== Processing Tracker ID: ${tracker.tracker_id} ===`);
      console.log(`File path: ${filePath}`);
      
      try {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          console.log(`File size: ${stats.size} bytes`);
          
          const ext = path.extname(filePath).toLowerCase();
          
          if (ext === '.xlsx' || ext === '.xls') {
            console.log('Excel file detected - reading content...');
            
            try {
              const workbook = new ExcelJS.Workbook();
              await workbook.xlsx.readFile(filePath);
              
              console.log(`Worksheets found: ${workbook.worksheets.length}`);
              
              workbook.eachSheet((worksheet, sheetId) => {
                console.log(`\n--- Sheet ${sheetId}: ${worksheet.name} ---`);
                console.log(`Dimensions: ${worksheet.rowCount} rows × ${worksheet.columnCount} columns`);
                
                // Read first 10 rows of data
                const data: any[] = [];
                worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                  if (rowNumber <= 10) {
                    const rowData: any = {};
                    row.eachCell((cell, colNumber) => {
                      rowData[`col_${colNumber}`] = cell.value;
                    });
                    data.push(rowData);
                    console.log(`Row ${rowNumber}:`, rowData);
                  }
                });
                
                if (worksheet.rowCount > 10) {
                  console.log(`... and ${worksheet.rowCount - 10} more rows`);
                }
              });
              
            } catch (excelError) {
              console.log('Error reading Excel file:', excelError instanceof Error ? excelError.message : String(excelError));
            }
          } else {
            console.log(`File type ${ext} not supported - only Excel files are processed`);
          }
        } else {
          console.log('File does not exist at path:', filePath);
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
