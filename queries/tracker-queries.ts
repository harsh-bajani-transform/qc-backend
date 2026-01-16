import get_db_connection from '../database/db';

// Tracker record query interfaces
interface TrackerRecord {
  id: number;
  record_data: string;
  hash_value: string;
  created_at: Date;
  processed_by: string;
  processor_designation_id: number;
}

// Tracker record queries
const trackerQueries = {
  // Get tracker records for QC evaluation with access control
  getTrackerRecordsForEvaluation: async (projectId: number, userDesignationId: number): Promise<TrackerRecord[]> => {
    const connection = await get_db_connection();
    try {
      const [result] = await connection.execute(
        `SELECT tr.id, tr.record_data, tr.hash_value, tr.created_at, u.user_name as processed_by, u.designation_id as processor_designation_id
         FROM tracker_records tr
         LEFT JOIN tfs_user u ON tr.user_id = u.user_id
         WHERE tr.project_id = ? 
         AND u.designation_id < ?  -- Only show records from users with lower designations
         ORDER BY tr.created_at DESC`,
        [projectId, userDesignationId]
      ) as [any[], any];
      
      return result as TrackerRecord[];
    } finally {
      await connection.end();
    }
  }
};

export default trackerQueries;
