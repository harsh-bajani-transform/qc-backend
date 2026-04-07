"use strict";
/**
 * Utility functions for formatting dates consistently across the API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDatesInRows = exports.formatDateOnly = exports.formatDateForAPI = void 0;
/**
 * Formats a MySQL date/datetime value to a consistent string format
 * @param dateValue - The date value from MySQL (could be Date object, string, or null)
 * @returns Formatted date string in 'YYYY-MM-DD HH:mm:ss' format, or null if input is null/undefined
 */
const formatDateForAPI = (dateValue) => {
    if (!dateValue)
        return null;
    const date = new Date(dateValue);
    if (isNaN(date.getTime()))
        return null;
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};
exports.formatDateForAPI = formatDateForAPI;
/**
 * Formats a MySQL date value to date-only string
 * @param dateValue - The date value from MySQL
 * @returns Formatted date string in 'YYYY-MM-DD' format, or null if input is null/undefined
 */
const formatDateOnly = (dateValue) => {
    if (!dateValue)
        return null;
    const date = new Date(dateValue);
    if (isNaN(date.getTime()))
        return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
exports.formatDateOnly = formatDateOnly;
/**
 * Processes an array of database rows and formats all date fields
 * @param rows - Array of database rows
 * @param dateFields - Array of field names that should be formatted as dates
 * @returns Processed rows with formatted dates
 */
const formatDatesInRows = (rows, dateFields) => {
    return rows.map(row => {
        const formattedRow = Object.assign({}, row);
        dateFields.forEach(field => {
            if (field in formattedRow) {
                formattedRow[field] = (0, exports.formatDateForAPI)(formattedRow[field]);
            }
        });
        return formattedRow;
    });
};
exports.formatDatesInRows = formatDatesInRows;
