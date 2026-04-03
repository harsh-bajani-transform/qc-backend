"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCorrectionQCRecords = exports.saveCorrectionQC = void 0;
const db_1 = require("../database/db");
const qc_workflow_service_1 = require("../services/qc-workflow.service");
const qc_helpers_1 = require("../utils/qc-helpers");
const mail_controller_1 = require("../controllers/mail.controller");
/**
 * Controller for handling Correction QC evaluations
 * This is for reviewing correction files submitted by agents
 */
const saveCorrectionQC = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("[QC Correction] POST /save received.");
    const connection = yield (0, db_1.get_db_connection)();
    try {
        yield connection.beginTransaction();
        // Extract form data
        const { logged_in_user_id, tracker_id, assistant_manager_id, qa_user_id, agent_id, project_id, task_id, whole_file_path, qc_file_path, date_of_file_submission, file_record_count, data_generated_count, qc_file_records, error_list, error_score, comments, } = req.body;
        // Validate required fields
        if (!logged_in_user_id || !tracker_id || !qa_user_id || !project_id || !task_id) {
            yield connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }
        // Check if QC record exists for this tracker
        const [existingRows] = yield connection.execute("SELECT id, qc_status FROM qc_records WHERE tracker_id = ?", [tracker_id]);
        if (existingRows.length === 0) {
            yield connection.rollback();
            return res.status(400).json({
                success: false,
                message: "No QC record found for this tracker. Use regular endpoint instead.",
            });
        }
        const qcId = existingRows[0].id;
        // Handle correction workflow
        const finalQCStatus = yield qc_workflow_service_1.QCWorkflowService.handleCorrectionWorkflow(connection, qcId, "correction", {
            whole_file_path: whole_file_path || null,
            qc_file_path: qc_file_path || null,
            error_list: error_list || [],
        });
        // Run status-transition side-effects
        yield (0, qc_helpers_1.handleQCStatusTransitions)(connection, "correction", agent_id, project_id, task_id, whole_file_path, tracker_id, qcId);
        // Update the final status if it was changed by the workflow
        if (finalQCStatus !== existingRows[0].qc_status) {
            yield connection.execute("UPDATE qc_records SET qc_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [finalQCStatus, qcId]);
        }
        // Update qc_status in task_work_tracker
        if (tracker_id) {
            const updateTrackerStatusSql = `
        UPDATE task_work_tracker 
        SET qc_status = 1 
        WHERE tracker_id = ?
      `;
            yield connection.execute(updateTrackerStatusSql, [tracker_id]);
            console.log(`[QC Correction] Updated qc_status to 1 for tracker_id: ${tracker_id}`);
        }
        yield connection.commit();
        // Send Background Email (Async)
        const emailData = yield (0, qc_helpers_1.getQCRecordEmailDetails)(connection, agent_id, project_id, task_id, qa_user_id);
        if (emailData) {
            const submission_time = date_of_file_submission
                ? new Date(date_of_file_submission).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                })
                : "N/A";
            (0, mail_controller_1.sendQCEmailInternal)({
                agent_email: emailData.agent_email,
                status: "correction",
                project_name: emailData.project_name,
                task_name: emailData.task_name,
                qc_agent_name: emailData.qa_name,
                qc_score: null, // No score for correction
                error_count: (error_list === null || error_list === void 0 ? void 0 : error_list.length) || 0,
                error_list,
                comments: comments || "",
                file_path: whole_file_path,
                submission_time,
            }).catch((err) => console.error("[QC Correction] Asynchronous email failed:", err));
        }
        return res.status(200).json({
            success: true,
            message: "Correction QC record saved successfully",
            data: { id: qcId },
        });
    }
    catch (error) {
        if (connection)
            yield connection.rollback();
        console.error("Error saving correction QC record:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
    finally {
        if (connection)
            yield connection.end();
    }
});
exports.saveCorrectionQC = saveCorrectionQC;
const getCorrectionQCRecords = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { logged_in_user_id } = req.query;
    const connection = yield (0, db_1.get_db_connection)();
    try {
        let sql = `
      SELECT 
        q.*,
        a.user_name as agent_name,
        qa.user_name as qa_name,
        am.user_name as am_name,
        p.project_name,
        t.task_name,
        ch.correction_count,
        ch.correction_status,
        ch.correction_file_path,
        ch.correction_file_qc_status
      FROM qc_records q
      LEFT JOIN tfs_user a ON q.agent_id = a.user_id
      LEFT JOIN tfs_user qa ON q.qa_user_id = qa.user_id
      LEFT JOIN tfs_user am ON q.assistant_manager_id = am.user_id
      LEFT JOIN project p ON q.project_id = p.project_id
      LEFT JOIN task t ON q.task_id = t.task_id
      LEFT JOIN qc_correction_history ch ON q.id = ch.qc_record_id
      WHERE q.status = 'correction'
    `;
        const queryParams = [];
        if (logged_in_user_id) {
            sql += ` AND q.agent_id = ?`;
            queryParams.push(logged_in_user_id);
        }
        sql += ` ORDER BY q.created_at DESC`;
        const [rows] = yield connection.execute(sql, queryParams);
        return res.status(200).json({ success: true, data: rows });
    }
    catch (error) {
        console.error("Error fetching correction QC records:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
    finally {
        yield connection.end();
    }
});
exports.getCorrectionQCRecords = getCorrectionQCRecords;
