"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkDuplicates = exports.evaluateExcelFile = void 0;
const db_1 = __importDefault(require("../database/db"));
const user_queries_1 = __importDefault(require("../queries/user-queries"));
const ai_1 = __importDefault(require("../config/ai"));
const ai_evaluation_utils_1 = require("../utils/ai-evaluation-utils");
const multer_1 = __importDefault(require("multer"));
const xlsx_1 = __importDefault(require("xlsx"));
// Configure multer for file upload
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error("Only Excel files are allowed"));
        }
    },
});
// AI evaluation of Excel file
const evaluateExcelFile = async (req, res) => {
    try {
        // Use multer middleware to handle file upload
        upload.single("file")(req, res, async (err) => {
            var _a;
            if (err) {
                return res.status(400).json({
                    success: false,
                    message: err.message,
                });
            }
            const file = req.file;
            const { user_id, project_id, task_id, gemini_api_key } = req.body;
            const userId = Number(user_id);
            const projectId = Number(project_id);
            const taskId = Number(task_id);
            const userApiKey = gemini_api_key
                ? String(gemini_api_key).trim()
                : undefined;
            if (!file) {
                return res.status(400).json({
                    success: false,
                    message: "No file uploaded",
                });
            }
            if (!userId || !projectId || !taskId) {
                return res.status(400).json({
                    success: false,
                    message: "user_id, project_id, and task_id are required",
                });
            }
            const connection = await (0, db_1.default)();
            try {
                // Verify user is QC agent or higher
                const user = await user_queries_1.default.getUserWithDesignation(userId);
                if (!user || user.designation_id < 1) {
                    return res.status(403).json({
                        success: false,
                        message: "Access denied. Only agents can perform AI evaluation.",
                    });
                }
                // Parse Excel file
                let workbook;
                try {
                    workbook = xlsx_1.default.read(file.buffer, { type: "buffer" });
                }
                catch (error) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid Excel file format",
                    });
                }
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = xlsx_1.default.utils.sheet_to_json(worksheet);
                if (jsonData.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Excel file is empty",
                    });
                }
                // Get task details for important columns
                const [taskDetails] = (await connection.execute("SELECT important_columns FROM task WHERE task_id = ? AND project_id = ?", [taskId, projectId]));
                const importantColumns = ((_a = taskDetails[0]) === null || _a === void 0 ? void 0 : _a.important_columns) || "";
                // --- BATCH PROCESSING ---
                const BATCH_SIZE = 50;
                const totalRecords = jsonData.length;
                const batches = [];
                for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
                    batches.push(jsonData.slice(i, i + BATCH_SIZE));
                }
                console.log(`Processing ${totalRecords} records in ${batches.length} batches...`);
                // Process all batches in parallel
                const batchPromises = batches.map(async (batch, index) => {
                    const aiPrompt = (0, ai_evaluation_utils_1.generateAIPrompt)(batch, importantColumns);
                    const aiResponse = await ai_1.default.evaluateData(aiPrompt, userApiKey);
                    return (0, ai_evaluation_utils_1.parseAIResponse)(aiResponse, batch.length);
                });
                const batchResults = await Promise.all(batchPromises);
                // Aggregate results
                const aggregatedResult = (0, ai_evaluation_utils_1.aggregateAIResults)(batchResults);
                res.status(200).json({
                    success: (aggregatedResult === null || aggregatedResult === void 0 ? void 0 : aggregatedResult.status) === "success" || true,
                    message: (aggregatedResult === null || aggregatedResult === void 0 ? void 0 : aggregatedResult.message) || "AI evaluation completed successfully",
                    data: aggregatedResult,
                });
            }
            finally {
                await connection.end();
            }
        });
    }
    catch (error) {
        console.error("AI evaluation error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error during AI evaluation",
        });
    }
};
exports.evaluateExcelFile = evaluateExcelFile;
// Check for duplicates
const checkDuplicates = async (req, res) => {
    try {
        upload.single("file")(req, res, async (err) => {
            if (err) {
                return res.status(400).json({
                    success: false,
                    message: err.message,
                });
            }
            const file = req.file;
            const { user_id, project_id, task_id } = req.body;
            const userId = Number(user_id);
            const projectId = Number(project_id);
            const taskId = Number(task_id);
            if (!file) {
                return res.status(400).json({
                    success: false,
                    message: "No file uploaded",
                });
            }
            if (!userId || !projectId || !taskId) {
                return res.status(400).json({
                    success: false,
                    message: "user_id, project_id, and task_id are required",
                });
            }
            const connection = await (0, db_1.default)();
            try {
                // Verify user is QC agent or higher
                const user = await user_queries_1.default.getUserWithDesignation(userId);
                if (!user || user.designation_id < 1) {
                    return res.status(403).json({
                        success: false,
                        message: "Access denied. Only agents can perform duplicate check.",
                    });
                }
                // Get task details to understand important columns
                const [taskDetails] = (await connection.execute("SELECT important_columns FROM task WHERE task_id = ? AND project_id = ?", [taskId, projectId]));
                if (taskDetails.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "Task not found",
                    });
                }
                // Parse Excel file
                let workbook;
                try {
                    workbook = xlsx_1.default.read(file.buffer, { type: "buffer" });
                }
                catch (error) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid Excel file format",
                    });
                }
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = xlsx_1.default.utils.sheet_to_json(worksheet);
                if (jsonData.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Excel file is empty",
                    });
                }
                const fallbackHeaders = jsonData[0] && typeof jsonData[0] === "object"
                    ? Object.keys(jsonData[0])
                    : [];
                const importantColumns = (0, ai_evaluation_utils_1.parseImportantColumns)(taskDetails[0].important_columns, fallbackHeaders);
                // Generate hashes for current file records
                const currentHashes = (0, ai_evaluation_utils_1.generateHashes)(jsonData, importantColumns);
                // DEBUG: Log sample of generated hashes
                if (currentHashes.length > 0) {
                    console.log(`[Duplicate Check] Sample Hash Input: "${currentHashes[0].hashInput}" -> Hash: ${currentHashes[0].hash}`);
                }
                // Get existing hashes from tracker_records table (Global Check)
                const existingHashes = await (0, ai_evaluation_utils_1.getExistingHashes)(connection);
                console.log(`[Duplicate Check] Found ${existingHashes.length} existing hashes in DB (Global Check)`);
                if (existingHashes.length > 0) {
                    console.log(`[Duplicate Check] Sample DB Hash: ${existingHashes[0]}`);
                }
                // Find duplicates
                const duplicates = (0, ai_evaluation_utils_1.findDuplicates)(currentHashes, existingHashes, jsonData, importantColumns);
                res.status(200).json({
                    success: true,
                    message: "Duplicate check completed",
                    data: {
                        hasDuplicates: duplicates.length > 0,
                        duplicateCount: duplicates.length,
                        duplicates: duplicates.slice(0, 10), // Return first 10 duplicates
                        totalRecords: jsonData.length,
                        uniqueRecords: jsonData.length - duplicates.length,
                    },
                });
            }
            finally {
                await connection.end();
            }
        });
    }
    catch (error) {
        console.error("Duplicate check error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error during duplicate check",
        });
    }
};
exports.checkDuplicates = checkDuplicates;
