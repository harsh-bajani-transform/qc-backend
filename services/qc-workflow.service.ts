import { Connection } from "mysql2/promise";

/**
 * Service to handle specialized QC workflows for Correction, Rework, and Regular submissions.
 */
export class QCWorkflowService {
  /**
   * Handles the workflow for Regular submissions (100% Score).
   * Finalizes any open Correction or Rework cycles.
   */
  static async handleRegularWorkflow(
    connection: Connection,
    qcId: number,
    status: string,
    currentQCStatus: string | null,
    data: {
      whole_file_path: string | null;
      qc_file_path: string | null;
      error_list: any[];
      file_record_count?: number;
      qc_generated_count?: number;
    }
  ): Promise<string> {
    // If it was previously in correction, finalize history with the final record
    if (currentQCStatus === "correction") {
      await this.handleCorrectionWorkflow(connection, qcId, "regular", data);
    } 
    // If it was previously in rework, finalize history
    else if (currentQCStatus === "rework") {
      await this.handleReworkWorkflow(connection, qcId, "regular", data);
    }
    
    return "completed";
  }

  /**
   * Handles the iterative Correction lifecycle.
   * Creates a new record in qc_correction_history for every cycle.
   */
  static async handleCorrectionWorkflow(
    connection: Connection,
    qcId: number,
    submissionStatus: string,
    data: {
      whole_file_path: string | null;
      qc_file_path: string | null;
      error_list: any[];
    }
  ): Promise<string> {
    console.log(`[QC Workflow] Processing Correction Flow for QC ID: ${qcId}`);

    // 1. Get the latest correction count for this record
    const [latestRows]: any = await connection.execute(
      "SELECT correction_count FROM qc_correction_history WHERE qc_record_id = ? ORDER BY correction_count DESC LIMIT 1",
      [qcId]
    );

    const nextCount = latestRows.length > 0 ? (latestRows[0].correction_count || 0) + 1 : 1;
    
    // 2. Determine statuses
    const historyStatus = submissionStatus === "regular" ? "completed" : "correction";
    const recordQCStatus = submissionStatus === "regular" ? "completed" : "correction";

    // 3. Insert NEW history record (Iterative approach)
    // For Count 1, correction_file_path is NULL. For Count 2+, it's the agent's updated file.
    const correctionFilePath = nextCount === 1 ? null : data.whole_file_path;

    const insertHistorySql = `
      INSERT INTO qc_correction_history (
        qc_record_id, 
        qc_file_path, 
        correction_file_path, 
        correction_count, 
        correction_status, 
        correction_error_list
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    await connection.execute(insertHistorySql, [
      qcId,
      data.qc_file_path,       // The sample file QA sent to agent
      correctionFilePath,      // The file the agent submitted (NULL for first count)
      nextCount,
      historyStatus,
      JSON.stringify(data.error_list)
    ]);

    console.log(`[QC Workflow] Created correction history entry (Cycle ${nextCount}, Status: ${historyStatus})`);

    return recordQCStatus;
  }

  /**
   * Handles the iterative Rework lifecycle.
   * Creates a new record in qc_rework_history for every cycle.
   */
  static async handleReworkWorkflow(
    connection: Connection,
    qcId: number,
    submissionStatus: string,
    data: {
      whole_file_path: string | null;
      qc_file_path: string | null;
      error_list: any[];
      file_record_count?: number;
      qc_generated_count?: number;
    }
  ): Promise<string> {
    console.log(`[QC Workflow] Processing Rework Flow for QC ID: ${qcId}`);

    // 1. Get the latest rework count
    const [latestRows]: any = await connection.execute(
      "SELECT rework_count FROM qc_rework_history WHERE qc_record_id = ? ORDER BY rework_count DESC LIMIT 1",
      [qcId]
    );

    const nextCount = latestRows.length > 0 ? (latestRows[0].rework_count || 0) + 1 : 1;

    // 2. Determine statuses
    const historyStatus = submissionStatus === "regular" ? "completed" : "rework";
    const recordQCStatus = submissionStatus === "regular" ? "completed" : "rework";

    // 3. Insert NEW history record (Iterative approach)
    // For Rework: In Count 1, qc_file_path is the whole_file_path QA is returning.
    // In Cycle 2+, rework_file_path is the agent's new whole_file_path.
    const reworkFilePath = nextCount === 1 ? null : data.whole_file_path;

    const insertHistorySql = `
      INSERT INTO qc_rework_history (
        qc_record_id, 
        qc_file_path, 
        rework_file_path, 
        rework_count, 
        rework_status, 
        rework_error_list,
        file_record_count,
        qc_data_generated_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await connection.execute(insertHistorySql, [
      qcId,
      data.whole_file_path,   // For Rework, we send the WHOLE file to the agent
      reworkFilePath,         // NULL for first count, agent's new file for 2+
      nextCount,
      historyStatus,
      JSON.stringify(data.error_list),
      data.file_record_count || 0,
      data.qc_generated_count || 0
    ]);

    console.log(`[QC Workflow] Created rework history entry (Cycle ${nextCount}, Status: ${historyStatus})`);

    return recordQCStatus;
  }
}
