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
const getTrackerData = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!env_1.PYTHON_URL) {
            return res.status(500).json({
                success: false,
                message: 'Python backend URL not configured'
            });
        }
        // Fetch data from Python backend
        const url = `${env_1.PYTHON_URL}/tracker/view`.replace(/\/+/g, '/');
        const response = yield axios_1.default.post(url, req.body);
        if (response.status !== 200) {
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch data from Python backend'
            });
        }
        const trackerData = response.data;
        const trackersWithFiles = trackerData.data.trackers.filter((tracker) => tracker.tracker_file);
        console.log(`Found ${trackersWithFiles.length} trackers with files`);
        for (const tracker of trackersWithFiles) {
            const filePath = tracker.tracker_file;
            console.log(`\n=== Processing Tracker ID: ${tracker.tracker_id} ===`);
            console.log(`File path: ${filePath}`);
            try {
                if (fs_1.default.existsSync(filePath)) {
                    const stats = fs_1.default.statSync(filePath);
                    console.log(`File size: ${stats.size} bytes`);
                    const ext = path_1.default.extname(filePath).toLowerCase();
                    if (ext === '.xlsx' || ext === '.xls') {
                        console.log('Excel file detected - reading content...');
                        try {
                            const workbook = new exceljs_1.default.Workbook();
                            yield workbook.xlsx.readFile(filePath);
                            console.log(`Worksheets found: ${workbook.worksheets.length}`);
                            workbook.eachSheet((worksheet, sheetId) => {
                                console.log(`\n--- Sheet ${sheetId}: ${worksheet.name} ---`);
                                console.log(`Dimensions: ${worksheet.rowCount} rows × ${worksheet.columnCount} columns`);
                                // Read first 10 rows of data
                                const data = [];
                                worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                                    if (rowNumber <= 10) {
                                        const rowData = {};
                                        row.eachCell((cell, colNumber) => {
                                            rowData[`col_${colNumber}`] = cell.value;
                                        });
                                        data.push(rowData);
                                        console.log(`Row ${rowNumber}:`, rowData);
                                    }
                                });
                                if (worksheet.rowCount > 10) {
                                    console.log(`... and ${worksheet.rowCount - 10} more rows`);
                                }
                            });
                        }
                        catch (excelError) {
                            console.log('Error reading Excel file:', excelError instanceof Error ? excelError.message : String(excelError));
                        }
                    }
                    else {
                        console.log(`File type ${ext} not supported - only Excel files are processed`);
                    }
                }
                else {
                    console.log('File does not exist at path:', filePath);
                }
            }
            catch (error) {
                console.log('Error reading file:', error instanceof Error ? error.message : String(error));
            }
        }
        res.status(200).json({
            success: true,
            message: 'Tracker data fetched successfully',
            data: trackerData.data,
            processedFiles: trackersWithFiles.length
        });
    }
    catch (error) {
        console.error('Error in getTrackerData:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching tracker data',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getTrackerData = getTrackerData;
