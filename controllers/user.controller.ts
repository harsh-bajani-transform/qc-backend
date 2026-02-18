import { Request, Response } from 'express';
import get_db_connection from '../database/db';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const connection = await get_db_connection();
    
    const [rows] = await connection.execute('SELECT * FROM tfs_user');
    
    await connection.end();
    
    res.status(200).json({
      success: true,
      message: 'Users fetched successfully',
      data: rows
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
