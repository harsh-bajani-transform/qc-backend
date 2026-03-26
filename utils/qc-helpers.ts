import { Connection } from "mysql2/promise";
import ExcelJS from "exceljs";
import path from "path";
import { uploadBufferToCloudinary } from "./cloudinary-utils";

/**
 * Formats a date string to include current time if only YYYY-MM-DD is provided.
 */
export function formatSubmissionDate(date_of_file_submission: any): string {
  let formattedDate = date_of_file_submission;
  if (typeof formattedDate === "string" && formattedDate.trim().length <= 10) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");
    formattedDate = `${formattedDate.trim()} ${hh}:${mm}:${ss}`;
  }
  return formattedDate;
}

/**
 * Generates an Excel buffer for sampled QC records and uploads it to Cloudinary.
 */
export async function uploadSampleToCloudinary(
  qc_file_records: any,
  whole_file_path: string | null,
  percentage: number = 10
): Promise<string | null> {
  try {
    const sampleData = typeof qc_file_records === "string" ? JSON.parse(qc_file_records) : qc_file_records;

    if (Array.isArray(sampleData) && sampleData.length > 0) {
      const sampleWorkbook = new ExcelJS.Workbook();
      const sampleSheet = sampleWorkbook.addWorksheet(`QC Sample ${percentage}%`);

      const headers = Object.keys(sampleData[0]);
      sampleSheet.addRow(headers);

      sampleData.forEach((record: any) => {
        sampleSheet.addRow(headers.map((h) => record[h]));
      });

      const buffer = (await sampleWorkbook.xlsx.writeBuffer()) as any;
      const fileName =
        path.basename(
          whole_file_path || "sample",
          path.extname(whole_file_path || ".xlsx")
        ) +
        `_${percentage}_sample_` +
        Date.now() +
        ".xlsx";

      const uploadRes = await uploadBufferToCloudinary(buffer, "hrms/qc_samples", fileName);
      return uploadRes.secure_url;
    }
  } catch (err) {
    console.error("[QC Helper] Failed to upload sample to Cloudinary:", err);
  }
  return null;
}

/**
 * Fetches required details for email notification in a single batch of queries.
 */
export async function getQCRecordEmailDetails(
  connection: Connection,
  agent_id: number,
  project_id: number,
  task_id: number,
  qa_user_id: number
): Promise<any> {
  try {
    console.log(`[QC Helper] Fetching email details for agent_id: ${agent_id}`);
    const [agentRows]: any = await connection.execute(
      "SELECT user_name, user_email FROM tfs_user WHERE user_id = ?",
      [agent_id]
    );
    const [projectRows]: any = await connection.execute(
      "SELECT project_name FROM project WHERE project_id = ?",
      [project_id]
    );
    const [taskRows]: any = await connection.execute(
      "SELECT task_name FROM task WHERE task_id = ?",
      [task_id]
    );
    const [qaRows]: any = await connection.execute(
      "SELECT user_name FROM tfs_user WHERE user_id = ?",
      [qa_user_id]
    );

    if (agentRows.length > 0) {
      return {
        agent_email: agentRows[0].user_email,
        agent_name: agentRows[0].user_name,
        project_name: projectRows[0]?.project_name || "N/A",
        task_name: taskRows[0]?.task_name || "N/A",
        qa_name: qaRows[0] ? qaRows[0].user_name : "QA Department",
      };
    }
  } catch (err) {
    console.error("[QC Helper] Error fetching email details:", err);
  }
  return null;
}

/**
 * Handles database updates for status transitions (Rework/Correction).
 */
export async function handleQCStatusTransitions(
  connection: Connection,
  status: string,
  agent_id: number,
  project_id: number,
  task_id: number,
  whole_file_path: string,
  tracker_id: number | null,
  qcId: number
): Promise<void> {
  const normalizedStatus = (status || "").toLowerCase();
  
  // 1. Reset duplicate check scoped to this specific file
  const deleteTrackerRecordsSql = `
    DELETE FROM tracker_records 
    WHERE user_id = ? AND project_id = ? AND task_id = ? AND file_path = ?
  `;
  await connection.execute(deleteTrackerRecordsSql, [
    agent_id,
    project_id,
    task_id,
    whole_file_path,
  ]);
  console.log(`[QC Helper] Reset duplicate check: Deleted tracker_records for file: ${whole_file_path}`);

  // 2. Handle Rework Tracker Entry (Legacy Table)
  // Note: New History Tables will be implemented here in the next phase.
  if (normalizedStatus === "rework" || normalizedStatus === "correction") {
    let nextReworkCount = 1;
    if (tracker_id) {
      const checkReworkSql = `SELECT rework_count FROM qc_rework_tracker WHERE tracker_id = ? ORDER BY rework_count DESC LIMIT 1`;
      const [reworkRows]: any = await connection.execute(checkReworkSql, [tracker_id]);
      if (reworkRows.length > 0) {
        nextReworkCount = (reworkRows[0].rework_count || 0) + 1;
      }
    } else {
      const checkReworkSql = `SELECT rework_count FROM qc_rework_tracker WHERE qc_id = ? ORDER BY timestamp DESC LIMIT 1`;
      const [reworkRows]: any = await connection.execute(checkReworkSql, [qcId]);
      if (reworkRows.length > 0) {
        nextReworkCount = (reworkRows[0].rework_count || 0) + 1;
      }
    }

    const insertReworkSql = `
      INSERT INTO qc_rework_tracker (qc_id, agent_id, file_path, rework_count, project_id, task_id, tracker_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    await connection.execute(insertReworkSql, [
      qcId,
      agent_id,
      whole_file_path,
      nextReworkCount,
      project_id,
      task_id,
      tracker_id || null,
    ]);
    console.log(`[QC Helper] Rework tracked in legacy table for QC ID ${qcId}, Count ${nextReworkCount}`);
  }
}

/**
 * Samples records using systematic random sampling.
 * Selects every k-th record starting from a random index.
 */
export function generateSystematicSample<T>(records: T[], sampleSize: number): T[] {
  if (!records || records.length === 0 || sampleSize <= 0) {
    return [];
  }

  const totalRecords = records.length;
  if (sampleSize >= totalRecords) {
    return [...records]; // Return all if sample size exceeds total
  }

  const interval = totalRecords / sampleSize;
  const start = Math.floor(Math.random() * interval);
  const sampled: T[] = [];

  for (let i = 0; i < sampleSize; i++) {
    const index = Math.floor(start + i * interval);
    if (index < totalRecords) {
      sampled.push(records[index]);
    }
  }

  return sampled;
}
