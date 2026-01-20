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
exports.getAllQCPerformance = exports.getQCSummary = exports.updateQCPerformance = exports.getQCPerformanceByTask = exports.getQCPerformanceByProject = exports.getQCPerformanceByUser = void 0;
const db_1 = __importDefault(require("../database/db"));
// Get QC performance records for a user
const getQCPerformanceByUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { user_id } = req.params;
        const connection = yield (0, db_1.default)();
        const [qcRecords] = yield connection.execute(`SELECT 
        id, user_id, project_id, task_id, tracker_id, file_name,
        total_records_processed, duplicates_found, duplicates_removed, unique_records,
        important_columns, processing_status, qc_score, qc_agent_id, qc_notes,
        created_at, updated_at
      FROM qc_performance 
      WHERE user_id = ? 
      ORDER BY created_at DESC`, [user_id]);
        yield connection.end();
        res.status(200).json({
            success: true,
            message: `QC performance records for user ${user_id}`,
            data: qcRecords
        });
    }
    catch (error) {
        console.error('Error fetching QC performance:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching QC performance records',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getQCPerformanceByUser = getQCPerformanceByUser;
// Get QC performance records for a project
const getQCPerformanceByProject = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { project_id } = req.params;
        const connection = yield (0, db_1.default)();
        const [qcRecords] = yield connection.execute(`SELECT 
        qc.id, qc.user_id, qc.project_id, qc.task_id, qc.tracker_id, qc.file_name,
        qc.total_records_processed, qc.duplicates_found, qc.duplicates_removed, qc.unique_records,
        qc.important_columns, qc.processing_status, qc.qc_score, qc.qc_agent_id, qc.qc_notes,
        qc.created_at, qc.updated_at,
        u.user_name as agent_name
      FROM qc_performance qc
      LEFT JOIN tfs_user u ON qc.user_id = u.user_id
      WHERE qc.project_id = ? 
      ORDER BY qc.created_at DESC`, [project_id]);
        yield connection.end();
        res.status(200).json({
            success: true,
            message: `QC performance records for project ${project_id}`,
            data: qcRecords
        });
    }
    catch (error) {
        console.error('Error fetching QC performance:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching QC performance records',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getQCPerformanceByProject = getQCPerformanceByProject;
// Get QC performance records for a specific task
const getQCPerformanceByTask = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { task_id } = req.params;
        const connection = yield (0, db_1.default)();
        const [qcRecords] = yield connection.execute(`SELECT 
        id, user_id, project_id, task_id, tracker_id, file_name,
        total_records_processed, duplicates_found, duplicates_removed, unique_records,
        important_columns, processing_status, qc_score, qc_agent_id, qc_notes,
        created_at, updated_at
      FROM qc_performance 
      WHERE task_id = ? 
      ORDER BY created_at DESC`, [task_id]);
        yield connection.end();
        res.status(200).json({
            success: true,
            message: `QC performance records for task ${task_id}`,
            data: qcRecords
        });
    }
    catch (error) {
        console.error('Error fetching QC performance:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching QC performance records',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getQCPerformanceByTask = getQCPerformanceByTask;
// Update QC score and notes for a record
const updateQCPerformance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { qc_score, qc_agent_id, qc_notes } = req.body;
        const connection = yield (0, db_1.default)();
        const [result] = yield connection.execute(`UPDATE qc_performance 
       SET qc_score = ?, qc_agent_id = ?, qc_notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [qc_score, qc_agent_id, qc_notes, id]);
        yield connection.end();
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'QC performance record not found'
            });
        }
        res.status(200).json({
            success: true,
            message: 'QC performance record updated successfully',
            data: {
                id,
                qc_score,
                qc_agent_id,
                qc_notes
            }
        });
    }
    catch (error) {
        console.error('Error updating QC performance:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating QC performance record',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.updateQCPerformance = updateQCPerformance;
// Get QC performance summary statistics
const getQCSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { user_id, project_id, date_from, date_to } = req.query;
        const connection = yield (0, db_1.default)();
        let whereClause = 'WHERE 1=1';
        const params = [];
        if (user_id) {
            whereClause += ' AND user_id = ?';
            params.push(user_id);
        }
        if (project_id) {
            whereClause += ' AND project_id = ?';
            params.push(project_id);
        }
        if (date_from) {
            whereClause += ' AND created_at >= ?';
            params.push(date_from);
        }
        if (date_to) {
            whereClause += ' AND created_at <= ?';
            params.push(date_to);
        }
        const [summary] = yield connection.execute(`SELECT 
        COUNT(*) as total_files_processed,
        SUM(total_records_processed) as total_records,
        SUM(duplicates_found) as total_duplicates_found,
        SUM(duplicates_removed) as total_duplicates_removed,
        SUM(unique_records) as total_unique_records,
        AVG(qc_score) as avg_qc_score,
        COUNT(CASE WHEN processing_status = 'completed' THEN 1 END) as completed_files,
        COUNT(CASE WHEN processing_status = 'failed' THEN 1 END) as failed_files
      FROM qc_performance ${whereClause}`, params);
        yield connection.end();
        res.status(200).json({
            success: true,
            message: 'QC performance summary',
            data: summary[0]
        });
    }
    catch (error) {
        console.error('Error fetching QC summary:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching QC summary',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getQCSummary = getQCSummary;
// Get all QC performance records (with pagination)
const getAllQCPerformance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page = 1, limit = 20, user_id, project_id, status } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const connection = yield (0, db_1.default)();
        let whereClause = 'WHERE 1=1';
        const params = [];
        if (user_id) {
            whereClause += ' AND qp.user_id = ?';
            params.push(user_id);
        }
        if (project_id) {
            whereClause += ' AND qp.project_id = ?';
            params.push(project_id);
        }
        if (status) {
            whereClause += ' AND qp.processing_status = ?';
            params.push(status);
        }
        const [qcRecords] = yield connection.execute(`SELECT 
        qp.id, qp.user_id, qp.project_id, qp.task_id, qp.tracker_id, qp.file_name,
        qp.total_records_processed, qp.duplicates_found, qp.duplicates_removed, qp.unique_records,
        qp.important_columns, qp.processing_status, qp.qc_score, qp.qc_agent_id, qp.qc_notes,
        qp.created_at, qp.updated_at,
        u.user_name as agent_name,
        t.task_name,
        p.project_name
      FROM qc_performance qp
      LEFT JOIN tfs_user u ON qp.user_id = u.user_id
      LEFT JOIN task t ON qp.task_id = t.task_id
      LEFT JOIN project p ON qp.project_id = p.project_id
      ${whereClause}
      ORDER BY qp.created_at DESC
      LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
        // Get total count for pagination
        const [countResult] = yield connection.execute(`SELECT COUNT(*) as total FROM qc_performance qp ${whereClause}`, params);
        yield connection.end();
        res.status(200).json({
            success: true,
            message: 'QC performance records retrieved successfully',
            data: {
                records: qcRecords,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: countResult[0].total,
                    pages: Math.ceil(countResult[0].total / Number(limit))
                }
            }
        });
    }
    catch (error) {
        console.error('Error fetching QC performance:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching QC performance records',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getAllQCPerformance = getAllQCPerformance;
