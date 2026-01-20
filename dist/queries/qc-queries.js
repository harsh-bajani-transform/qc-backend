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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../database/db"));
// QC evaluation queries
const qcQueries = {
    // Get all QC files with access control for designations 1-5
    getQCFilesForEvaluation: () => __awaiter(void 0, void 0, void 0, function* () {
        const connection = yield (0, db_1.default)();
        try {
            const [result] = yield connection.execute(`SELECT 
          qp.id as qc_id,
          qp.file_name,
          qp.project_id,
          qp.task_id,
          qp.tracker_id,
          qp.total_records_processed,
          qp.duplicates_found,
          qp.duplicates_removed,
          qp.unique_records,
          qp.processing_status,
          qp.qc_score,
          qp.qc_agent_id,
          qp.qc_notes,
          qp.important_columns,
          qp.created_at,
          qp.updated_at,
          p.project_name,
          p.project_description,
          t.task_name,
          t.task_description,
          u.user_name as processed_by,
          u.user_id,
          u.designation_id as processor_designation_id,
          u.role_id as processor_role_id,
          ud.designation as processor_designation,
          agent.user_name as qc_agent_name,
          agent_designation.designation as qc_agent_designation
        FROM qc_performance qp
        LEFT JOIN project p ON qp.project_id = p.project_id
        LEFT JOIN task t ON qp.task_id = t.task_id
        LEFT JOIN tfs_user u ON qp.user_id = u.user_id
        LEFT JOIN user_designation ud ON u.designation_id = ud.designation_id
        LEFT JOIN tfs_user agent ON qp.qc_agent_id = agent.user_id
        LEFT JOIN user_designation agent_designation ON agent.designation_id = agent_designation.designation_id
        WHERE qp.processing_status = 'completed'
        AND u.designation_id >= 1 AND u.designation_id <= 5  -- Only show files from accessible designations
        ORDER BY qp.created_at DESC`, []);
            return result;
        }
        finally {
            yield connection.end();
        }
    }),
    // Get specific QC file details with access control for designations 1-5
    getQCFileDetails: (qcId) => __awaiter(void 0, void 0, void 0, function* () {
        const connection = yield (0, db_1.default)();
        try {
            const [result] = yield connection.execute(`SELECT 
          qp.id as qc_id,
          qp.file_name,
          qp.project_id,
          qp.task_id,
          qp.tracker_id,
          qp.total_records_processed,
          qp.duplicates_found,
          qp.duplicates_removed,
          qp.unique_records,
          qp.processing_status,
          qp.qc_score,
          qp.qc_agent_id,
          qp.qc_notes,
          qp.important_columns,
          qp.created_at,
          qp.updated_at,
          p.project_name,
          p.project_description,
          t.task_name,
          t.task_description,
          u.user_name as processed_by,
          u.user_id,
          u.designation_id as processor_designation_id,
          u.role_id as processor_role_id,
          ud.designation as processor_designation,
          agent.user_name as qc_agent_name,
          agent_designation.designation as qc_agent_designation
        FROM qc_performance qp
        LEFT JOIN project p ON qp.project_id = p.project_id
        LEFT JOIN task t ON qp.task_id = t.task_id
        LEFT JOIN tfs_user u ON qp.user_id = u.user_id
        LEFT JOIN user_designation ud ON u.designation_id = ud.designation_id
        LEFT JOIN tfs_user agent ON qp.qc_agent_id = agent.user_id
        LEFT JOIN user_designation agent_designation ON agent.designation_id = agent_designation.designation_id
        WHERE qp.id = ? 
        AND qp.processing_status = 'completed'
        AND u.designation_id >= 1 AND u.designation_id <= 5  -- Only show files from accessible designations
        LIMIT 1`, [qcId]);
            return result;
        }
        finally {
            yield connection.end();
        }
    }),
    // Get record statistics for a file
    getRecordStatistics: (projectId, userId) => __awaiter(void 0, void 0, void 0, function* () {
        const connection = yield (0, db_1.default)();
        try {
            const [result] = yield connection.execute(`SELECT 
          COUNT(*) as total_records,
          COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_records,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_records,
          MIN(created_at) as first_record_date,
          MAX(created_at) as last_record_date
        FROM tracker_records 
        WHERE project_id = ? 
        AND user_id = ?`, [projectId, userId]);
            return result[0] || {
                total_records: 0,
                ready_records: 0,
                failed_records: 0,
                first_record_date: null,
                last_record_date: null
            };
        }
        finally {
            yield connection.end();
        }
    })
};
exports.default = qcQueries;
