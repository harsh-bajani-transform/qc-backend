import get_db_connection from '../database/db';

export class DatabaseHelper {
  static async describeTable(tableName: string): Promise<any[]> {
    const connection = await get_db_connection();
    try {
      const [result] = await connection.execute(`DESCRIBE ${tableName}`);
      return result as any[];
    } finally {
      await connection.end();
    }
  }

  static async getTableData(tableName: string, limit: number = 10): Promise<any[]> {
    const connection = await get_db_connection();
    try {
      const [result] = await connection.execute(`SELECT * FROM ${tableName} LIMIT ?`, [limit]);
      return result as any[];
    } finally {
      await connection.end();
    }
  }

  static async executeQuery(query: string, params: any[] = []): Promise<any[]> {
    const connection = await get_db_connection();
    try {
      const [result] = await connection.execute(query, params);
      return result as any[];
    } finally {
      await connection.end();
    }
  }
}
