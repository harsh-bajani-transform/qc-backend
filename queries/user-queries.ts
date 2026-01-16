import get_db_connection from '../database/db';

// User-related query interfaces
interface UserWithDesignation {
  user_id: number;
  user_name: string;
  designation_id: number;
  designation_name: string;
  role_id?: number; // Optional field from tfs_user
}

interface Designation {
  designation_id: number;
  designation: string;
}

// User-related queries
const userQueries = {
  // Get user with designation for QC access check
  getUserWithDesignation: async (userId: number): Promise<UserWithDesignation | null> => {
    const connection = await get_db_connection();
    try {
      const [result] = await connection.execute(
        'SELECT u.user_id, u.user_name, u.designation_id, ud.designation as designation_name FROM tfs_user u LEFT JOIN user_designation ud ON u.designation_id = ud.designation_id WHERE u.user_id = ?',
        [userId]
      ) as [any[], any];
      
      return result[0] || null;
    } finally {
      await connection.end();
    }
  },

  // Get all designations for access control
  getAllDesignations: async (): Promise<Designation[]> => {
    const connection = await get_db_connection();
    try {
      const [result] = await connection.execute(
        'SELECT designation_id, designation FROM user_designation ORDER BY designation_id'
      ) as [any[], any];
      
      return result as Designation[];
    } finally {
      await connection.end();
    }
  }
};

export default userQueries;
