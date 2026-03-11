import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import axios from "axios";
import get_db_connection from "../database/db";
import { PYTHON_URL } from "../config/env";
import { uploadBufferToCloudinary } from "../utils/cloudinary-utils";
import { sendQCEmailInternal } from "./mail.controller";

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

    const worksheet = workbook.worksheets[0];
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

    const worksheet = workbook.worksheets[0];
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
  console.log(`[QC Record] POST /save received. Body keys:`, Object.keys(req.body));
  const {
    ass_manager_id,
    qc_user_id,
    agent_user_id,
    project_id,
    task_id,
    tracker_id,
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
  let tenPercentFilePath: string | null = null;

  try {
    await connection.beginTransaction();

    // 1. Generate and Upload 10% Sample if records are provided
    if (qc_file_records) {
      try {
        const sampleData =
          typeof qc_file_records === "string"
            ? JSON.parse(qc_file_records)
            : qc_file_records;

        if (Array.isArray(sampleData) && sampleData.length > 0) {
          const sampleWorkbook = new ExcelJS.Workbook();
          const sampleSheet = sampleWorkbook.addWorksheet("QC Sample 10%");

          const headers = Object.keys(sampleData[0]);
          sampleSheet.addRow(headers);

          sampleData.forEach((record: any) => {
            sampleSheet.addRow(headers.map((h) => record[h]));
          });

          const buffer = (await sampleWorkbook.xlsx.writeBuffer()) as any;
          const fileName =
            path.basename(
              file_path || "sample",
              path.extname(file_path || ".xlsx"),
            ) +
            "_10_sample_" +
            Date.now() +
            ".xlsx";

          const uploadRes = await uploadBufferToCloudinary(
            buffer,
            "hrms/qc_samples",
            fileName,
          );
          tenPercentFilePath = uploadRes.secure_url;
          console.log(
            `[QC Service] 10% Sample uploaded: ${tenPercentFilePath}`,
          );
        }
      } catch (err) {
        console.error("[QC Service] Failed to upload 10% sample:", err);
      }
    }

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
          error_list = ?,
          \`10%_file_path\` = ?
        WHERE id = ?
      `;
      await connection.execute(updateSql, [
        ass_manager_id,
        qc_user_id,
        status,
        file_record_count,
        data_generated_count,
        JSON.stringify(error_list),
        tenPercentFilePath,
        qcId,
      ]);
    } else {
      const insertSql = `
        INSERT INTO qc_records (
          ass_manager_id, qc_user_id, agent_user_id, project_id, task_id,
          file_path, date_of_file_submission, qc_score, status,
          file_record_count, \`10%_data_generated_count\`,
          error_score, error_list, \`10%_file_path\`
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
        error_score,
        JSON.stringify(error_list),
        tenPercentFilePath,
      ]);
      qcId = (result as any).insertId;
    }

    // 4. Fetch Details for Email Notification (while connection is active)
    let emailData: any = null;
    try {
      console.log(`[QC Service] Fetching email details for agent_id: ${agent_user_id}`);
      const [agentRows]: any = await connection.execute(
        "SELECT user_name, user_email FROM tfs_user WHERE user_id = ?",
        [agent_user_id],
      );
      const [projectRows]: any = await connection.execute(
        "SELECT project_name FROM project WHERE project_id = ?",
        [project_id],
      );
      const [taskRows]: any = await connection.execute(
        "SELECT task_name FROM task WHERE task_id = ?",
        [task_id],
      );
      const [qaRows]: any = await connection.execute(
        "SELECT user_name FROM tfs_user WHERE user_id = ?",
        [qc_user_id],
      );

      if (agentRows.length > 0) {
        emailData = {
          agent_email: agentRows[0].user_email,
          agent_name: agentRows[0].user_name,
          project_name: projectRows[0]?.project_name || "N/A",
          task_name: taskRows[0]?.task_name || "N/A",
          qa_name: qaRows[0] ? qaRows[0].user_name : "QA Department",
        };
        console.log(`[QC Service] Email details fetched successfully for: ${emailData.agent_email}`);
      } else {
        console.warn(`[QC Service] No agent found with ID: ${agent_user_id}. Email will not be sent.`);
      }
    } catch (fetchErr) {
      console.error("[QC Service] ERROR fetching email details:", fetchErr);
    }

    // Handle Rework & Correction Logic (Case-insensitive)
    const normalizedStatus = (status || "").toLowerCase();
    if (normalizedStatus === "rework" || normalizedStatus === "correction") {
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
 
      // 2. Only Handle Rework Tracker Entry for "rework" status
      if (normalizedStatus === "rework") {
        const checkReworkSql = `SELECT rework_count FROM qc_rework_tracker WHERE qc_id = ? ORDER BY timestamp DESC LIMIT 1`;
        const [reworkRows]: any = await connection.execute(checkReworkSql, [
          qcId,
        ]);
 
        let nextReworkCount = 1;
        if (reworkRows.length > 0) {
          nextReworkCount = (reworkRows[0].rework_count || 0) + 1;
        }
 
        const insertReworkSql = `
          INSERT INTO qc_rework_tracker (qc_id, agent_id, file_path, rework_count, project_id, task_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        await connection.execute(insertReworkSql, [
          qcId,
          agent_user_id,
          file_path,
          nextReworkCount,
          project_id,
          task_id,
        ]);
        console.log(
          `Rework tracked: QC ID ${qcId}, Agent ${agent_user_id}, Count ${nextReworkCount}`,
        );
      }
    }

    // 4. Update qc_status in task_work_tracker
    if (tracker_id) {
      const updateTrackerStatusSql = `
        UPDATE task_work_tracker 
        SET qc_status = 1 
        WHERE tracker_id = ?
      `;
      await connection.execute(updateTrackerStatusSql, [tracker_id]);
      console.log(`[QC Service] Updated qc_status to 1 for tracker_id: ${tracker_id}`);
    }

    await connection.commit();

    // 5. Send Background Email (Async)
    if (emailData) {
      // Use date_of_file_submission from payload - the actual submission date the QC user entered
      const submission_time = date_of_file_submission 
        ? new Date(date_of_file_submission).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "N/A";

      // Send email asynchronously
      sendQCEmailInternal({
        agent_email: emailData.agent_email,
        status,
        project_name: emailData.project_name,
        task_name: emailData.task_name,
        qc_agent_name: emailData.qa_name,
        qc_score,
        error_count: error_list?.length || 0,
        error_list,
        comments: req.body.comments || "",
        file_path, // Original file path
        submission_time, // File submission date
      }).catch((err) =>
        console.error("[QC Service] Asynchronous email failed:", err),
      );
    }

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
    const sql = `
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
      WHERE q.id = ?
    `;
    const [rows]: any = await connection.execute(sql, [id]);
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
  console.log(`[QC Record] PUT /update/${id} received.`);
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
