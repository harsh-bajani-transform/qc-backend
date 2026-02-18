import get_db_connection from '../database/db';

// QC evaluation query interfaces
interface QCFile {
  qc_id: number;
  file_name: string;
  project_id: number;
  task_id: number;
  tracker_id: number;
  total_records_processed: number;
  duplicates_found: number;
  duplicates_removed: number;
  unique_records: number;
  processing_status: string;
  qc_score: number | null;
  qc_agent_id: number | null;
  qc_notes: string | null;
  important_columns: string | null;
  created_at: Date;
  updated_at: Date;
  project_name: string;
  project_description: string | null;
  task_name: string;
  task_description: string | null;
  processed_by: string;
  processor_designation_id: number;
  processor_designation: string;
  processor_role_id: number;
  qc_agent_name: string | null;
  qc_agent_designation: string | null;
  user_id: number;
}

interface RecordStatistics {
  total_records: number;
  ready_records: number;
  failed_records: number;
  first_record_date: Date | null;
  last_record_date: Date | null;
}

// QC evaluation queries
const qcQueries = {
  // Get all QC files with access control for designations 1-5
  getQCFilesForEvaluation: async (): Promise<QCFile[]> => {
    const connection = await get_db_connection();
    try {
      const [result] = await connection.execute(
        `SELECT 
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
        ORDER BY qp.created_at DESC`,
        []
      ) as [any[], any];
      
      return result as QCFile[];
    } finally {
      await connection.end();
    }
  },

  // Get specific QC file details with access control for designations 1-5
  getQCFileDetails: async (qcId: number): Promise<QCFile[]> => {
    const connection = await get_db_connection();
    try {
      const [result] = await connection.execute(
        `SELECT 
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
        LIMIT 1`,
        [qcId]
      ) as [any[], any];
      
      return result as QCFile[];
    } finally {
      await connection.end();
    }
  },

  // Get record statistics for a file
  getRecordStatistics: async (projectId: number, userId: number): Promise<RecordStatistics> => {
    const connection = await get_db_connection();
    try {
      const [result] = await connection.execute(
        `SELECT 
          COUNT(*) as total_records,
          COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_records,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_records,
          MIN(created_at) as first_record_date,
          MAX(created_at) as last_record_date
        FROM tracker_records 
        WHERE project_id = ? 
        AND user_id = ?`,
        [projectId, userId]
      ) as [any[], any];
      
      return result[0] || {
        total_records: 0,
        ready_records: 0,
        failed_records: 0,
        first_record_date: null,
        last_record_date: null
      };
    } finally {
      await connection.end();
    }
  }
};

export default qcQueries;
