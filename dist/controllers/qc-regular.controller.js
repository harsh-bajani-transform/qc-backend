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
exports.getRegularQCRecords = exports.saveRegularQC = void 0;
const db_1 = require("../database/db");
const qc_workflow_service_1 = require("../services/qc-workflow.service");
const qc_helpers_1 = require("../utils/qc-helpers");
const mail_controller_1 = require("../controllers/mail.controller");
/**
 * Controller for handling Regular QC evaluations
 * This is for first-time QC evaluations of submitted files
 */
const saveRegularQC = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("[QC Regular] POST /save received.");
    const connection = yield (0, db_1.get_db_connection)();
    try {
        yield connection.beginTransaction();
        // Extract form data with null checks
        const { logged_in_user_id, tracker_id, assistant_manager_id, qa_user_id, agent_id, project_id, task_id, whole_file_path, qc_file_path, date_of_file_submission, qc_score, file_record_count, data_generated_count, qc_file_records, error_list, error_score, comments, } = req.body;
        // Ensure all values are properly handled (undefined -> null)
        const safeParams = {
            assistant_manager_id: assistant_manager_id || null,
            qa_user_id: qa_user_id || null,
            agent_id: agent_id || null,
            project_id: project_id || null,
            task_id: task_id || null,
            whole_file_path: whole_file_path || null,
            qc_file_path: qc_file_path || null,
            date_of_file_submission: date_of_file_submission || null,
            qc_score: qc_score || null,
            file_record_count: file_record_count || 0,
            data_generated_count: data_generated_count || 0,
            error_list: error_list ? JSON.stringify(error_list) : null,
            tracker_id: tracker_id || null,
        };
        // Validate required fields
        if (!safeParams.qa_user_id || !safeParams.project_id || !safeParams.task_id || !safeParams.tracker_id) {
            yield connection.rollback();
            return res.status(400).json({
                success: false,
                message: "Missing required fields",
            });
        }
        // Check if QC record already exists for this tracker
        const [existingRows] = yield connection.execute("SELECT id, qc_status FROM qc_records WHERE tracker_id = ?", [safeParams.tracker_id]);
        if (existingRows.length > 0) {
            // Check if there's an active rework cycle for this record
            const [activeReworkRows] = yield connection.execute(`SELECT qc_rework_id, rework_count FROM qc_rework_history
         WHERE qc_record_id = ? AND (rework_file_qc_status IS NULL OR rework_file_qc_status = 'pending')
         ORDER BY rework_count DESC LIMIT 1`, [existingRows[0].id]);
            if (activeReworkRows.length > 0) {
                // This is a rework evaluation - update rework_history instead of qc_records
                console.log(`[QC Regular] Regular submission for active rework cycle ${activeReworkRows[0].rework_count}`);
                const finalQCStatus = yield qc_workflow_service_1.QCWorkflowService.handleReworkWorkflow(connection, existingRows[0].id, "regular", {
                    whole_file_path: safeParams.whole_file_path,
                    qc_file_path: safeParams.qc_file_path,
                    error_list: safeParams.error_list ? JSON.parse(safeParams.error_list) : [],
                    file_record_count: safeParams.file_record_count,
                    qc_generated_count: safeParams.data_generated_count,
                    qc_score: safeParams.qc_score,
                });
                // Run status-transition side-effects
                yield (0, qc_helpers_1.handleQCStatusTransitions)(connection, "regular", safeParams.agent_id, safeParams.project_id, safeParams.task_id, safeParams.tracker_id, existingRows[0].id, safeParams.whole_file_path);
                // Update the final status if it was changed by the workflow
                if (finalQCStatus !== existingRows[0].qc_status) {
                    yield connection.execute("UPDATE qc_records SET qc_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [finalQCStatus, existingRows[0].id]);
                }
                // Update qc_status in task_work_tracker
                if (safeParams.tracker_id) {
                    const updateTrackerStatusSql = `
            UPDATE task_work_tracker 
            SET qc_status = 1 
            WHERE tracker_id = ?
          `;
                    yield connection.execute(updateTrackerStatusSql, [safeParams.tracker_id]);
                    console.log(`[QC Regular] Updated qc_status to 1 for tracker_id: ${safeParams.tracker_id}`);
                }
                yield connection.commit();
                // Send Background Email (Async)
                const emailData = yield (0, qc_helpers_1.getQCRecordEmailDetails)(connection, safeParams.agent_id, safeParams.project_id, safeParams.task_id, safeParams.qa_user_id);
                if (emailData) {
                    const submission_time = safeParams.date_of_file_submission
                        ? new Date(safeParams.date_of_file_submission).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                        })
                        : "N/A";
                    (0, mail_controller_1.sendQCEmailInternal)({
                        agent_email: emailData.agent_email,
                        status: "regular",
                        project_name: emailData.project_name,
                        task_name: emailData.task_name,
                        qc_agent_name: emailData.qa_name,
                        qc_score: safeParams.qc_score,
                        error_count: safeParams.error_list ? JSON.parse(safeParams.error_list).length || 0 : 0,
                        error_list: safeParams.error_list ? JSON.parse(safeParams.error_list) : [],
                        comments: "",
                        file_path: safeParams.qc_file_path,
                        submission_time,
                    }).catch((err) => console.error("[QC Regular] Asynchronous email failed:", err));
                }
                return res.status(200).json({
                    success: true,
                    message: "Rework QC record saved successfully",
                    data: { id: existingRows[0].id },
                });
            }
            // Check if there's an active correction cycle for this record
            const [activeCorrectionRows] = yield connection.execute(`SELECT qc_correction_id, correction_count FROM qc_correction_history
         WHERE qc_record_id = ? AND (correction_file_qc_status IS NULL OR correction_file_qc_status = 'pending')
         ORDER BY correction_count DESC LIMIT 1`, [existingRows[0].id]);
            if (activeCorrectionRows.length > 0) {
                // This is a correction evaluation - update correction_history instead of qc_records
                console.log(`[QC Regular] Regular submission for active correction cycle ${activeCorrectionRows[0].correction_count}`);
                const finalQCStatus = yield qc_workflow_service_1.QCWorkflowService.handleCorrectionWorkflow(connection, existingRows[0].id, "regular", {
                    qc_file_path: safeParams.qc_file_path,
                    whole_file_path: safeParams.whole_file_path,
                    error_list: safeParams.error_list ? JSON.parse(safeParams.error_list) : [],
                    // no qc_score — correction is status-only
                });
                // Run status-transition side-effects
                yield (0, qc_helpers_1.handleQCStatusTransitions)(connection, "regular", safeParams.agent_id, safeParams.project_id, safeParams.task_id, safeParams.tracker_id, existingRows[0].id, safeParams.whole_file_path);
                // Update the final status if it was changed by the workflow
                if (finalQCStatus !== existingRows[0].qc_status) {
                    yield connection.execute("UPDATE qc_records SET qc_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [finalQCStatus, existingRows[0].id]);
                }
                // Update qc_status in task_work_tracker
                if (safeParams.tracker_id) {
                    const updateTrackerStatusSql = `
            UPDATE task_work_tracker 
            SET qc_status = 1 
            WHERE tracker_id = ?
          `;
                    yield connection.execute(updateTrackerStatusSql, [safeParams.tracker_id]);
                    console.log(`[QC Regular] Updated qc_status to 1 for tracker_id: ${safeParams.tracker_id}`);
                }
                yield connection.commit();
                // Send Background Email (Async)
                const emailData = yield (0, qc_helpers_1.getQCRecordEmailDetails)(connection, safeParams.agent_id, safeParams.project_id, safeParams.task_id, safeParams.qa_user_id);
                if (emailData) {
                    // Fetch QC score from qc_records table for this correction record
                    const [qcRecordRows] = yield connection.execute("SELECT qc_score FROM qc_records WHERE id = ?", [existingRows[0].id]);
                    const qcScore = qcRecordRows.length > 0 ? qcRecordRows[0].qc_score : null;
                    const submission_time = safeParams.date_of_file_submission
                        ? new Date(safeParams.date_of_file_submission).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                        })
                        : "N/A";
                    (0, mail_controller_1.sendQCEmailInternal)({
                        agent_name: emailData.agent_name,
                        agent_email: emailData.agent_email,
                        project_name: emailData.project_name,
                        task_name: emailData.task_name,
                        qa_name: emailData.qa_name,
                        status: "correction", // Specify this is a correction completion
                        qc_score: qcScore, // Fetch QC score from qc_records table
                        file_path: safeParams.qc_file_path, // Send sample file instead of whole file
                        submission_time,
                    }).catch((err) => console.error("[QC Regular] Asynchronous email failed:", err));
                }
                return res.status(200).json({
                    success: true,
                    message: "Correction QC record saved successfully",
                    data: { id: existingRows[0].id },
                });
            }
            yield connection.rollback();
            return res.status(400).json({
                success: false,
                message: "QC record already exists for this tracker. Use rework or correction endpoints instead.",
            });
        }
        // Insert new QC record
        const [insertResult] = yield connection.execute(`INSERT INTO qc_records (
        assistant_manager_id, qa_user_id, agent_id, project_id, task_id,
        whole_file_path, date_of_file_submission, qc_score, status, qc_status,
        file_record_count, qc_generated_count,
        error_list, qc_file_path, tracker_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            safeParams.assistant_manager_id,
            safeParams.qa_user_id,
            safeParams.agent_id,
            safeParams.project_id,
            safeParams.task_id,
            safeParams.whole_file_path,
            safeParams.date_of_file_submission,
            safeParams.qc_score,
            'regular',
            'completed',
            safeParams.file_record_count,
            safeParams.data_generated_count,
            safeParams.error_list,
            safeParams.qc_file_path,
            safeParams.tracker_id,
        ]);
        const qcId = insertResult.insertId;
        console.log(`[QC Regular] New QC record created with ID: ${qcId}`);
        // Handle workflow (should be completed for regular QC)
        const finalQCStatus = yield qc_workflow_service_1.QCWorkflowService.handleRegularWorkflow(connection, qcId, "regular", null, {
            whole_file_path: safeParams.whole_file_path,
            qc_file_path: safeParams.qc_file_path,
            error_list: safeParams.error_list ? JSON.parse(safeParams.error_list) : [],
            file_record_count: safeParams.file_record_count,
            qc_generated_count: safeParams.data_generated_count,
            qc_score: safeParams.qc_score,
        });
        // Run status-transition side-effects
        yield (0, qc_helpers_1.handleQCStatusTransitions)(connection, "regular", safeParams.agent_id, safeParams.project_id, safeParams.task_id, safeParams.whole_file_path, safeParams.tracker_id, qcId);
        // Update qc_status in task_work_tracker
        if (safeParams.tracker_id) {
            const updateTrackerStatusSql = `
        UPDATE task_work_tracker 
        SET qc_status = 1 
        WHERE tracker_id = ?
      `;
            yield connection.execute(updateTrackerStatusSql, [safeParams.tracker_id]);
            console.log(`[QC Regular] Updated qc_status to 1 for tracker_id: ${safeParams.tracker_id}`);
        }
        yield connection.commit();
        // Send Background Email (Async)
        const emailData = yield (0, qc_helpers_1.getQCRecordEmailDetails)(connection, safeParams.agent_id, safeParams.project_id, safeParams.task_id, safeParams.qa_user_id);
        if (emailData) {
            const submission_time = safeParams.date_of_file_submission
                ? new Date(safeParams.date_of_file_submission).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                })
                : "N/A";
            (0, mail_controller_1.sendQCEmailInternal)({
                agent_email: emailData.agent_email,
                status: "regular",
                project_name: emailData.project_name,
                task_name: emailData.task_name,
                qc_agent_name: emailData.qa_name,
                qc_score: safeParams.qc_score,
                error_count: safeParams.error_list ? JSON.parse(safeParams.error_list).length || 0 : 0,
                error_list: safeParams.error_list ? JSON.parse(safeParams.error_list) : [],
                comments: "",
                file_path: safeParams.qc_file_path,
                submission_time,
            }).catch((err) => console.error("[QC Regular] Asynchronous email failed:", err));
        }
        return res.status(200).json({
            success: true,
            message: "Regular QC record saved successfully",
            data: { id: qcId },
        });
    }
    catch (error) {
        if (connection)
            yield connection.rollback();
        console.error("Error saving regular QC record:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
    finally {
        if (connection)
            yield connection.end();
    }
});
exports.saveRegularQC = saveRegularQC;
const getRegularQCRecords = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        t.task_name
      FROM qc_records q
      LEFT JOIN tfs_user a ON q.agent_id = a.user_id
      LEFT JOIN tfs_user qa ON q.qa_user_id = qa.user_id
      LEFT JOIN tfs_user am ON q.assistant_manager_id = am.user_id
      LEFT JOIN project p ON q.project_id = p.project_id
      LEFT JOIN task t ON q.task_id = t.task_id
      WHERE q.status = 'regular'
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
        console.error("Error fetching regular QC records:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
    finally {
        yield connection.end();
    }
});
exports.getRegularQCRecords = getRegularQCRecords;
