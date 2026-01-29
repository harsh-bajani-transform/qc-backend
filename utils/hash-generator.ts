import ExcelJS from 'exceljs';
import crypto from 'crypto';
import { get_db_connection } from '../database/db';

interface TaskInfo {
  task_id: number;
  important_columns: string[];
}

interface HashResult {
  hash_value: string;
  record_data: any;
  important_columns: string[];
}

export class HashGenerator {
  /**
   * Get task information including important columns from database
   */
  static async getTaskInfo(taskId: number): Promise<TaskInfo | null> {
    let connection;
    try {
      connection = await get_db_connection();
      
      const [rows] = await connection.execute(
        'SELECT task_id, important_columns FROM task WHERE task_id = ?',
        [taskId]
      );
      
      const tasks = rows as any[];
      if (tasks.length === 0) {
        return null;
      }
      
      const task = tasks[0];
      let importantColumns: string[];
      try {
        importantColumns = JSON.parse(task.important_columns || '[]');
      } catch (parseError) {
        throw new Error(
          `Failed to parse important_columns JSON for task_id ${task.task_id}. ` +
          `Value: ${String(task.important_columns)}. Error: ${(parseError as Error).message}` 
        );
      }
      return {
        task_id: task.task_id,
        important_columns: importantColumns
      };
    } catch (error) {
      console.error('Error fetching task info:', error);
      throw error;
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }

  /**
   * Find column index in Excel worksheet based on column name
   */
  private static findColumnIndex(worksheet: ExcelJS.Worksheet, columnName: string): number {
    // Check header row (first row) for column name
    const headerRow = worksheet.getRow(1);
    
    for (let columnIndex = 1; columnIndex <= headerRow.cellCount; columnIndex++) {
      const cell = headerRow.getCell(columnIndex);
      const cellValue = String(cell.value || '').trim().toLowerCase();
      const targetColumn = String(columnName).trim().toLowerCase();
      
      if (cellValue === targetColumn) {
        return columnIndex;
      }
    }
    
    return -1; // Column not found
  }

  /**
   * Generate hash based on important columns from Excel file
   */
  static async generateHashFromExcel(filePath: string, importantColumns: string[]): Promise<HashResult[]> {
    const results: HashResult[] = [];
    
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      
      // Process first worksheet (or you can specify which sheet to use)
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('No worksheet found in the Excel file');
      }
      
      console.log(`Processing worksheet: ${worksheet.name}`);
      console.log(`Important columns: ${importantColumns.join(', ')}`);
      
      // Find column indices for important columns
      const columnIndices: { [key: string]: number } = {};
      for (const column of importantColumns) {
        const index = this.findColumnIndex(worksheet, column);
        if (index === -1) {
          console.warn(`Column "${column}" not found in worksheet`);
        } else {
          columnIndices[column] = index;
          console.log(`Found column "${column}" at index ${index}`);
        }
      }
      
      if (Object.keys(columnIndices).length === 0) {
        throw new Error('No important columns found in the Excel file');
      }
      
      // Process each data row (skip header row)
      let processedRows = 0;
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header row
        
        const recordData: any = {};
        const hashValues: string[] = [];
        
        // Extract values from important columns
        for (const [columnName, colIndex] of Object.entries(columnIndices)) {
          const cell = row.getCell(colIndex);
          const value = String(cell.value || '').trim();
          recordData[columnName] = value;
          hashValues.push(value);
        }
        
        // Generate hash from concatenated important column values
        const hashString = hashValues.join('|');
        const hash_value = this.generateStringHash(hashString);
        
        results.push({
          hash_value,
          record_data: recordData,
          important_columns: Object.keys(columnIndices)
        });
        
        processedRows++;
      });
      
      console.log(`Generated hash for ${processedRows} records`);
      
    } catch (error) {
      console.error('Error generating hash from Excel:', error);
      throw error;
    }
    
    return results;
  }

  /**
   * Generate cryptographic hash string using SHA-256
   */
  private static generateStringHash(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * Process tracker file and generate hashes based on task important columns
   */
  static async processTrackerFile(trackerId: number, taskId: number, filePath: string): Promise<HashResult[]> {
    try {
      console.log(`Processing tracker ${trackerId} for task ${taskId}`);
      
      // Get task information with important columns
      const taskInfo = await this.getTaskInfo(taskId);
      if (!taskInfo) {
        throw new Error(`Task ${taskId} not found`);
      }
      
      if (taskInfo.important_columns.length === 0) {
        throw new Error(`No important columns defined for task ${taskId}`);
      }
      
      // Generate hashes from Excel file
      const hashResults = await this.generateHashFromExcel(filePath, taskInfo.important_columns);
      
      console.log(`Generated ${hashResults.length} hashes for tracker ${trackerId}`);
      
      return hashResults;
      
    } catch (error) {
      console.error('Error processing tracker file:', error);
      throw error;
    }
  }
}

export default HashGenerator;
