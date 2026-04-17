"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentUploadCorrection = exports.getQCRecords = exports.deleteQCRecord = exports.updateQCRecord = exports.getQCRecordById = exports.saveQCRecord = exports.downloadCustomSample = exports.generateCustomSample = void 0;
const path_1 = __importDefault(require("path"));
const exceljs_1 = __importDefault(require("exceljs"));
const axios_1 = __importDefault(require("axios"));
const db_1 = __importDefault(require("../database/db"));
const env_1 = require("../config/env");
const mail_controller_1 = require("./mail.controller");
const date_formatter_1 = require("../utils/date-formatter");
const qc_helpers_1 = require("../utils/qc-helpers");
const qc_workflow_service_1 = require("../services/qc-workflow.service");
const cloudinary_utils_1 = require("../utils/cloudinary-utils");
/**
 * Sanitize tracker file URL — if the Python backend accidentally
 * prefixes a local path before an absolute URL, extract the real URL.
 * e.g. "/python/uploads/tracker_files/https://res.cloudinary.com/..."
 *   => "https://res.cloudinary.com/..."
 */
function sanitizeFileUrl(raw) {
    const httpIdx = raw.indexOf("https://");
    if (httpIdx > 0)
        return raw.substring(httpIdx);
    const httpPlainIdx = raw.indexOf("http://");
    if (httpPlainIdx > 0)
        return raw.substring(httpPlainIdx);
    return raw;
}
const generateCustomSample = async (req, res) => {
    var _a, _b, _c;
    const { tracker_id, sampling_percentage } = req.body;
    if (!tracker_id) {
        return res
            .status(400)
            .json({ success: false, message: "tracker_id is required" });
    }
    try {
        // 1. Fetch tracker details from Python backend
        if (!env_1.PYTHON_URL) {
            return res
                .status(500)
                .json({ success: false, message: "Python backend URL not configured" });
        }
        const { logged_in_user_id } = req.body;
        const pythonUrl = env_1.PYTHON_URL.endsWith("/")
            ? `${env_1.PYTHON_URL}tracker/view`
            : `${env_1.PYTHON_URL}/tracker/view`;
        console.log(`[QC Service] Calling Python backend: ${pythonUrl}`);
        console.log(`[QC Service] Request body:`, {
            tracker_id,
            logged_in_user_id,
        });
        const pythonResponse = await axios_1.default.post(pythonUrl, {
            tracker_id,
            logged_in_user_id,
        });
        if (pythonResponse.status !== 200) {
            console.error(`[QC Service] Python backend error:`, pythonResponse.data);
            return res.status(pythonResponse.status).json({
                success: false,
                message: ((_a = pythonResponse.data) === null || _a === void 0 ? void 0 : _a.message) ||
                    "Failed to fetch tracker info from Python backend",
            });
        }
        const trackers = ((_c = (_b = pythonResponse.data) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.trackers) || [];
        const tracker = trackers.find((t) => t.tracker_id == tracker_id);
        if (!tracker || !tracker.tracker_file) {
            return res
                .status(404)
                .json({ success: false, message: "Tracker or file not found" });
        }
        const originalFileUrl = sanitizeFileUrl(tracker.tracker_file);
        if (!originalFileUrl) {
            return res.status(404).json({
                success: false,
                message: `Tracker has no file attached`,
            });
        }
        // 2. Fetch the file directly from Cloudinary URL into memory
        console.log(`[QC Service] Fetching file from: ${originalFileUrl}`);
        const fileResponse = await axios_1.default.get(originalFileUrl, {
            responseType: "arraybuffer",
        });
        // fileResponse.data is a raw ArrayBuffer — use directly (ExcelJS.load expects ArrayBuffer)
        const fileArrayBuffer = fileResponse.data;
        // 3. Read the Excel file from the in-memory buffer
        const workbook = new exceljs_1.default.Workbook();
        const ext = path_1.default.extname(new URL(originalFileUrl).pathname).toLowerCase();
        if (ext === ".xlsx") {
            await workbook.xlsx.load(fileArrayBuffer);
        }
        else if (ext === ".csv") {
            // ExcelJS CSV load requires a Readable stream; convert ArrayBuffer to Buffer first
            const { Readable } = await Promise.resolve().then(() => __importStar(require("stream")));
            const stream = Readable.from(Buffer.from(fileArrayBuffer));
            await workbook.csv.read(stream);
        }
        else {
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
        const rowIndices = [];
        for (let i = 2; i <= worksheet.rowCount; i++) {
            const row = worksheet.getRow(i);
            let isEmpty = true;
            row.eachCell({ includeEmpty: false }, (cell) => {
                if (cell.value !== null &&
                    cell.value !== undefined &&
                    cell.value !== "") {
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
        const sampleWorkbook = new exceljs_1.default.Workbook();
        const sampleSheet = sampleWorkbook.addWorksheet(`QC Sample ${percentage}%`);
        // Copy headers
        const headers = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
            headers[colNumber - 1] = cell.value;
        });
        sampleSheet.addRow(headers);
        const sampleData = [];
        selectedIndices.forEach((idx) => {
            const row = worksheet.getRow(idx);
            const rowData = [];
            const record = {};
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
    }
    catch (error) {
        console.error("Error generating QC sample:", error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : "Internal server error",
        });
    }
};
exports.generateCustomSample = generateCustomSample;
const downloadCustomSample = async (req, res) => {
    var _a, _b;
    const { tracker_id } = req.params;
    const { logged_in_user_id, sampling_percentage } = req.query;
    if (!tracker_id) {
        return res
            .status(400)
            .json({ success: false, message: "tracker_id is required" });
    }
    try {
        // 1. Fetch tracker details from Python backend
        if (!env_1.PYTHON_URL) {
            return res
                .status(500)
                .json({ success: false, message: "Python backend URL not configured" });
        }
        const pythonUrl = env_1.PYTHON_URL.endsWith("/")
            ? `${env_1.PYTHON_URL}tracker/view`
            : `${env_1.PYTHON_URL}/tracker/view`;
        const pythonResponse = await axios_1.default.post(pythonUrl, {
            tracker_id,
            logged_in_user_id,
        });
        if (pythonResponse.status !== 200) {
            return res.status(pythonResponse.status).json({
                success: false,
                message: "Failed to fetch tracker info from Python backend",
            });
        }
        const trackers = ((_b = (_a = pythonResponse.data) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.trackers) || [];
        const tracker = trackers.find((t) => t.tracker_id == tracker_id);
        if (!tracker || !tracker.tracker_file) {
            return res
                .status(404)
                .json({ success: false, message: "Tracker or file not found" });
        }
        const originalFileUrl = sanitizeFileUrl(tracker.tracker_file);
        // 2. Stream the file directly from Cloudinary
        const fileResponse = await axios_1.default.get(originalFileUrl, {
            responseType: "arraybuffer",
        });
        const fileArrayBuffer = fileResponse.data;
        // 3. Read the Excel file
        const workbook = new exceljs_1.default.Workbook();
        const ext = path_1.default.extname(new URL(originalFileUrl).pathname).toLowerCase();
        if (ext === ".xlsx") {
            await workbook.xlsx.load(fileArrayBuffer);
        }
        else if (ext === ".csv") {
            const { Readable } = await Promise.resolve().then(() => __importStar(require("stream")));
            const stream = Readable.from(Buffer.from(fileArrayBuffer));
            await workbook.csv.read(stream);
        }
        else {
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
        const rowIndices = [];
        for (let i = 2; i <= worksheet.rowCount; i++) {
            const row = worksheet.getRow(i);
            let isEmpty = true;
            row.eachCell({ includeEmpty: false }, (cell) => {
                if (cell.value !== null &&
                    cell.value !== undefined &&
                    cell.value !== "") {
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
        const sampleWorkbook = new exceljs_1.default.Workbook();
        const sampleSheet = sampleWorkbook.addWorksheet(`QC Sample ${percentage}%`);
        // Copy headers
        const headers = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
            headers[colNumber - 1] = cell.value;
        });
        sampleSheet.addRow(headers);
        selectedIndices.forEach((idx) => {
            const row = worksheet.getRow(idx);
            const rowData = [];
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                rowData[colNumber - 1] = cell.value;
            });
            sampleSheet.addRow(rowData);
        });
        // 6. Stream directly to response
        const urlPathname = new URL(originalFileUrl).pathname;
        const baseName = path_1.default.basename(urlPathname, ext); // filename without extension
        const downloadFileName = `${baseName}_${percentage}_percent_sample${ext}`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${downloadFileName}"`);
        await sampleWorkbook.xlsx.write(res);
        res.end();
    }
    catch (error) {
        console.error("Error downloading QC sample:", error);
        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                message: error instanceof Error ? error.message : "Internal server error",
            });
        }
    }
};
exports.downloadCustomSample = downloadCustomSample;
const saveQCRecord = async (req, res) => {
    console.log(`[QC Record] POST /save received. Body keys:`, Object.keys(req.body));
    console.log(`[QC Record] tracker_id value:`, req.body.tracker_id);
    console.log(`[QC Record] qc_generated_count value:`, req.body.qc_generated_count);
    console.log(`[QC Record] qc_generated_count type:`, typeof req.body.qc_generated_count);
    const { assistant_manager_id, qa_user_id, agent_id, project_id, task_id, tracker_id, whole_file_path, date_of_file_submission, qc_score, status, qc_status, file_record_count, qc_generated_count, qc_file_records, error_list, sampling_percentage, } = req.body;
    const connection = await (0, db_1.default)();
    const formattedSubmissionDate = (0, qc_helpers_1.formatSubmissionDate)(date_of_file_submission);
    try {
        await connection.beginTransaction();
        let finalQCStatus = status === "regular" ? "completed" : qc_status || null;
        // 1. Generate and Upload Sample if records are provided
        let qc_file_path = null;
        if (qc_file_records && whole_file_path) {
            const folderName = status === "rework" ? "hrms/qc_rework_samples" : "hrms/qc_samples";
            qc_file_path = await (0, qc_helpers_1.uploadSampleToCloudinary)(qc_file_records, whole_file_path, sampling_percentage || 10, folderName);
        }
        // 2. Check for existing record to support iterative rework for the SAME tracker
        console.log(`[QC Record] Checking for existing record with tracker_id: ${tracker_id}`);
        const checkExistingSql = `
      SELECT id, qc_status FROM qc_records 
      WHERE tracker_id = ?
      LIMIT 1
    `;
        const [existingRows] = await connection.execute(checkExistingSql, [
            tracker_id !== null && tracker_id !== void 0 ? tracker_id : null,
        ]);
        console.log(`[QC Record] Found ${existingRows.length} existing record(s)`);
        if (existingRows.length > 0) {
            console.log(`[QC Record] Existing record details:`, existingRows[0]);
        }
        let qcId;
        if (existingRows.length > 0) {
            console.log(`[QC Record] UPDATING existing record with ID: ${existingRows[0].id}`);
            qcId = existingRows[0].id;
            // Build dynamic UPDATE query - only update fields that are provided
            const updateFields = [];
            const updateValues = [];
            if (assistant_manager_id !== undefined) {
                updateFields.push('assistant_manager_id = ?');
                updateValues.push(assistant_manager_id);
            }
            if (qa_user_id !== undefined) {
                updateFields.push('qa_user_id = ?');
                updateValues.push(qa_user_id);
            }
            if (whole_file_path !== undefined) {
                updateFields.push('whole_file_path = ?');
                updateValues.push(whole_file_path);
            }
            if (qc_score !== undefined && status !== "rework") {
                updateFields.push('qc_score = ?');
                updateValues.push(qc_score);
            }
            if (status !== undefined) {
                updateFields.push('status = ?');
                updateValues.push(status);
            }
            if (finalQCStatus !== undefined) {
                updateFields.push('qc_status = ?');
                updateValues.push(finalQCStatus);
            }
            if (file_record_count !== undefined) {
                updateFields.push('file_record_count = ?');
                updateValues.push(file_record_count);
            }
            if (qc_generated_count != null) {
                updateFields.push('qc_generated_count = ?');
                updateValues.push(qc_generated_count);
            }
            if (error_list !== undefined) {
                updateFields.push('error_list = ?');
                updateValues.push(JSON.stringify(error_list));
            }
            if (qc_file_path !== undefined) {
                updateFields.push('qc_file_path = ?');
                updateValues.push(qc_file_path);
            }
            if (tracker_id !== undefined) {
                updateFields.push('tracker_id = ?');
                updateValues.push(tracker_id);
            }
            // Always update timestamp
            updateFields.push('updated_at = CURRENT_TIMESTAMP');
            if (updateFields.length > 0) {
                const updateSql = `
          UPDATE qc_records SET
            ${updateFields.join(', ')}
          WHERE id = ?
        `;
                updateValues.push(qcId);
                console.log(`[QC Record] Updating fields:`, updateFields);
                await connection.execute(updateSql, updateValues);
            }
        }
        else {
            console.log(`[QC Record] INSERTING new record for tracker_id: ${tracker_id}`);
            const insertSql = `
        INSERT INTO qc_records (
          assistant_manager_id, qa_user_id, agent_id, project_id, task_id,
          whole_file_path, date_of_file_submission, qc_score, status, qc_status,
          file_record_count, qc_generated_count,
          error_list, qc_file_path, tracker_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
            const [result] = await connection.execute(insertSql, [
                assistant_manager_id !== null && assistant_manager_id !== void 0 ? assistant_manager_id : null,
                qa_user_id !== null && qa_user_id !== void 0 ? qa_user_id : null,
                agent_id !== null && agent_id !== void 0 ? agent_id : null,
                project_id !== null && project_id !== void 0 ? project_id : null,
                task_id !== null && task_id !== void 0 ? task_id : null,
                whole_file_path !== null && whole_file_path !== void 0 ? whole_file_path : null,
                formattedSubmissionDate !== null && formattedSubmissionDate !== void 0 ? formattedSubmissionDate : null,
                qc_score !== null && qc_score !== void 0 ? qc_score : null,
                status !== null && status !== void 0 ? status : null,
                finalQCStatus,
                file_record_count !== null && file_record_count !== void 0 ? file_record_count : null,
                qc_generated_count !== null && qc_generated_count !== void 0 ? qc_generated_count : null,
                error_list ? JSON.stringify(error_list) : null,
                qc_file_path !== null && qc_file_path !== void 0 ? qc_file_path : null,
                tracker_id !== null && tracker_id !== void 0 ? tracker_id : null,
            ]);
            qcId = result.insertId;
        }
        // 3. Fetch Details for Email Notification
        const emailData = await (0, qc_helpers_1.getQCRecordEmailDetails)(connection, agent_id, project_id, task_id, qa_user_id);
        // 4. Handle Specialized Workflows (Workflow Factory/Service)
        // First check if this is a rework submission that should update rework_history instead of qc_records
        if (status === "regular") {
            // Check if there's an active rework cycle for this record
            const [activeReworkRows] = await connection.execute(`SELECT qc_rework_id, rework_count FROM qc_rework_history
         WHERE qc_record_id = ? AND (rework_file_qc_status IS NULL OR rework_file_qc_status = 'pending')
         ORDER BY rework_count DESC LIMIT 1`, [qcId]);
            if (activeReworkRows.length > 0) {
                // This is a rework evaluation - update rework_history instead of qc_records
                console.log(`[QC Record] Regular submission for active rework cycle ${activeReworkRows[0].rework_count}`);
                finalQCStatus = await qc_workflow_service_1.QCWorkflowService.handleReworkWorkflow(connection, qcId, status, {
                    whole_file_path,
                    qc_file_path,
                    error_list,
                    file_record_count,
                    qc_generated_count: qc_generated_count,
                    qc_score: qc_score,
                });
            }
            else {
                // This is a regular first-time QC evaluation - update qc_records
                console.log(`[QC Record] Regular submission for initial QC evaluation`);
                finalQCStatus = await qc_workflow_service_1.QCWorkflowService.handleRegularWorkflow(connection, qcId, status, existingRows.length > 0 ? existingRows[0].qc_status : null, {
                    whole_file_path,
                    qc_file_path,
                    error_list,
                    file_record_count,
                    qc_generated_count: qc_generated_count,
                    qc_score: qc_score,
                });
            }
        }
        else if (status === "correction") {
            finalQCStatus = await qc_workflow_service_1.QCWorkflowService.handleCorrectionWorkflow(connection, qcId, status, {
                qc_file_path,
                whole_file_path, // Add this missing parameter
                error_list,
                // no qc_score — correction is status-only
            });
        }
        else if (status === "rework") {
            finalQCStatus = await qc_workflow_service_1.QCWorkflowService.handleReworkWorkflow(connection, qcId, status, {
                whole_file_path,
                qc_file_path,
                error_list,
                file_record_count,
                qc_generated_count: qc_generated_count,
                qc_score: qc_score,
            });
        }
        // 4b. Run status-transition side-effects (tracker_records reset)
        if (status === "rework" || status === "correction") {
            await (0, qc_helpers_1.handleQCStatusTransitions)(connection, status, agent_id, project_id, task_id, tracker_id || null, qcId, whole_file_path);
        }
        // Update the final status if it was changed by the workflow (e.g. from correction to completed)
        if (finalQCStatus !== (status === "regular" ? "completed" : qc_status || null)) {
            await connection.execute("UPDATE qc_records SET qc_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [finalQCStatus, qcId]);
        }
        // 5. Update qc_status in task_work_tracker
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
        // 6. Send Background Email (Async)
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
                status,
                project_name: emailData.project_name,
                task_name: emailData.task_name,
                qc_agent_name: emailData.qa_name,
                qc_score,
                error_count: (error_list === null || error_list === void 0 ? void 0 : error_list.length) || 0,
                error_list,
                comments: req.body.comments || "",
                file_path: status === "rework" || status === "correction"
                    ? whole_file_path
                    : qc_file_path,
                submission_time,
            }).catch((err) => console.error("[QC Service] Asynchronous email failed:", err));
        }
        return res.status(200).json({
            success: true,
            message: "QC record saved successfully",
            data: { id: qcId },
        });
    }
    catch (error) {
        if (connection)
            await connection.rollback();
        console.error("Error saving QC record:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
    finally {
        if (connection)
            await connection.end();
    }
};
exports.saveQCRecord = saveQCRecord;
const getQCRecordById = async (req, res) => {
    const { id } = req.params;
    const connection = await (0, db_1.default)();
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
        const [rows] = await connection.execute(sql, [id]);
        if (rows.length === 0) {
            return res
                .status(404)
                .json({ success: false, message: "QC record not found" });
        }
        return res.status(200).json({ success: true, data: rows[0] });
    }
    catch (error) {
        console.error("Error fetching QC record:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
    finally {
        await connection.end();
    }
};
exports.getQCRecordById = getQCRecordById;
const updateQCRecord = async (req, res) => {
    const { id } = req.params;
    console.log(`[QC Record] PUT /update/${id} received.`);
    const { qc_score, status, error_score, error_list } = req.body;
    const connection = await (0, db_1.default)();
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
    }
    catch (error) {
        console.error("Error updating QC record:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
    finally {
        await connection.end();
    }
};
exports.updateQCRecord = updateQCRecord;
const deleteQCRecord = async (req, res) => {
    const { id } = req.params;
    const connection = await (0, db_1.default)();
    try {
        await connection.execute("DELETE FROM qc_records WHERE id = ?", [id]);
        return res
            .status(200)
            .json({ success: true, message: "QC record deleted successfully" });
    }
    catch (error) {
        console.error("Error deleting QC record:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
    finally {
        await connection.end();
    }
};
exports.deleteQCRecord = deleteQCRecord;
const getQCRecords = async (req, res) => {
    const { logged_in_user_id } = req.query;
    const connection = await (0, db_1.default)();
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
        const queryParams = [];
        if (logged_in_user_id) {
            sql += ` WHERE q.agent_id = ?`;
            queryParams.push(logged_in_user_id);
        }
        sql += ` ORDER BY q.created_at DESC`;
        const [rows] = await connection.execute(sql, queryParams);
        // Format dates in the response
        const formattedRows = (0, date_formatter_1.formatDatesInRows)(rows, ['created_at', 'updated_at', 'date_of_file_submission']);
        return res.status(200).json({ success: true, data: formattedRows });
    }
    catch (error) {
        console.error("Error fetching QC records:", error);
        return res
            .status(500)
            .json({ success: false, message: "Internal server error" });
    }
    finally {
        await connection.end();
    }
};
exports.getQCRecords = getQCRecords;
const agentUploadCorrection = async (req, res) => {
    const mreq = req;
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
    const folder = type === "rework" ? "hrms/qc_rework_files" : "hrms/qc_correction_files";
    const fileName = `fixed_${type}_${qcId}_${Date.now()}${path_1.default.extname(mreq.file.originalname)}`;
    let connection;
    try {
        const uploadRes = await (0, cloudinary_utils_1.uploadBufferToCloudinary)(mreq.file.buffer, folder, fileName);
        const fileUrl = uploadRes.secure_url;
        connection = await (0, db_1.default)();
        await connection.beginTransaction();
        await qc_workflow_service_1.QCWorkflowService.recordAgentUpload(connection, Number(qcId), type, fileUrl);
        await connection.commit();
        return res.status(200).json({
            success: true,
            message: "File uploaded and status updated successfully",
            data: { fileUrl },
        });
    }
    catch (error) {
        if (connection)
            await connection.rollback();
        console.error("Error in agentUploadCorrection:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
    finally {
        if (connection)
            await connection.end();
    }
};
exports.agentUploadCorrection = agentUploadCorrection;
