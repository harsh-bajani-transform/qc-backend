import { Request, Response } from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import crypto from 'crypto';
import get_db_connection from '../database/db';
import { PYTHON_URL } from '../config/env';

export const processExcelFiles = async (req: Request, res: Response) => {
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
    
    const connection = await get_db_connection();
    let totalRecordsProcessed = 0;
    let totalDuplicatesSkipped = 0;
    
    for (const tracker of trackersWithFiles) {
      const filePath = tracker.tracker_file;
      console.log(`\n=== Processing Tracker ID: ${tracker.tracker_id} ===`);
      console.log(`File path: ${filePath}`);
      console.log(`Task ID: ${tracker.task_id}, Project ID: ${tracker.project_id}, User ID: ${tracker.user_id}`);
      
      // Initialize QC performance tracking for this tracker
      let qcPerformanceId: number | null = null;
      let trackerRecordsProcessed = 0;
      let trackerDuplicatesFound = 0;
      
      try {
        // Get task details including important_columns
        console.log('Querying task table for ID:', tracker.task_id);
        const [taskRows] = await connection.execute(
          'SELECT task_id, task_name, important_columns FROM task WHERE task_id = ?',
          [tracker.task_id]
        ) as [any[], any];
        
        console.log('Task query result:', taskRows);
        
        if (taskRows.length === 0) {
          console.log(`Task ID ${tracker.task_id} not found`);
          continue;
        }
        
        const task = taskRows[0];
        console.log('Task found:', task);
        const importantColumns = task.important_columns ? JSON.parse(task.important_columns) : [];
        console.log('Important columns parsed:', importantColumns);
        
        console.log(`Task: ${task.task_name}`);
        console.log(`Important columns: ${importantColumns.join(', ')}`);
        
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          console.log(`File size: ${stats.size} bytes`);
          
          const ext = path.extname(filePath).toLowerCase();
          console.log(`File extension detected: ${ext}`);
          
          if (ext === '.xlsx' || ext === '.xls') {
            console.log('Excel file detected - reading content...');
            
            // Check if QC record already exists for this file
            const [existingQC] = await connection.execute(
              'SELECT id FROM qc_performance WHERE file_name = ?',
              [path.basename(filePath)]
            ) as [any[], any];
            
            if (existingQC.length > 0) {
              console.log(`QC record already exists for file: ${filePath} (ID: ${existingQC[0].id})`);
              qcPerformanceId = existingQC[0].id;
            } else {
              // Only create QC performance record for Excel files if it doesn't exist
              const [qcResult] = await connection.execute(
                `INSERT INTO qc_performance 
                 (user_id, project_id, task_id, tracker_id, file_name, important_columns, processing_status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  tracker.user_id,
                  tracker.project_id,
                  tracker.task_id,
                  tracker.tracker_id,
                  path.basename(filePath),
                  JSON.stringify(importantColumns),
                  'processing'
                ]
              ) as any;
              
              qcPerformanceId = qcResult.insertId;
              console.log(`QC performance record created with ID: ${qcPerformanceId}`);
            }
            
            try {
              const workbook = new ExcelJS.Workbook();
              await workbook.xlsx.readFile(filePath);
              
              console.log(`Excel workbook loaded, worksheets: ${workbook.worksheets.length}`);
              
              let fileProcessingSuccess = true;
              
              try {
                for (let sheetIndex = 0; sheetIndex < workbook.worksheets.length; sheetIndex++) {
                  const worksheet = workbook.worksheets[sheetIndex];
                  const sheetId = sheetIndex + 1;
                  console.log(`\n--- Processing Sheet ${sheetId}: ${worksheet.name} ---`);
                  console.log(`Sheet dimensions: ${worksheet.rowCount} rows × ${worksheet.columnCount} columns`);
                  
                  // Get headers from first row
                  const headers: string[] = [];
                  worksheet.getRow(1).eachCell((cell, colNumber) => {
                    headers[colNumber - 1] = cell.value?.toString() || `col_${colNumber}`;
                  });
                  
                  console.log('Headers extracted:', headers);
                  
                  // Process data rows (skip header row)
                  let sheetRecordsProcessed = 0;
                  let sheetDuplicatesSkipped = 0;
                  const duplicateRows: number[] = []; // Track row numbers to remove
                  
                  console.log(`Starting to process ${worksheet.rowCount - 1} data rows...`);
                  
                  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
                    const row = worksheet.getRow(rowNumber);
                    if (!row || row.values.length === 0) continue;
                    
                    // Create record object
                    const record: any = {};
                    headers.forEach((header, index) => {
                      record[header] = row.getCell(index + 1).value;
                    });
                    
                    // Generate hash based on dynamic important columns
                    const hashInput = importantColumns
                      .map((col: string) => {
                        // Handle case-insensitive column matching
                        const matchingHeader = headers.find(h => 
                          h.toLowerCase().trim() === col.toLowerCase().trim()
                        );
                        return matchingHeader ? (record[matchingHeader] || '') : '';
                      })
                      .join('|')
                      .toLowerCase()
                      .trim();
                    
                    const hashValue = crypto.createHash('sha256').update(hashInput).digest('hex');
                    
                    // Check for duplicate
                    const [existingRows] = await connection.execute(
                      'SELECT id FROM tracker_records WHERE task_id = ? AND hash_value = ?',
                      [tracker.task_id, hashValue]
                    ) as [any[], any];
                    
                    if (existingRows.length > 0) {
                      duplicateRows.push(rowNumber); // Mark row for removal
                      sheetDuplicatesSkipped++;
                      trackerDuplicatesFound++;
                      console.log(`Duplicate found in row ${rowNumber}, marking for removal...`);
                      continue;
                    }
                    
                    // Insert new record
                    await connection.execute(
                      `INSERT INTO tracker_records 
                       (user_id, project_id, task_id, record_data, hash_value, status) 
                       VALUES (?, ?, ?, ?, ?, ?)`,
                      [
                        tracker.user_id,
                        tracker.project_id,
                        tracker.task_id,
                        JSON.stringify(record),
                        hashValue,
                        'ready'
                      ]
                    );
                    
                    sheetRecordsProcessed++;
                    trackerRecordsProcessed++;
                    console.log(`Inserted record from row ${rowNumber}`);
                  }
                  
                  // Remove duplicate rows from Excel file
                  if (duplicateRows.length > 0) {
                    console.log(`Removing ${duplicateRows.length} duplicate rows from Excel file...`);
                    
                    // Sort rows in descending order to remove from bottom to top
                    duplicateRows.sort((a, b) => b - a);
                    
                    duplicateRows.forEach(rowNumber => {
                      worksheet.spliceRows(rowNumber, 1);
                    });
                    
                    // Save cleaned Excel file
                    await workbook.xlsx.writeFile(filePath);
                    console.log(`Excel file cleaned and saved: ${filePath}`);
                  }
                  
                  totalRecordsProcessed += sheetRecordsProcessed;
                  totalDuplicatesSkipped += sheetDuplicatesSkipped;
                  console.log(`Sheet ${worksheet.name}: ${sheetRecordsProcessed} records inserted, ${sheetDuplicatesSkipped} duplicates removed from file`);
                }
              } catch (processingError) {
                console.error('Error during Excel processing:', processingError);
                fileProcessingSuccess = false;
                
                // Mark any partially processed records as failed
                await connection.execute(
                  'UPDATE tracker_records SET status = ? WHERE task_id = ? AND status = ?',
                  ['failed', tracker.task_id, 'processing']
                );
              }
              
              // Update status for this tracker file
              const finalStatus = fileProcessingSuccess ? 'completed' : 'failed';
              
              // Update QC performance record
              if (qcPerformanceId) {
                await connection.execute(
                  `UPDATE qc_performance 
                   SET total_records_processed = ?, duplicates_found = ?, duplicates_removed = ?, 
                       unique_records = ?, processing_status = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?`,
                  [
                    trackerRecordsProcessed,
                    trackerDuplicatesFound,
                    trackerDuplicatesFound,
                    trackerRecordsProcessed,
                    finalStatus,
                    qcPerformanceId
                  ]
                );
              }
              
              console.log(`Tracker ${tracker.tracker_id} processing completed with status: ${finalStatus}`);
              console.log(`QC Performance: ${trackerRecordsProcessed} unique, ${trackerDuplicatesFound} duplicates removed`);
              
            } catch (excelError) {
              console.log('Error reading Excel file:', excelError instanceof Error ? excelError.message : String(excelError));
              
              // Update QC performance record with failed status
              if (qcPerformanceId) {
                await connection.execute(
                  'UPDATE qc_performance SET processing_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                  ['failed', qcPerformanceId]
                );
              }
            }
          } else {
            console.log(`File type ${ext} not supported - only Excel files are processed`);
            // No QC record created for non-Excel files
          }
        } else {
          console.log('File does not exist at path:', filePath);
          // No QC record created for missing files
        }
      } catch (error) {
        console.log('Error reading file:', error instanceof Error ? error.message : String(error));
        
        // Update QC performance record with error status
        if (qcPerformanceId) {
          await connection.execute(
            'UPDATE qc_performance SET processing_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['failed', qcPerformanceId]
          );
        }
      }
    }
    
    await connection.end();
    
    console.log(`\n=== Summary ===`);
    console.log(`Total records processed: ${totalRecordsProcessed}`);
    console.log(`Total duplicates skipped: ${totalDuplicatesSkipped}`);
    
    res.status(200).json({
      success: true,
      message: 'Excel files processed and data stored successfully',
      data: {
        processedFiles: trackersWithFiles.length,
        recordsInserted: totalRecordsProcessed,
        duplicatesRemoved: totalDuplicatesSkipped
      }
    });
  } catch (error) {
    console.error('Error in processExcelFiles:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing Excel files',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
