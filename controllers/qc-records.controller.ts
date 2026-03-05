import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import axios from "axios";
import get_db_connection from "../database/db";
import { PYTHON_URL } from "../config/env";

export const generateTenPercentSample = async (req: Request, res: Response) => {
  const { tracker_id } = req.body;

  if (!tracker_id) {
    return res
      .status(400)
      .json({ success: false, message: "tracker_id is required" });
  }

  try {
    // 1. Fetch tracker details from Python backend
    if (!PYTHON_URL) {
      return res
        .status(500)
        .json({ success: false, message: "Python backend URL not configured" });
    }

    const { logged_in_user_id } = req.body;
    const pythonUrl = PYTHON_URL.endsWith("/")
      ? `${PYTHON_URL}tracker/view`
      : `${PYTHON_URL}/tracker/view`;
    console.log(`[QC Service] Calling Python backend: ${pythonUrl}`);
    console.log(`[QC Service] Request body:`, {
      tracker_id,
      logged_in_user_id,
    });

    const pythonResponse = await axios.post(pythonUrl, {
      tracker_id,
      logged_in_user_id,
    });

    if (pythonResponse.status !== 200) {
      console.error(`[QC Service] Python backend error:`, pythonResponse.data);
      return res.status(pythonResponse.status).json({
        success: false,
        message:
          pythonResponse.data?.message ||
          "Failed to fetch tracker info from Python backend",
      });
    }

    const trackers = pythonResponse.data?.data?.trackers || [];
    const tracker = trackers.find((t: any) => t.tracker_id == tracker_id);

    if (!tracker || !tracker.tracker_file) {
      return res
        .status(404)
        .json({ success: false, message: "Tracker or file not found" });
    }
    const originalFileUrl: string = tracker.tracker_file;

    if (!originalFileUrl) {
      return res.status(404).json({
        success: false,
        message: `Tracker has no file attached`,
      });
    }

    // 2. Fetch the file directly from Cloudinary URL into memory
    console.log(`[QC Service] Fetching file from: ${originalFileUrl}`);
    const fileResponse = await axios.get(originalFileUrl, {
      responseType: "arraybuffer",
    });
    // fileResponse.data is a raw ArrayBuffer — use directly (ExcelJS.load expects ArrayBuffer)
    const fileArrayBuffer: ArrayBuffer = fileResponse.data as ArrayBuffer;

    // 3. Read the Excel file from the in-memory buffer
    const workbook = new ExcelJS.Workbook();
    const ext = path.extname(new URL(originalFileUrl).pathname).toLowerCase();

    if (ext === ".xlsx") {
      await workbook.xlsx.load(fileArrayBuffer);
    } else if (ext === ".csv") {
      // ExcelJS CSV load requires a Readable stream; convert ArrayBuffer to Buffer first
      const { Readable } = await import("stream");
      const stream = Readable.from(Buffer.from(fileArrayBuffer));
      await workbook.csv.read(stream);
    } else {
      return res
        .status(400)
        .json({ success: false, message: `Unsupported file format: ${ext}` });
    }

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      return res
        .status(404)
        .json({ success: false, message: "Worksheet not found in file" });
    }
    const totalRows = worksheet.rowCount - 1; // Exclude header
    const sampleSize = Math.ceil(totalRows * 0.1);

    // 3. Randomly select 10% of rows
    const rowIndices: number[] = [];
    for (let i = 2; i <= worksheet.rowCount; i++) {
      rowIndices.push(i);
    }

    // Shuffle and pick sampleSize
    for (let i = rowIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rowIndices[i], rowIndices[j]] = [rowIndices[j], rowIndices[i]];
    }
    const selectedIndices = rowIndices.slice(0, sampleSize);
    selectedIndices.sort((a, b) => a - b); // Keep original order for display

    // 4. Create new workbook for sample
    const sampleWorkbook = new ExcelJS.Workbook();
    const sampleSheet = sampleWorkbook.addWorksheet("QC Sample 10%");

    // Copy headers
    const headers: any[] = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber - 1] = cell.value;
    });
    sampleSheet.addRow(headers);

    const sampleData: any[] = [];
    selectedIndices.forEach((idx) => {
      const row = worksheet.getRow(idx);
      const rowData: any[] = [];
      const record: any = {};

      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const val = cell.value;
        rowData[colNumber - 1] = val;
        record[headers[colNumber - 1] || `col_${colNumber}`] = val;
      });

      sampleSheet.addRow(rowData);
      sampleData.push(record);
    });

    // 5. Build response (no longer saving file to disk)
    return res.status(200).json({
      success: true,
      data: {
        total_records: totalRows,
        sample_size: sampleSize,
        sample_data: sampleData, // Send all data, frontend will filter 3 columns
      },
    });
  } catch (error) {
    console.error("Error generating QC sample:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
};

export const downloadTenPercentSample = async (req: Request, res: Response) => {
  const { tracker_id } = req.params;
  const { logged_in_user_id } = req.query;

  if (!tracker_id) {
    return res
      .status(400)
      .json({ success: false, message: "tracker_id is required" });
  }

  try {
    // 1. Fetch tracker details from Python backend
    if (!PYTHON_URL) {
      return res
        .status(500)
        .json({ success: false, message: "Python backend URL not configured" });
    }

    const pythonUrl = PYTHON_URL.endsWith("/")
      ? `${PYTHON_URL}tracker/view`
      : `${PYTHON_URL}/tracker/view`;

    const pythonResponse = await axios.post(pythonUrl, {
      tracker_id,
      logged_in_user_id,
    });

    if (pythonResponse.status !== 200) {
      return res.status(pythonResponse.status).json({
        success: false,
        message: "Failed to fetch tracker info from Python backend",
      });
    }

    const trackers = pythonResponse.data?.data?.trackers || [];
    const tracker = trackers.find((t: any) => t.tracker_id == tracker_id);

    if (!tracker || !tracker.tracker_file) {
      return res
        .status(404)
        .json({ success: false, message: "Tracker or file not found" });
    }
    const originalFileUrl: string = tracker.tracker_file;

    // 2. Stream the file directly from Cloudinary
    const fileResponse = await axios.get(originalFileUrl, {
      responseType: "arraybuffer",
    });
    const fileArrayBuffer: ArrayBuffer = fileResponse.data as ArrayBuffer;

    // 3. Read the Excel file
    const workbook = new ExcelJS.Workbook();
    const ext = path.extname(new URL(originalFileUrl).pathname).toLowerCase();

    if (ext === ".xlsx") {
      await workbook.xlsx.load(fileArrayBuffer);
    } else if (ext === ".csv") {
      const { Readable } = await import("stream");
      const stream = Readable.from(Buffer.from(fileArrayBuffer));
      await workbook.csv.read(stream);
    } else {
      return res
        .status(400)
        .json({ success: false, message: `Unsupported file format: ${ext}` });
    }

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      return res
        .status(404)
        .json({ success: false, message: "Worksheet not found in file" });
    }
    const totalRows = worksheet.rowCount - 1;
    const sampleSize = Math.ceil(totalRows * 0.1);

    // 4. Randomly select 10% of rows
    const rowIndices: number[] = [];
    for (let i = 2; i <= worksheet.rowCount; i++) {
      rowIndices.push(i);
    }

    // Shuffle and pick sampleSize
    for (let i = rowIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rowIndices[i], rowIndices[j]] = [rowIndices[j], rowIndices[i]];
    }
    const selectedIndices = rowIndices.slice(0, sampleSize);
    selectedIndices.sort((a, b) => a - b); // Keep original order for display

    // 5. Create new workbook for sample
    const sampleWorkbook = new ExcelJS.Workbook();
    const sampleSheet = sampleWorkbook.addWorksheet("QC Sample 10%");

    // Copy headers
    const headers: any[] = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber - 1] = cell.value;
    });
    sampleSheet.addRow(headers);

    selectedIndices.forEach((idx) => {
      const row = worksheet.getRow(idx);
      const rowData: any[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        rowData[colNumber - 1] = cell.value;
      });
      sampleSheet.addRow(rowData);
    });

    // 6. Stream directly to response
    const urlPathname = new URL(originalFileUrl).pathname;
    const baseName = path.basename(urlPathname, ext); // filename without extension
    const downloadFileName = `${baseName}_10_percent_sample${ext}`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadFileName}"`,
    );

    await sampleWorkbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error downloading QC sample:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message:
          error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
};

export const saveQCRecord = async (req: Request, res: Response) => {
  const {
    ass_manager_id,
    qc_user_id,
    agent_user_id,
    project_id,
    task_id,
    file_path,
    date_of_file_submission,
    qc_score,
    status,
    file_record_count,
    data_generated_count,
    qc_file_records,
    error_score,
    error_list,
  } = req.body;

  const connection = await get_db_connection();

  try {
    await connection.beginTransaction();

    // Check for existing record to support iterative rework (Score is final, records update)
    const checkExistingSql = `
      SELECT id FROM qc_records 
      WHERE agent_user_id = ? AND project_id = ? AND task_id = ? AND file_path = ?
      LIMIT 1
    `;
    const [existingRows]: any = await connection.execute(checkExistingSql, [
      agent_user_id,
      project_id,
      task_id,
      file_path,
    ]);

    let qcId: number;

    if (existingRows.length > 0) {
      qcId = existingRows[0].id;
      const updateSql = `
        UPDATE qc_records SET 
          ass_manager_id = ?,
          qc_user_id = ?,
          status = ?,
          file_record_count = ?,
          \`10%_data_generated_count\` = ?,
          \`10%_qc_file_records\` = ?,
          error_list = ?
        WHERE id = ?
      `;
      await connection.execute(updateSql, [
        ass_manager_id,
        qc_user_id,
        status,
        file_record_count,
        data_generated_count,
        qc_file_records,
        JSON.stringify(error_list),
        qcId,
      ]);
    } else {
      const insertSql = `
        INSERT INTO qc_records (
          ass_manager_id, qc_user_id, agent_user_id, project_id, task_id, 
          file_path, date_of_file_submission, qc_score, status, 
          file_record_count, \`10%_data_generated_count\`, \`10%_qc_file_records\`, 
          error_score, error_list
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const [result] = await connection.execute(insertSql, [
        ass_manager_id,
        qc_user_id,
        agent_user_id,
        project_id,
        task_id,
        file_path,
        date_of_file_submission,
        qc_score,
        status,
        file_record_count,
        data_generated_count,
        qc_file_records,
        error_score,
        JSON.stringify(error_list),
      ]);
      qcId = (result as any).insertId;
    }

    // Handle Rework & Correction Logic
    if (status === "Rework" || status === "Correction") {
      // 1. Delete associated tracker_records scoped to this specific file only
      const deleteTrackerRecordsSql = `
        DELETE FROM tracker_records 
        WHERE user_id = ? AND project_id = ? AND task_id = ? AND file_path = ?
      `;
      await connection.execute(deleteTrackerRecordsSql, [
        agent_user_id,
        project_id,
        task_id,
        file_path,
      ]);
      console.log(
        `Reset duplicate check: Deleted tracker_records for agent ${agent_user_id}, project ${project_id}, task ${task_id}, file: ${file_path} (Status: ${status})`,
      );

      // 2. Only Handle Rework Tracker Entry for "Rework" status
      if (status === "Rework") {
        const checkReworkSql = `SELECT rework_count FROM qc_rework_tracker WHERE qc_id = ? ORDER BY timestamp DESC LIMIT 1`;
        const [reworkRows]: any = await connection.execute(checkReworkSql, [
          qcId,
        ]);

        let nextReworkCount = 1;
        if (reworkRows.length > 0) {
          nextReworkCount = reworkRows[0].rework_count + 1;
        }

        const insertReworkSql = `
          INSERT INTO qc_rework_tracker (qc_id, agent_id, file_path, rework_count)
          VALUES (?, ?, ?, ?)
        `;
        await connection.execute(insertReworkSql, [
          qcId,
          agent_user_id,
          file_path,
          nextReworkCount,
        ]);
        console.log(
          `Rework tracked: QC ID ${qcId}, Agent ${agent_user_id}, Count ${nextReworkCount}`,
        );
      }
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "QC record saved successfully",
      data: { id: qcId },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error saving QC record:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  } finally {
    await connection.end();
  }
};

export const getQCRecordById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const connection = await get_db_connection();
  try {
    const [rows]: any = await connection.execute(
      "SELECT * FROM qc_records WHERE id = ?",
      [id],
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "QC record not found" });
    }
    return res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error("Error fetching QC record:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  } finally {
    await connection.end();
  }
};

export const updateQCRecord = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { qc_score, status, error_score, error_list } = req.body;

  const connection = await get_db_connection();
  try {
    const sql = `
      UPDATE qc_records 
      SET qc_score = ?, status = ?, error_score = ?, error_list = ?
      WHERE id = ?
    `;
    await connection.execute(sql, [
      qc_score,
      status,
      error_score,
      JSON.stringify(error_list),
      id,
    ]);

    return res
      .status(200)
      .json({ success: true, message: "QC record updated successfully" });
  } catch (error) {
    console.error("Error updating QC record:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  } finally {
    await connection.end();
  }
};

export const deleteQCRecord = async (req: Request, res: Response) => {
  const { id } = req.params;
  const connection = await get_db_connection();
  try {
    await connection.execute("DELETE FROM qc_records WHERE id = ?", [id]);
    return res
      .status(200)
      .json({ success: true, message: "QC record deleted successfully" });
  } catch (error) {
    console.error("Error deleting QC record:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  } finally {
    await connection.end();
  }
};

export const getQCRecords = async (req: Request, res: Response) => {
  const { logged_in_user_id } = req.query;
  const connection = await get_db_connection();

  try {
    let sql = `
      SELECT 
        q.*,
        a.user_name as agent_name,
        qa.user_name as qa_name,
        am.user_name as am_name,
        p.project_name,
        t.task_name
      FROM qc_records q
      LEFT JOIN tfs_user a ON q.agent_user_id = a.user_id
      LEFT JOIN tfs_user qa ON q.qc_user_id = qa.user_id
      LEFT JOIN tfs_user am ON q.ass_manager_id = am.user_id
      LEFT JOIN project p ON q.project_id = p.project_id
      LEFT JOIN task t ON q.task_id = t.task_id
    `;

    const queryParams: any[] = [];

    if (logged_in_user_id) {
      sql += ` WHERE q.agent_user_id = ?`;
      queryParams.push(logged_in_user_id);
    }

    sql += ` ORDER BY q.timestamp DESC`;

    const [rows] = await connection.execute(sql, queryParams);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error("Error fetching QC records:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  } finally {
    await connection.end();
  }
};
