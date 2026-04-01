import { Connection } from "mysql2/promise";

/**
 * Service to handle specialized QC workflows for Correction, Rework, and Regular submissions.
 *
 * Lifecycle for Rework & Correction:
 *  1. QA marks status → INSERT new history row (file_path = NULL, file_qc_status = NULL)
 *  2. Agent uploads corrected file → same endpoint → UPDATE open row:
 *       file_path = agent_file, file_qc_status = 'pending' (awaiting QA review)
 *  3a. QA approves agent's file (status=regular) → UPDATE row:
 *       file_qc_status = 'completed', qc_score = score, status = 'completed'
 *       → qc_records.qc_status = 'completed'
 *  3b. QA rejects agent's file (status=rework/correction again) → UPDATE row:
 *       file_qc_status = 'completed', qc_score = score
 *       → INSERT new row with count+1, file_path = NULL
 *
 * Open-row detection:
 *  - rework_file_path IS NULL    → agent hasn't uploaded yet
 *  - correction_file_path IS NULL → agent hasn't uploaded yet
 */
export class QCWorkflowService {
  /**
   * Handles the workflow for Regular submissions (100% Score / Approved).
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
      qc_score?: string | number;
    }
  ): Promise<string> {
    if (currentQCStatus === "correction") {
      await this.handleCorrectionWorkflow(connection, qcId, "regular", data);
    } else if (currentQCStatus === "rework") {
      await this.handleReworkWorkflow(connection, qcId, "regular", data);
    }
    return "completed";
  }

  /**
   * Handles the iterative Correction lifecycle.
   *
   * - QA sends the SAMPLE file (qc_file_path) to the agent for correction.
   * - Agent corrects and re-uploads (typically one cycle).
   *
   * New DB columns used:
   *   correction_file_qc_status  VARCHAR(20):  NULL | 'pending' | 'completed'
   *   correction_qc_score        DECIMAL(5,2): score set when QA closes the cycle
   */
  static async handleCorrectionWorkflow(
    connection: Connection,
    qcId: number,
    submissionStatus: string,
    data: {
      whole_file_path: string | null;
      qc_file_path: string | null;
      error_list: any[];
      // Note: no qc_score — correction flow is status-only, no scoring
    }
  ): Promise<string> {
    console.log(`[QC Workflow] Processing Correction Flow for QC ID: ${qcId}`);

    // ── PHASE CHECK: Is there an open row (agent hasn't uploaded yet)? ──────────
    const [openRows]: any = await connection.execute(
      `SELECT qc_correction_id, correction_count
       FROM qc_correction_history
       WHERE qc_record_id = ? AND correction_file_path IS NULL
       ORDER BY correction_count DESC
       LIMIT 1`,
      [qcId]
    );

    if (openRows.length > 0) {
      // ── Agent is submitting their corrected file ──────────────────────────────
      const openRow = openRows[0];

      if (submissionStatus === "regular") {
        // QA received agent's file and approved directly → mark completed (no score in correction)
        await connection.execute(
          `UPDATE qc_correction_history
           SET correction_file_path      = ?,
               correction_status         = 'completed',
               correction_file_qc_status = 'completed'
           WHERE qc_correction_id = ?`,
          [data.whole_file_path, openRow.qc_correction_id]
        );
        console.log(
          `[QC Workflow] Correction (Cycle ${openRow.correction_count}): Agent file received + approved.`
        );
        return "completed";
      }

      // Agent uploaded, QA hasn't reviewed it yet → status = 'pending'
      await connection.execute(
        `UPDATE qc_correction_history
         SET correction_file_path      = ?,
             correction_status         = 'submitted',
             correction_file_qc_status = 'pending'
         WHERE qc_correction_id = ?`,
        [data.whole_file_path, openRow.qc_correction_id]
      );
      console.log(
        `[QC Workflow] Correction (Cycle ${openRow.correction_count}): Agent file received, QC pending`
      );
      return "correction";
    }

    // ── No open row: agent already uploaded (or hasn't started yet) ─────────────
    if (submissionStatus === "regular") {
      // QA is approving agent's file (the closed row is now being finalised)
      const [latestRows]: any = await connection.execute(
        `SELECT qc_correction_id, correction_count
         FROM qc_correction_history
         WHERE qc_record_id = ?
         ORDER BY correction_count DESC
         LIMIT 1`,
        [qcId]
      );
      if (latestRows.length > 0) {
        await connection.execute(
          `UPDATE qc_correction_history
           SET correction_status         = 'completed',
               correction_file_qc_status = 'completed'
           WHERE qc_correction_id = ?`,
          [latestRows[0].qc_correction_id]
        );
        console.log(
          `[QC Workflow] Correction (Cycle ${latestRows[0].correction_count}): Marked completed for QC ID ${qcId}`
        );
      } else {
        console.log(`[QC Workflow] No correction history for QC ID ${qcId}. Nothing to finalise.`);
      }
      return "completed";
    }

    // ── QA reviewed agent's file and is sending it back for another correction ──
    // First close the previous cycle with the score, then open a new one.
    const [latestRows]: any = await connection.execute(
      `SELECT qc_correction_id, correction_count
       FROM qc_correction_history
       WHERE qc_record_id = ?
       ORDER BY correction_count DESC
       LIMIT 1`,
      [qcId]
    );

    if (latestRows.length > 0) {
      await connection.execute(
        `UPDATE qc_correction_history
         SET correction_file_qc_status = 'completed'
         WHERE qc_correction_id = ?`,
        [latestRows[0].qc_correction_id]
      );
      console.log(
        `[QC Workflow] Correction (Cycle ${latestRows[0].correction_count}): QC done on agent file. Opening new cycle.`
      );
    }

    const nextCount =
      latestRows.length > 0 ? (latestRows[0].correction_count || 0) + 1 : 1;

    await connection.execute(
      `INSERT INTO qc_correction_history (
         qc_record_id,
         qc_file_path,
         correction_file_path,
         correction_count,
         correction_status,
         correction_error_list,
         correction_file_qc_status,
         correction_qc_score
       ) VALUES (?, ?, NULL, ?, 'correction', ?, NULL, NULL)`,
      [qcId, data.qc_file_path, nextCount, JSON.stringify(data.error_list)]
    );

    console.log(
      `[QC Workflow] Correction (Cycle ${nextCount}): New cycle started. Awaiting agent's corrected file.`
    );
    return "correction";
  }

  /**
   * Handles the iterative Rework lifecycle.
   *
   * - QA sends the WHOLE file (whole_file_path) to the agent for rework.
   * - Agent reworks and re-uploads; multiple cycles are possible.
   *
   * New DB column used:
   *   rework_file_qc_status  VARCHAR(20):  NULL | 'pending' | 'completed'
   *   rework_qc_score        already exists — now populated per cycle
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
      qc_score?: string | number;
    }
  ): Promise<string> {
    console.log(`[QC Workflow] Processing Rework Flow for QC ID: ${qcId}`);

    // ── PHASE CHECK: Is there an open row (agent hasn't uploaded yet)? ──────────
    const [openRows]: any = await connection.execute(
      `SELECT qc_rework_id, rework_count
       FROM qc_rework_history
       WHERE qc_record_id = ? AND rework_file_path IS NULL
       ORDER BY rework_count DESC
       LIMIT 1`,
      [qcId]
    );

    if (openRows.length > 0) {
      // ── Agent is submitting their reworked file ───────────────────────────────
      const openRow = openRows[0];

      if (submissionStatus === "regular") {
        // QA received agent's file and approved directly → mark completed with score
        await connection.execute(
          `UPDATE qc_rework_history
           SET rework_file_path      = ?,
               rework_status         = 'completed',
               rework_file_qc_status = 'completed',
               rework_qc_score       = ?
           WHERE qc_rework_id = ?`,
          [data.whole_file_path, data.qc_score ?? null, openRow.qc_rework_id]
        );
        console.log(
          `[QC Workflow] Rework (Cycle ${openRow.rework_count}): Agent file received + approved. Score: ${data.qc_score}`
        );
        return "completed";
      }

      // Agent uploaded, QA hasn't reviewed yet → status = 'pending'
      await connection.execute(
        `UPDATE qc_rework_history
         SET rework_file_path      = ?,
             rework_status         = 'submitted',
             rework_file_qc_status = 'pending'
         WHERE qc_rework_id = ?`,
        [data.whole_file_path, openRow.qc_rework_id]
      );
      console.log(
        `[QC Workflow] Rework (Cycle ${openRow.rework_count}): Agent file received, QC pending`
      );
      return "rework";
    }

    // ── No open row: agent already uploaded (or hasn't started yet) ─────────────
    if (submissionStatus === "regular") {
      // QA is approving agent's file
      const [latestRows]: any = await connection.execute(
        `SELECT qc_rework_id, rework_count
         FROM qc_rework_history
         WHERE qc_record_id = ?
         ORDER BY rework_count DESC
         LIMIT 1`,
        [qcId]
      );
      if (latestRows.length > 0) {
        await connection.execute(
          `UPDATE qc_rework_history
           SET rework_status         = 'completed',
               rework_file_qc_status = 'completed',
               rework_qc_score       = ?
           WHERE qc_rework_id = ?`,
          [data.qc_score ?? null, latestRows[0].qc_rework_id]
        );
        console.log(
          `[QC Workflow] Rework (Cycle ${latestRows[0].rework_count}): Marked completed. Score: ${data.qc_score}`
        );
      } else {
        console.log(`[QC Workflow] No rework history for QC ID ${qcId}. Nothing to finalise.`);
      }
      return "completed";
    }

    // ── QA reviewed agent's file and is sending it back for rework again ────────
    // First close the previous cycle with the score, then open a new one.
    const [latestRows]: any = await connection.execute(
      `SELECT qc_rework_id, rework_count
       FROM qc_rework_history
       WHERE qc_record_id = ?
       ORDER BY rework_count DESC
       LIMIT 1`,
      [qcId]
    );

    if (latestRows.length > 0) {
      await connection.execute(
        `UPDATE qc_rework_history
         SET rework_file_qc_status = 'completed'
         WHERE qc_rework_id = ?`,
        [latestRows[0].qc_rework_id]
      );
      console.log(
        `[QC Workflow] Rework (Cycle ${latestRows[0].rework_count}): QC done on agent file. Opening new cycle.`
      );
    }

    const nextCount =
      latestRows.length > 0 ? (latestRows[0].rework_count || 0) + 1 : 1;

    await connection.execute(
      `INSERT INTO qc_rework_history (
         qc_record_id,
         qc_file_path,
         rework_file_path,
         rework_count,
         rework_status,
         rework_error_list,
         file_record_count,
         qc_data_generated_count,
         rework_qc_score,
         rework_file_qc_status,
         rework_sample_file
       ) VALUES (?, ?, NULL, ?, 'rework', ?, ?, ?, NULL, NULL, ?)`,
      [
        qcId,
        data.whole_file_path,     // Whole file QA is sending to agent for rework
        nextCount,
        JSON.stringify(data.error_list),
        data.file_record_count || 0,
        data.qc_generated_count || 0,
        data.qc_file_path,        // Sample file generated by QA during this rework review
      ]
    );

    console.log(
      `[QC Workflow] Rework (Cycle ${nextCount}): New cycle started. Awaiting agent's reworked file.`
    );
    return "rework";
  }

  /**
   * Records an agent's file upload for an existing Rework or Correction cycle.
   * Updates the 'open' row (where file_path is NULL) with the new file URL.
   */
  static async recordAgentUpload(
    connection: Connection,
    qcId: number,
    type: "rework" | "correction",
    fileUrl: string
  ): Promise<void> {
    console.log(`[QC Workflow] Recording Agent Upload for QC ID: ${qcId}, Type: ${type}`);

    if (type === "rework") {
      // 1. Find the open rework row
      const [openRows]: any = await connection.execute(
        `SELECT qc_rework_id FROM qc_rework_history 
         WHERE qc_record_id = ? AND rework_file_path IS NULL 
         ORDER BY rework_count DESC LIMIT 1`,
        [qcId]
      );

      if (openRows.length === 0) {
        throw new Error("No open rework cycle found for this record.");
      }

      // 2. Update the row
      await connection.execute(
        `UPDATE qc_rework_history 
         SET rework_file_path = ?, rework_status = 'submitted', rework_file_qc_status = 'pending'
         WHERE qc_rework_id = ?`,
        [fileUrl, openRows[0].qc_rework_id]
      );
    } else {
      // 1. Find the open correction row
      const [openRows]: any = await connection.execute(
        `SELECT qc_correction_id FROM qc_correction_history 
         WHERE qc_record_id = ? AND correction_file_path IS NULL 
         ORDER BY correction_count DESC LIMIT 1`,
        [qcId]
      );

      if (openRows.length === 0) {
        throw new Error("No open correction cycle found for this record.");
      }

      // 2. Update the row
      await connection.execute(
        `UPDATE qc_correction_history 
         SET correction_file_path = ?, correction_status = 'submitted', correction_file_qc_status = 'pending'
         WHERE qc_correction_id = ?`,
        [fileUrl, openRows[0].qc_correction_id]
      );
    }

    // 3. Update the main record status to 'pending' so QA knows to review again
    await connection.execute(
      "UPDATE qc_records SET qc_status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [qcId]
    );
  }
}
