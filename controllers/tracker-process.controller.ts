import { Request, Response } from "express";
import axios from "axios";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import crypto from "crypto";
import multer from "multer";
import get_db_connection from "../database/db";
import { PYTHON_URL } from "../config/env";
import { PathResolver } from "../utils/path-resolver";

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

export const processExcelFiles = async (req: Request, res: Response) => {
  const contentType = String(req.headers["content-type"] || "");

  if (contentType.includes("multipart/form-data")) {
    return upload.single("file")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err instanceof Error ? err.message : "File upload error",
        });
      }

      const mreq = req as MulterRequest;

      if (!mreq.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      const projectId = Number((mreq.body as any)?.project_id);
      const taskId = Number((mreq.body as any)?.task_id);
      const userId = Number((mreq.body as any)?.user_id);
      const validateOnly = (mreq.body as any)?.validate_only === 'true';

      if (!projectId || !taskId || !userId) {
        return res.status(400).json({
          success: false,
          message: "project_id, task_id, and user_id are required",
        });
      }

      const connection = await get_db_connection();

      try {
        const [taskRows] = (await connection.execute(
          "SELECT important_columns FROM task WHERE task_id = ? AND project_id = ?",
          [taskId, projectId],
        )) as [any[], any];

        let importantColumns: string[] = [];
        const rawImportant = taskRows?.[0]?.important_columns;

        if (Array.isArray(rawImportant)) {
          importantColumns = rawImportant;
        } else if (
          typeof rawImportant === "string" &&
          rawImportant.trim().length > 0
        ) {
          try {
            const parsed = JSON.parse(rawImportant);
            if (Array.isArray(parsed)) importantColumns = parsed;
            else
              importantColumns = rawImportant
                .split(",")
                .map((c: string) => c.trim())
                .filter(Boolean);
          } catch {
            importantColumns = rawImportant
              .split(",")
              .map((c: string) => c.trim())
              .filter(Boolean);
          }
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(mreq.file.buffer as unknown as any);

        const currentSessionHashes = new Set<string>();
        let recordsInserted = 0;
        let duplicatesSkipped = 0;
        const duplicatesFound: {
          rowNumber: number;
          hashValue: string;
          record: any;
          duplicateType: 'within-file' | 'database';
        }[] = [];
        
        let allRowHashes: {
          rowNumber: number;
          hashValue: string;
          record: any;
        }[] = [];

        for (const worksheet of workbook.worksheets) {
          const headers: string[] = [];
          worksheet.getRow(1).eachCell((cell, colNumber) => {
            headers[colNumber - 1] =
              cell.value?.toString() || `col_${colNumber}`;
          });

          const allHashes: string[] = [];
          const rowHashes: {
            rowNumber: number;
            hashValue: string;
            record: any;
          }[] = [];

          for (
            let rowNumber = 2;
            rowNumber <= worksheet.rowCount;
            rowNumber++
          ) {
            const row = worksheet.getRow(rowNumber);
            if (!row || row.values.length === 0) continue;

            const record: any = {};
            headers.forEach((header, index) => {
              record[header] = row.getCell(index + 1).value;
            });

            const colsToUse =
              importantColumns.length > 0 ? importantColumns : headers;
            const hashInput = colsToUse
              .map((col: string) => {
                const matchingHeader = headers.find(
                  (h) => h.toLowerCase().trim() === col.toLowerCase().trim(),
                );
                return matchingHeader ? (record[matchingHeader] ?? "") : "";
              })
              .join("|")
              .toLowerCase()
              .trim();

            const hashValue = crypto
              .createHash("sha256")
              .update(hashInput)
              .digest("hex");

            // Check for duplicates within the current file
            if (currentSessionHashes.has(hashValue)) {
              duplicatesFound.push({
                rowNumber,
                hashValue,
                record,
                duplicateType: 'within-file'
              });
              duplicatesSkipped++;
              continue;
            }

            currentSessionHashes.add(hashValue);
            allHashes.push(hashValue);
            rowHashes.push({ rowNumber, hashValue, record });
          }

          // Accumulate all row hashes from this worksheet
          allRowHashes = [...allRowHashes, ...rowHashes];

          let existingHashes = new Set<string>();
          if (allHashes.length > 0) {
            const placeholders = allHashes.map(() => "?").join(",");
            const [existingRows] = (await connection.execute(
              `SELECT DISTINCT hash_value FROM tracker_records WHERE project_id = ? AND task_id = ? AND hash_value IN (${placeholders})`,
              [projectId, taskId, ...allHashes],
            )) as [any[], any];
            existingHashes = new Set(
              existingRows.map((r: any) => r.hash_value),
            );
          }

          // Check for duplicates in database and collect them
          for (const { rowNumber, hashValue, record } of rowHashes) {
            if (existingHashes.has(hashValue)) {
              duplicatesFound.push({
                rowNumber,
                hashValue,
                record,
                duplicateType: 'database'
              });
              duplicatesSkipped++;
              continue;
            }
          }

          // If any duplicates found, reject the entire file
          if (duplicatesFound.length > 0) {
            const withinFileDuplicates = duplicatesFound.filter(d => d.duplicateType === 'within-file');
            const databaseDuplicates = duplicatesFound.filter(d => d.duplicateType === 'database');
            
            let errorMessage = `File upload rejected: Found ${duplicatesFound.length} duplicate records.`;
            
            if (withinFileDuplicates.length > 0) {
              errorMessage += ` ${withinFileDuplicates.length} duplicates within the file (rows: ${withinFileDuplicates.map(d => d.rowNumber).join(', ')}).`;
            }
            
            if (databaseDuplicates.length > 0) {
              errorMessage += ` ${databaseDuplicates.length} duplicates already exist in database (rows: ${databaseDuplicates.map(d => d.rowNumber).join(', ')}).`;
            }
            
            errorMessage += ' Please remove duplicates and upload again.';
            
            return res.status(400).json({
              success: false,
              message: errorMessage,
              data: {
                duplicatesFound: duplicatesFound.length,
                withinFileDuplicates: withinFileDuplicates.length,
                databaseDuplicates: databaseDuplicates.length,
                duplicateDetails: duplicatesFound.map(d => ({
                  row: d.rowNumber,
                  type: d.duplicateType,
                  hash: d.hashValue,
                  record: d.record
                }))
              }
            });
          }

          // Only proceed with insertion if no duplicates found AND not in validation mode
          if (!validateOnly) {
            for (const { hashValue, record } of allRowHashes) {
              await connection.execute(
                `INSERT INTO tracker_records 
                 (user_id, project_id, task_id, record_data, hash_value, status) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  userId,
                  projectId,
                  taskId,
                  JSON.stringify(record),
                  hashValue,
                  "ready",
                ],
              );

              recordsInserted++;
            }
          }
        }

        return res.status(200).json({
          success: true,
          message: validateOnly 
            ? "File validation passed - no duplicates found" 
            : "Excel processed successfully",
          data: {
            recordsInserted: validateOnly ? 0 : recordsInserted,
            duplicatesSkipped,
            validationMode: validateOnly,
            validRecords: allRowHashes.length,
            readyForProcessing: validateOnly
          },
        });
      } catch (error) {
        console.error("Error in processExcelFiles:", error);
        return res.status(500).json({
          success: false,
          message: "Error processing Excel files",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        await connection.end();
      }
    });
  }

  try {
    if (!PYTHON_URL) {
      return res.status(500).json({
        success: false,
        message: "Python backend URL not configured",
      });
    }

    const reqBody = (req.body || {}) as any;
    const pythonRequestBody = {
      ...reqBody,
      logged_in_user_id: reqBody.user_id || reqBody.logged_in_user_id,
    };

    const url = `${PYTHON_URL}/tracker/view`.replace(/\/+/g, "/");
    const response = await axios.post(url, pythonRequestBody);

    if (response.status !== 200) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch data from Python backend",
      });
    }

    const trackerData = response.data;
    const trackersWithFiles = trackerData.data.trackers.filter(
      (tracker: any) => tracker.tracker_file,
    );

    console.log(`Found ${trackersWithFiles.length} trackers with files`);

    // Filter to only include files that actually exist
    const existingFiles = trackersWithFiles.filter((tracker: any) => {
      const resolvedFilePath = PathResolver.resolveFilePath(
        tracker.tracker_file,
      );
      const exists = fs.existsSync(resolvedFilePath);
      if (!exists) {
        console.log(
          `Skipping tracker ${tracker.tracker_id} - file not found: ${tracker.tracker_file}`,
        );
        console.log(`Resolved path: ${resolvedFilePath}`);
        PathResolver.debugFilePath(tracker.tracker_file);
      }
      return exists;
    });

    console.log(`Found ${existingFiles.length} files that actually exist`);

    if (existingFiles.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No valid files found to process",
        data: {
          processedFiles: 0,
          recordsInserted: 0,
          duplicatesRemoved: 0,
        },
      });
    }

    const connection = await get_db_connection();
    let totalRecordsProcessed = 0;
    let totalDuplicatesSkipped = 0;
    let filesActuallyProcessed = 0;

    // Track hashes from current processing session to avoid self-duplicates within same file
    const currentSessionHashes = new Set<string>();

    // Process files in parallel for better performance
    const fileProcessingPromises = existingFiles.map(async (tracker: any) => {
      const filePath = tracker.tracker_file;
      const resolvedFilePath = PathResolver.resolveFilePath(filePath);

      console.log(`\n=== Processing Tracker ID: ${tracker.tracker_id} ===`);
      console.log(`Original file path: ${filePath}`);
      console.log(`Resolved file path: ${resolvedFilePath}`);
      console.log(
        `Task ID: ${tracker.task_id}, Project ID: ${tracker.project_id}, User ID: ${tracker.user_id}`,
      );

      // Initialize QC performance tracking for this tracker
      let qcPerformanceId: number | null = null;
      let trackerRecordsProcessed = 0;
      let trackerDuplicatesFound = 0;

      try {
        // Get task details including important_columns
        console.log("Querying task table for ID:", tracker.task_id);
        const [taskRows] = (await connection.execute(
          "SELECT task_id, task_name, important_columns FROM task WHERE task_id = ?",
          [tracker.task_id],
        )) as [any[], any];

        console.log("Task query result:", taskRows);

        if (taskRows.length === 0) {
          console.log(`Task ID ${tracker.task_id} not found`);
          return { processed: false, recordsInserted: 0, duplicatesSkipped: 0 };
        }

        const task = taskRows[0];
        console.log("Task found:", task);
        const importantColumns = task.important_columns
          ? JSON.parse(task.important_columns)
          : [];
        console.log("Important columns parsed:", importantColumns);

        console.log(`Task: ${task.task_name}`);
        console.log(`Important columns: ${importantColumns.join(", ")}`);

        const stats = fs.statSync(resolvedFilePath);
        console.log(`File size: ${stats.size} bytes`);

        const ext = path.extname(resolvedFilePath).toLowerCase();
        console.log(`File extension detected: ${ext}`);

        if (ext === ".xlsx" || ext === ".xls") {
          console.log("Excel file detected - reading content...");

          // Check if QC record already exists for this file
          const [existingQC] = (await connection.execute(
            "SELECT id, processing_status FROM qc_performance WHERE file_name = ?",
            [path.basename(resolvedFilePath)],
          )) as [any[], any];

          let isAlreadyProcessed = false;

          if (existingQC.length > 0) {
            console.log(
              `QC record already exists for file: ${resolvedFilePath} (ID: ${existingQC[0].id})`,
            );
            qcPerformanceId = existingQC[0].id;

            // Check if file was already successfully processed
            if (existingQC[0].processing_status === "completed") {
              console.log(
                `File already successfully processed, skipping QC updates`,
              );
              isAlreadyProcessed = true;
            }
          }

          if (!isAlreadyProcessed) {
            // Only create QC performance record for Excel files if it doesn't exist
            if (existingQC.length === 0) {
              const [qcResult] = (await connection.execute(
                `INSERT INTO qc_performance 
                 (user_id, project_id, task_id, tracker_id, file_name, important_columns, processing_status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  tracker.user_id,
                  tracker.project_id,
                  tracker.task_id,
                  tracker.tracker_id,
                  path.basename(resolvedFilePath),
                  JSON.stringify(importantColumns),
                  "processing",
                ],
              )) as any;

              qcPerformanceId = qcResult.insertId;
              console.log(
                `QC performance record created with ID: ${qcPerformanceId}`,
              );
            } else {
              // Reset status to 'processing' for re-processing
              await connection.execute(
                "UPDATE qc_performance SET processing_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                ["processing", qcPerformanceId],
              );
            }

            try {
              const workbook = new ExcelJS.Workbook();
              await workbook.xlsx.readFile(resolvedFilePath);

              console.log(
                `Excel workbook loaded, worksheets: ${workbook.worksheets.length}`,
              );

              let fileProcessingSuccess = true;

              try {
                for (
                  let sheetIndex = 0;
                  sheetIndex < workbook.worksheets.length;
                  sheetIndex++
                ) {
                  const worksheet = workbook.worksheets[sheetIndex];
                  const sheetId = sheetIndex + 1;
                  console.log(
                    `\n--- Processing Sheet ${sheetId}: ${worksheet.name} ---`,
                  );
                  console.log(
                    `Sheet dimensions: ${worksheet.rowCount} rows × ${worksheet.columnCount} columns`,
                  );

                  // Get headers from first row
                  const headers: string[] = [];
                  worksheet.getRow(1).eachCell((cell, colNumber) => {
                    headers[colNumber - 1] =
                      cell.value?.toString() || `col_${colNumber}`;
                  });

                  console.log("Headers extracted:", headers);

                  // Process data rows (skip header row)
                  let sheetRecordsProcessed = 0;
                  let sheetDuplicatesSkipped = 0;

                  console.log(
                    `Starting to process ${worksheet.rowCount - 1} data rows...`,
                  );

                  // Collect all hashes first for batch lookup
                  const allHashes: string[] = [];
                  const rowHashes: {
                    rowNumber: number;
                    hashValue: string;
                    record: any;
                  }[] = [];

                  for (
                    let rowNumber = 2;
                    rowNumber <= worksheet.rowCount;
                    rowNumber++
                  ) {
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
                        const matchingHeader = headers.find(
                          (h) =>
                            h.toLowerCase().trim() === col.toLowerCase().trim(),
                        );
                        return matchingHeader
                          ? record[matchingHeader] || ""
                          : "";
                      })
                      .join("|")
                      .toLowerCase()
                      .trim();

                    const hashValue = crypto
                      .createHash("sha256")
                      .update(hashInput)
                      .digest("hex");

                    // Check for duplicate in current session first
                    if (currentSessionHashes.has(hashValue)) {
                      sheetDuplicatesSkipped++;
                      trackerDuplicatesFound++;
                      console.log(
                        `Duplicate found in current session (row ${rowNumber}), skipping...`,
                      );
                      continue;
                    }

                    allHashes.push(hashValue);
                    rowHashes.push({ rowNumber, hashValue, record });
                  }

                  // Batch lookup for all hashes in database
                  let existingHashes: Set<string> = new Set();
                  if (allHashes.length > 0) {
                    const placeholders = allHashes.map(() => "?").join(",");
                    const [existingRows] = (await connection.execute(
                      `SELECT DISTINCT hash_value FROM tracker_records WHERE project_id = ? AND task_id = ? AND hash_value IN (${placeholders})`,
                      [tracker.project_id, tracker.task_id, ...allHashes],
                    )) as [any[], any];

                    existingHashes = new Set(
                      existingRows.map((row) => row.hash_value),
                    );
                  }

                  // Process records with batch results
                  for (const { rowNumber, hashValue, record } of rowHashes) {
                    if (existingHashes.has(hashValue)) {
                      sheetDuplicatesSkipped++;
                      trackerDuplicatesFound++;
                      console.log(
                        `Duplicate found in database (row ${rowNumber}), skipping...`,
                      );
                      continue;
                    }

                    // Add to current session hashes
                    currentSessionHashes.add(hashValue);

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
                        "ready",
                      ],
                    );

                    sheetRecordsProcessed++;
                    trackerRecordsProcessed++;
                    console.log(`Inserted record from row ${rowNumber}`);
                  }

                  totalRecordsProcessed += sheetRecordsProcessed;
                  totalDuplicatesSkipped += sheetDuplicatesSkipped;
                  console.log(
                    `Sheet ${worksheet.name}: ${sheetRecordsProcessed} records inserted, ${sheetDuplicatesSkipped} duplicates skipped`,
                  );
                }
              } catch (processingError) {
                console.error(
                  "Error during Excel processing:",
                  processingError,
                );
                fileProcessingSuccess = false;

                // Mark any partially processed records as failed
                await connection.execute(
                  "UPDATE tracker_records SET status = ? WHERE task_id = ? AND status = ?",
                  ["failed", tracker.task_id, "processing"],
                );
              }

              // Update status for this tracker file
              const finalStatus = fileProcessingSuccess
                ? "completed"
                : "failed";

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
                    0, // duplicates_removed is 0 since we don't remove from file
                    trackerRecordsProcessed,
                    finalStatus,
                    qcPerformanceId,
                  ],
                );
              }

              console.log(
                `Tracker ${tracker.tracker_id} processing completed with status: ${finalStatus}`,
              );
              console.log(
                `QC Performance: ${trackerRecordsProcessed} unique records, ${trackerDuplicatesFound} duplicates skipped`,
              );

              return {
                processed: true,
                recordsInserted: trackerRecordsProcessed,
                duplicatesSkipped: trackerDuplicatesFound,
              };
            } catch (excelError) {
              console.log(
                "Error reading Excel file:",
                excelError instanceof Error
                  ? excelError.message
                  : String(excelError),
              );

              // Update QC performance record with failed status
              if (qcPerformanceId) {
                await connection.execute(
                  "UPDATE qc_performance SET processing_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                  ["failed", qcPerformanceId],
                );
              }
              return {
                processed: false,
                recordsInserted: 0,
                duplicatesSkipped: 0,
              };
            }
          } else {
            console.log(
              `Skipping file processing - already completed: ${resolvedFilePath}`,
            );
            return {
              processed: false,
              recordsInserted: 0,
              duplicatesSkipped: 0,
            };
          }
        } else {
          console.log(
            `File type ${ext} not supported - only Excel files are processed`,
          );
          return { processed: false, recordsInserted: 0, duplicatesSkipped: 0 };
        }
      } catch (error) {
        console.log(
          "Error reading file:",
          error instanceof Error ? error.message : String(error),
        );

        // Update QC performance record with error status
        if (qcPerformanceId) {
          await connection.execute(
            "UPDATE qc_performance SET processing_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            ["failed", qcPerformanceId],
          );
        }
        return { processed: false, recordsInserted: 0, duplicatesSkipped: 0 };
      }
    });

    // Wait for all files to process in parallel
    const results = await Promise.all(fileProcessingPromises);

    // Calculate totals from parallel processing results
    filesActuallyProcessed = results.filter((r) => r.processed).length;
    totalRecordsProcessed = results.reduce(
      (sum, r) => sum + r.recordsInserted,
      0,
    );
    totalDuplicatesSkipped = results.reduce(
      (sum, r) => sum + r.duplicatesSkipped,
      0,
    );

    await connection.end();

    console.log(`\n=== Summary ===`);
    console.log(`Total records processed: ${totalRecordsProcessed}`);
    console.log(`Total duplicates skipped: ${totalDuplicatesSkipped}`);

    res.status(200).json({
      success: true,
      message: "Excel files processed and data stored successfully",
      data: {
        processedFiles: filesActuallyProcessed,
        recordsInserted: totalRecordsProcessed,
        duplicatesSkipped: totalDuplicatesSkipped,
      },
    });
  } catch (error) {
    console.error("Error in processExcelFiles:", error);
    res.status(500).json({
      success: false,
      message: "Error processing Excel files",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
