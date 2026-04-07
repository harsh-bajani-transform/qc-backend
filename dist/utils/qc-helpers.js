"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatSubmissionDate = formatSubmissionDate;
exports.uploadSampleToCloudinary = uploadSampleToCloudinary;
exports.getQCRecordEmailDetails = getQCRecordEmailDetails;
exports.handleQCStatusTransitions = handleQCStatusTransitions;
exports.generateSystematicSample = generateSystematicSample;
const exceljs_1 = __importDefault(require("exceljs"));
const path_1 = __importDefault(require("path"));
const cloudinary_utils_1 = require("./cloudinary-utils");
/**
 * Formats a date string to include current time if only YYYY-MM-DD is provided.
 */
function formatSubmissionDate(date_of_file_submission) {
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
async function uploadSampleToCloudinary(qc_file_records, whole_file_path, percentage = 10, folderName = "hrms/qc_samples") {
    try {
        const sampleData = typeof qc_file_records === "string" ? JSON.parse(qc_file_records) : qc_file_records;
        if (Array.isArray(sampleData) && sampleData.length > 0) {
            const sampleWorkbook = new exceljs_1.default.Workbook();
            const sampleSheet = sampleWorkbook.addWorksheet(`QC Sample ${percentage}%`);
            const headers = Object.keys(sampleData[0]);
            sampleSheet.addRow(headers);
            sampleData.forEach((record) => {
                sampleSheet.addRow(headers.map((h) => record[h]));
            });
            const buffer = (await sampleWorkbook.xlsx.writeBuffer());
            const fileName = path_1.default.basename(whole_file_path || "sample", path_1.default.extname(whole_file_path || ".xlsx")) +
                `_${percentage}_sample_` +
                Date.now() +
                ".xlsx";
            const uploadRes = await (0, cloudinary_utils_1.uploadBufferToCloudinary)(buffer, folderName, fileName);
            return uploadRes.secure_url;
        }
    }
    catch (err) {
        console.error("[QC Helper] Failed to upload sample to Cloudinary:", err);
    }
    return null;
}
/**
 * Fetches required details for email notification in a single batch of queries.
 */
async function getQCRecordEmailDetails(connection, agent_id, project_id, task_id, qa_user_id) {
    var _a, _b;
    try {
        console.log(`[QC Helper] Fetching email details for agent_id: ${agent_id}`);
        const [agentRows] = await connection.execute("SELECT user_name, user_email FROM tfs_user WHERE user_id = ?", [agent_id]);
        const [projectRows] = await connection.execute("SELECT project_name FROM project WHERE project_id = ?", [project_id]);
        const [taskRows] = await connection.execute("SELECT task_name FROM task WHERE task_id = ?", [task_id]);
        const [qaRows] = await connection.execute("SELECT user_name FROM tfs_user WHERE user_id = ?", [qa_user_id]);
        if (agentRows.length > 0) {
            return {
                agent_email: agentRows[0].user_email,
                agent_name: agentRows[0].user_name,
                project_name: ((_a = projectRows[0]) === null || _a === void 0 ? void 0 : _a.project_name) || "N/A",
                task_name: ((_b = taskRows[0]) === null || _b === void 0 ? void 0 : _b.task_name) || "N/A",
                qa_name: qaRows[0] ? qaRows[0].user_name : "QA Department",
            };
        }
    }
    catch (err) {
        console.error("[QC Helper] Error fetching email details:", err);
    }
    return null;
}
/**
 * Handles database updates for status transitions (Rework/Correction).
 */
async function handleQCStatusTransitions(connection, status, agent_id, project_id, task_id, whole_file_path, tracker_id, qcId) {
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
    // 2. Handle Rework Tracker Entry (Side-effects for history are now handled in QCWorkflowService)
    // No further legacy table updates needed.
}
/**
 * Samples records using systematic random sampling.
 * Selects every k-th record starting from a random index.
 */
function generateSystematicSample(records, sampleSize) {
    if (!records || records.length === 0 || sampleSize <= 0) {
        return [];
    }
    const totalRecords = records.length;
    if (sampleSize >= totalRecords) {
        return [...records]; // Return all if sample size exceeds total
    }
    const interval = totalRecords / sampleSize;
    const start = Math.floor(Math.random() * interval);
    const sampled = [];
    for (let i = 0; i < sampleSize; i++) {
        const index = Math.floor(start + i * interval);
        if (index < totalRecords) {
            sampled.push(records[index]);
        }
    }
    return sampled;
}
