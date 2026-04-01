import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import axios from "axios";
import get_db_connection from "../database/db";
import { PYTHON_URL } from "../config/env";
import { sendQCEmailInternal } from "./mail.controller";
import {
  formatSubmissionDate,
  uploadSampleToCloudinary,
  getQCRecordEmailDetails,
  handleQCStatusTransitions,
} from "../utils/qc-helpers";
import { QCWorkflowService } from "../services/qc-workflow.service";
import { uploadBufferToCloudinary } from "../utils/cloudinary-utils";

/**
 * Sanitize tracker file URL — if the Python backend accidentally
 * prefixes a local path before an absolute URL, extract the real URL.
 * e.g. "/python/uploads/tracker_files/https://res.cloudinary.com/..."
 *   => "https://res.cloudinary.com/..."
 */
function sanitizeFileUrl(raw: string): string {
  const httpIdx = raw.indexOf("https://");
  if (httpIdx > 0) return raw.substring(httpIdx);
  const httpPlainIdx = raw.indexOf("http://");
  if (httpPlainIdx > 0) return raw.substring(httpPlainIdx);
  return raw;
}

export const generateCustomSample = async (req: Request, res: Response) => {
  const { tracker_id, sampling_percentage } = req.body;

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
    const originalFileUrl: string = sanitizeFileUrl(tracker.tracker_file);

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
    const rowIndices: number[] = [];
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      let isEmpty = true;
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (
          cell.value !== null &&
          cell.value !== undefined &&
          cell.value !== ""
        ) {
          isEmpty = false;
        }
      });
      if (!isEmpty) {
        rowIndices.push(i);
      }
    }

    const percentage = Number(sampling_percentage) || 10;
    const totalRows = rowIndices.length;
    const sampleSize = Math.ceil(totalRows * (percentage / 100));

    // Shuffle and pick sampleSize
    for (let i = rowIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rowIndices[i], rowIndices[j]] = [rowIndices[j], rowIndices[i]];
    }
    const selectedIndices = rowIndices.slice(0, sampleSize);
    selectedIndices.sort((a, b) => a - b); // Keep original order for display

    // 4. Create new workbook for sample
    const sampleWorkbook = new ExcelJS.Workbook();
    const sampleSheet = sampleWorkbook.addWorksheet(`QC Sample ${percentage}%`);

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
        sampling_percentage: percentage,
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

export const downloadCustomSample = async (req: Request, res: Response) => {
  const { tracker_id } = req.params;
  const { logged_in_user_id, sampling_percentage } = req.query;

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
    const originalFileUrl: string = sanitizeFileUrl(tracker.tracker_file);

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
    const rowIndices: number[] = [];
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      let isEmpty = true;
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (
          cell.value !== null &&
          cell.value !== undefined &&
          cell.value !== ""
        ) {
          isEmpty = false;
        }
      });
      if (!isEmpty) {
        rowIndices.push(i);
      }
    }

    const percentage = Number(sampling_percentage) || 10;
    const totalRows = rowIndices.length;
    const sampleSize = Math.ceil(totalRows * (percentage / 100));

    // Shuffle and pick sampleSize
    for (let i = rowIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rowIndices[i], rowIndices[j]] = [rowIndices[j], rowIndices[i]];
    }
    const selectedIndices = rowIndices.slice(0, sampleSize);
    selectedIndices.sort((a, b) => a - b); // Keep original order for display

    // 5. Create new workbook for sample
    const sampleWorkbook = new ExcelJS.Workbook();
    const sampleSheet = sampleWorkbook.addWorksheet(`QC Sample ${percentage}%`);

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
    const downloadFileName = `${baseName}_${percentage}_percent_sample${ext}`;

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
  console.log(
    `[QC Record] POST /save received. Body keys:`,
    Object.keys(req.body),
  );
  const {
    assistant_manager_id,
    qa_user_id,
    agent_id,
    project_id,
    task_id,
    tracker_id,
    whole_file_path,
    date_of_file_submission,
    qc_score,
    status,
    qc_status,
    file_record_count,
    qc_generated_count,
    qc_file_records,
    error_list,
    sampling_percentage,
  } = req.body;

  const connection = await get_db_connection();
  const formattedSubmissionDate = formatSubmissionDate(date_of_file_submission);

  try {
    await connection.beginTransaction();

    let finalQCStatus = status === "regular" ? "completed" : qc_status || null;

    // 1. Generate and Upload Sample if records are provided
    const folderName = status === "rework" ? "hrms/qc_rework_samples" : "hrms/qc_samples";
    const qc_file_path = await uploadSampleToCloudinary(
      qc_file_records,
      whole_file_path,
      sampling_percentage || 10,
      folderName
    );

    // 2. Check for existing record to support iterative rework for the SAME tracker
    const checkExistingSql = `
      SELECT id, qc_status FROM qc_records 
      WHERE tracker_id = ?
      LIMIT 1
    `;
    const [existingRows]: any = await connection.execute(checkExistingSql, [
      tracker_id,
    ]);

    let qcId: number;

    if (existingRows.length > 0) {
      qcId = existingRows[0].id;
      const updateSql = `
        UPDATE qc_records SET
          assistant_manager_id = ?,
          qa_user_id = ?,
          whole_file_path = ?,
          qc_score = ?,
          status = ?,
          qc_status = ?,
          file_record_count = ?,
          qc_generated_count = ?,
          error_list = ?,
          qc_file_path = ?,
          tracker_id = ?,
          updated_at = updated_at
        WHERE id = ?
      `;
      await connection.execute(updateSql, [
        assistant_manager_id,
        qa_user_id,
        whole_file_path,
        qc_score,
        status,
        finalQCStatus,
        file_record_count,
        qc_generated_count,
        JSON.stringify(error_list),
        qc_file_path,
        tracker_id || null,
        qcId,
      ]);
    } else {
      const insertSql = `
        INSERT INTO qc_records (
          assistant_manager_id, qa_user_id, agent_id, project_id, task_id,
          whole_file_path, date_of_file_submission, qc_score, status, qc_status,
          file_record_count, qc_generated_count,
          error_list, qc_file_path, tracker_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const [result] = await connection.execute(insertSql, [
        assistant_manager_id,
        qa_user_id,
        agent_id,
        project_id,
        task_id,
        whole_file_path,
        formattedSubmissionDate,
        qc_score,
        status,
        finalQCStatus,
        file_record_count,
        qc_generated_count,
        JSON.stringify(error_list),
        qc_file_path,
        tracker_id || null,
      ]);
      qcId = (result as any).insertId;
    }

    // 3. Fetch Details for Email Notification
    const emailData = await getQCRecordEmailDetails(
      connection,
      agent_id,
      project_id,
      task_id,
      qa_user_id,
    );

    // 4. Handle Specialized Workflows (Workflow Factory/Service)
    if (status === "regular") {
      finalQCStatus = await QCWorkflowService.handleRegularWorkflow(
        connection,
        qcId,
        status,
        existingRows.length > 0 ? existingRows[0].qc_status : null,
        {
          whole_file_path,
          qc_file_path,
          error_list,
          file_record_count,
          qc_generated_count: qc_generated_count,
          qc_score: qc_score,
        },
      );
    } else if (status === "correction") {
      finalQCStatus = await QCWorkflowService.handleCorrectionWorkflow(
        connection,
        qcId,
        status,
        {
          whole_file_path,
          qc_file_path,
          error_list,
          // no qc_score — correction is status-only
        },
      );
    } else if (status === "rework") {
      finalQCStatus = await QCWorkflowService.handleReworkWorkflow(
        connection,
        qcId,
        status,
        {
          whole_file_path,
          qc_file_path,
          error_list,
          file_record_count,
          qc_generated_count: qc_generated_count,
          qc_score: qc_score,
        },
      );
    }

    // 4b. Run status-transition side-effects (tracker_records reset)
    if (status === "rework" || status === "correction") {
      await handleQCStatusTransitions(
        connection,
        status,
        agent_id,
        project_id,
        task_id,
        whole_file_path,
        tracker_id || null,
        qcId,
      );
    }

    // Update the final status if it was changed by the workflow (e.g. from correction to completed)
    if (
      finalQCStatus !== (status === "regular" ? "completed" : qc_status || null)
    ) {
      await connection.execute(
        "UPDATE qc_records SET qc_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [finalQCStatus, qcId],
      );
    }

    // 5. Update qc_status in task_work_tracker
    if (tracker_id) {
      const updateTrackerStatusSql = `
        UPDATE task_work_tracker 
        SET qc_status = 1 
        WHERE tracker_id = ?
      `;
      await connection.execute(updateTrackerStatusSql, [tracker_id]);
      console.log(
        `[QC Service] Updated qc_status to 1 for tracker_id: ${tracker_id}`,
      );
    }

    await connection.commit();

    // 6. Send Background Email (Async)
    if (emailData) {
      const submission_time = date_of_file_submission
        ? new Date(date_of_file_submission).toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "N/A";

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
        file_path:
          status === "rework" || status === "correction"
            ? whole_file_path
            : qc_file_path,
        submission_time,
      }).catch((err: any) =>
        console.error("[QC Service] Asynchronous email failed:", err),
      );
    }

    return res.status(200).json({
      success: true,
      message: "QC record saved successfully",
      data: { id: qcId },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error saving QC record:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  } finally {
    if (connection) await connection.end();
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
      LEFT JOIN tfs_user a ON q.agent_id = a.user_id
      LEFT JOIN tfs_user qa ON q.qa_user_id = qa.user_id
      LEFT JOIN tfs_user am ON q.assistant_manager_id = am.user_id
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
      SET qc_score = ?, status = ?, error_list = ?
      WHERE id = ?
    `;
    await connection.execute(sql, [
      qc_score,
      status,
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
      LEFT JOIN tfs_user a ON q.agent_id = a.user_id
      LEFT JOIN tfs_user qa ON q.qa_user_id = qa.user_id
      LEFT JOIN tfs_user am ON q.assistant_manager_id = am.user_id
      LEFT JOIN project p ON q.project_id = p.project_id
      LEFT JOIN task t ON q.task_id = t.task_id
    `;

    const queryParams: any[] = [];

    if (logged_in_user_id) {
      sql += ` WHERE q.agent_id = ?`;
      queryParams.push(logged_in_user_id);
    }

    sql += ` ORDER BY q.created_at DESC`;

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

export const agentUploadCorrection = async (req: Request, res: Response) => {
  const mreq = req as any;
  const { qcId, type, logged_in_user_id } = mreq.body;

  if (!mreq.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });
  }

  if (!qcId || !type || !["rework", "correction"].includes(type)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid qcId or type" });
  }

  const folder =
    type === "rework" ? "hrms/qc_rework_files" : "hrms/qc_correction_files";
  const fileName = `fixed_${type}_${qcId}_${Date.now()}${path.extname(
    mreq.file.originalname
  )}`;

  let connection;
  try {
    const uploadRes = await uploadBufferToCloudinary(
      mreq.file.buffer,
      folder,
      fileName
    );
    const fileUrl = uploadRes.secure_url;

    connection = await get_db_connection();
    await connection.beginTransaction();

    await QCWorkflowService.recordAgentUpload(
      connection,
      Number(qcId),
      type as any,
      fileUrl
    );

    await connection.commit();
    return res.status(200).json({
      success: true,
      message: "File uploaded and status updated successfully",
      data: { fileUrl },
    });
  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error("Error in agentUploadCorrection:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  } finally {
    if (connection) await connection.end();
  }
};

