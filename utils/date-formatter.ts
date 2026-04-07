/**
 * Utility functions for formatting dates consistently across the API
 */

/**
 * Formats a MySQL date/datetime value to a consistent string format
 * @param dateValue - The date value from MySQL (could be Date object, string, or null)
 * @returns Formatted date string in 'YYYY-MM-DD HH:mm:ss' format, or null if input is null/undefined
 */
export const formatDateForAPI = (dateValue: any): string | null => {
  if (!dateValue) return null;
  
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return null;
  
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * Formats a MySQL date value to date-only string
 * @param dateValue - The date value from MySQL
 * @returns Formatted date string in 'YYYY-MM-DD' format, or null if input is null/undefined
 */
export const formatDateOnly = (dateValue: any): string | null => {
  if (!dateValue) return null;
  
  const date = new Date(dateValue);
  if (isNaN(date.getTime())) return null;
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Processes an array of database rows and formats all date fields
 * @param rows - Array of database rows
 * @param dateFields - Array of field names that should be formatted as dates
 * @returns Processed rows with formatted dates
 */
export const formatDatesInRows = (rows: any[], dateFields: string[]): any[] => {
  return rows.map(row => {
    const formattedRow = { ...row };
    dateFields.forEach(field => {
      if (field in formattedRow) {
        formattedRow[field] = formatDateForAPI(formattedRow[field]);
      }
    });
    return formattedRow;
  });
};
