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
exports.getTrackerData = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const exceljs_1 = __importDefault(require("exceljs"));
const env_1 = require("../config/env");
const db_1 = require("../database/db");
const path_resolver_1 = require("../utils/path-resolver");
const getTrackerData = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!env_1.PYTHON_URL) {
            return res.status(500).json({
                success: false,
                message: "Python backend URL not configured",
            });
        }
        // Fix the request body to match Python backend expectations
        const pythonRequestBody = Object.assign(Object.assign({}, req.body), { logged_in_user_id: req.body.user_id || req.body.logged_in_user_id });
        // Fetch data from Python backend
        const url = env_1.PYTHON_URL.endsWith("/")
            ? `${env_1.PYTHON_URL}tracker/view`
            : `${env_1.PYTHON_URL}/tracker/view`;
        const response = yield axios_1.default.post(url, pythonRequestBody);
        if (response.status !== 200) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch data from Python backend",
            });
        }
        const trackerData = response.data;
        const trackersWithFiles = trackerData.data.trackers.filter((tracker) => tracker.tracker_file);
        console.log(`Found ${trackersWithFiles.length} trackers with files`);
        // Get database connection to fetch task information
        const connection = yield (0, db_1.get_db_connection)();
        // Add task information (including important_columns) and agent_id to each tracker
        for (const tracker of trackersWithFiles) {
            // Map user_id to agent_id for QC form compatibility
            if (tracker.user_id && !tracker.agent_id) {
                tracker.agent_id = tracker.user_id;
            }
            try {
                const [taskRows] = (yield connection.execute("SELECT task_id, task_name, important_columns FROM task WHERE task_id = ?", [tracker.task_id]));
                if (taskRows.length > 0) {
                    const task = taskRows[0];
                    let importantColumns = [];
                    if (task.important_columns) {
                        try {
                            importantColumns = JSON.parse(task.important_columns);
                        }
                        catch (parseError) {
                            console.error(`Error parsing important_columns for task ${task.task_id}:`, parseError);
                            importantColumns = [];
                        }
                    }
                    tracker.task_info = {
                        task_id: task.task_id,
                        task_name: task.task_name,
                        important_columns: importantColumns,
                    };
                }
                else {
                    tracker.task_info = {
                        task_id: tracker.task_id,
                        task_name: "Unknown Task",
                        important_columns: [],
                    };
                }
            }
            catch (error) {
                console.error(`Error fetching task info for task ${tracker.task_id}:`, error);
                tracker.task_info = {
                    task_id: tracker.task_id,
                    task_name: "Error Loading Task",
                    important_columns: [],
                };
            }
        }
        yield connection.end();
        // Display basic file information (no hash generation)
        for (const tracker of trackersWithFiles) {
            const filePath = tracker.tracker_file;
            const resolvedFilePath = path_resolver_1.PathResolver.resolveFilePath(filePath);
            console.log(`\n=== Processing Tracker ID: ${tracker.tracker_id} ===`);
            console.log(`Task ID: ${tracker.task_id}`);
            console.log(`Task Name: ${tracker.task_info.task_name}`);
            console.log(`Important Columns: ${tracker.task_info.important_columns.join(", ")}`);
            console.log(`Original file path: ${filePath}`);
            console.log(`Resolved file path: ${resolvedFilePath}`);
            // Debug file path if not found
            if (!fs_1.default.existsSync(resolvedFilePath)) {
                path_resolver_1.PathResolver.debugFilePath(filePath);
            }
            try {
                if (fs_1.default.existsSync(resolvedFilePath)) {
                    const stats = fs_1.default.statSync(resolvedFilePath);
                    console.log(`File size: ${stats.size} bytes`);
                    const ext = path_1.default.extname(resolvedFilePath).toLowerCase();
                    if (ext === ".xlsx" || ext === ".xls") {
                        console.log("Excel file detected - showing basic info...");
                        try {
                            const workbook = new exceljs_1.default.Workbook();
                            yield workbook.xlsx.readFile(resolvedFilePath);
                            console.log(`Worksheets found: ${workbook.worksheets.length}`);
                            workbook.eachSheet((worksheet, sheetId) => {
                                console.log(`Sheet ${sheetId}: ${worksheet.name} (${worksheet.rowCount} rows × ${worksheet.columnCount} columns)`);
                            });
                        }
                        catch (excelError) {
                            console.log("Error reading Excel file:", excelError instanceof Error
                                ? excelError.message
                                : String(excelError));
                        }
                    }
                    else {
                        console.log(`File type ${ext} not supported - only Excel files are processed`);
                    }
                }
                else {
                    console.log("File does not exist at resolved path:", resolvedFilePath);
                }
            }
            catch (error) {
                console.log("Error reading file:", error instanceof Error ? error.message : String(error));
            }
        }
        res.status(200).json({
            success: true,
            message: "Tracker data fetched successfully",
            data: trackerData.data,
            processedFiles: trackersWithFiles.length,
        });
    }
    catch (error) {
        console.error("Error in getTrackerData:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching tracker data",
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
exports.getTrackerData = getTrackerData;
