import { Connection } from "mysql2/promise";

/**
 * Service to handle specialized QC workflows for Correction and Regular submissions.
 */
export class QCWorkflowService {
  /**
   * Handles the workflow for Regular submissions (100% Score).
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
    }
  ): Promise<string> {
    // If it was previously in correction, finalize history with the final record
    if (currentQCStatus === "correction") {
      await this.handleCorrectionWorkflow(connection, qcId, "regular", data);
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
    // For the first cycle, correction_file_path is NULL.
    // For subsequent cycles, it stores the agent's corrected whole_file_path.
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
}
