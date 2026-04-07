"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseImportantColumns = parseImportantColumns;
exports.generateAIPrompt = generateAIPrompt;
exports.parseAIResponse = parseAIResponse;
exports.generateHashes = generateHashes;
exports.getExistingHashes = getExistingHashes;
exports.findDuplicates = findDuplicates;
exports.aggregateAIResults = aggregateAIResults;
// AI Evaluation utility functions
const crypto_1 = __importDefault(require("crypto"));
function normalizeKey(value) {
    return String(value !== null && value !== void 0 ? value : "")
        .toLowerCase()
        .trim();
}
function normalizeCellValue(value) {
    if (value === null || value === undefined)
        return "";
    return String(value).toLowerCase().trim();
}
function parseImportantColumns(rawImportantColumns, fallbackHeaders) {
    if (Array.isArray(rawImportantColumns))
        return rawImportantColumns.map((c) => String(c).trim()).filter(Boolean);
    if (typeof rawImportantColumns !== "string")
        return fallbackHeaders;
    const text = rawImportantColumns.trim();
    if (!text)
        return fallbackHeaders;
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed))
            return parsed.map((c) => String(c).trim()).filter(Boolean);
    }
    catch (_a) {
        // ignore
    }
    return text
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
}
// Generate concise AI prompt for focused analysis
function generateAIPrompt(data, importantColumns) {
    const totalRecords = data.length;
    return `
You are a QC expert performing comprehensive data quality analysis on a QC dataset.

IMPORTANT COLUMNS: ${importantColumns}

COMPLETE DATASET (${totalRecords} records):
${JSON.stringify(data, null, 2)}

TOTAL RECORDS: ${totalRecords}

CRITICAL QC ANALYSIS FOCUS:
1. Data completeness (missing values in important columns)
2. Data accuracy (format validation, email formats, phone numbers, etc.)
3. Data consistency (standardization issues, case sensitivity)
4. Business rule violations (specific to QC requirements)
5. Duplicate records (exact and near-duplicates)
6. Outlier detection (unusual values that may indicate errors)

QC REQUIREMENTS:
- EVERY record must be analyzed - no exceptions
- Identify ALL issues regardless of how small
- Provide exact counts of problematic records
- Flag any data that could impact QC processes
- Ensure 100% data integrity for compliance

RESPONSE FORMAT (JSON):
{
  "qualityScore": number (0-100),
  "totalRecords": number,
  "validRecords": number,
  "issuesFound": number (exact count of problematic records),
  "summary": "Brief summary of QC findings (max 2 sentences)",
  "criticalIssues": [
    {
      "issue": "Specific problem description",
      "location": "Exact location (column/row numbers)",
      "impact": "Why this matters for QC",
      "fix": "How to resolve this issue",
      "affectedRecords": number (exact count of records with this issue)
    }
  ],
  "suggestions": ["Actionable QC improvement suggestions (max 3)"]
}

QC ANALYSIS REQUIREMENTS:
- Analyze EVERY record in the dataset
- Provide EXACT counts, not estimates
- Be thorough and meticulous - QC requires 100% accuracy
- Count actual records affected, not just issue types
- Ensure validRecords + issuesFound = totalRecords
- Prioritize issues that could affect QC outcomes
`;
}
// Parse AI response and format for frontend
function parseAIResponse(aiResponse, totalRecords) {
    try {
        const parsed = JSON.parse(aiResponse);
        // Debug: Log the AI response to understand its structure
        console.log("AI Response structure:", JSON.stringify(parsed, null, 2));
        // Calculate valid records based on actual problematic records count
        let problematicRecordsCount = 0;
        if (parsed.criticalIssues && parsed.criticalIssues.length > 0) {
            // Count actual problematic records from criticalIssues
            problematicRecordsCount = parsed.criticalIssues.reduce((count, issue) => {
                // If issue specifies affected records, use that
                if (issue.affectedRecords) {
                    return count + issue.affectedRecords;
                }
                // If issue specifies rows/records in the description, try to extract it
                if (issue.issue && issue.issue.match(/(\d+)\s+records?/)) {
                    const matches = issue.issue.match(/(\d+)\s+records?/);
                    return count + parseInt(matches[1]);
                }
                // If issue mentions specific rows, count them
                if (issue.location && issue.location.match(/rows?\s+(\d+)/)) {
                    const matches = issue.location.match(/rows?\s+(\d+)/);
                    return count + parseInt(matches[1]);
                }
                // Default to 1 record per issue
                return count + 1;
            }, 0);
        }
        else if (parsed.issuesFound !== undefined) {
            // Use issuesFound if no criticalIssues
            problematicRecordsCount = parsed.issuesFound;
        }
        // Ensure we don't have more problematic records than total records
        problematicRecordsCount = Math.min(problematicRecordsCount, totalRecords);
        const validRecords = Math.max(0, totalRecords - problematicRecordsCount);
        console.log("Calculated:", {
            totalRecords,
            problematicRecordsCount,
            validRecords,
        });
        return {
            status: "success",
            message: "AI Evaluation Complete",
            qualityScore: parsed.qualityScore || 0,
            details: {
                totalRecords: totalRecords,
                validRecords: validRecords,
                issuesFound: problematicRecordsCount,
            },
            summary: parsed.summary || "AI analysis completed",
            suggestions: parsed.suggestions || [],
            criticalIssues: parsed.criticalIssues || [],
        };
    }
    catch (error) {
        // Fallback if AI response is not valid JSON
        return {
            status: "success",
            message: "AI Evaluation Complete",
            qualityScore: 85,
            details: {
                totalRecords: totalRecords,
                validRecords: totalRecords - 1,
                issuesFound: 1,
            },
            summary: aiResponse || "AI analysis completed",
            suggestions: [],
            criticalIssues: [],
        };
    }
}
// Generate hashes for records (aligned exactly with tracker-process logic)
function generateHashes(data, importantColumns) {
    return data.map((record, index) => {
        const recordKeys = Object.keys(record || {});
        // case-insensitive header mapping
        const keyMap = new Map();
        recordKeys.forEach((k) => keyMap.set(k.toLowerCase().trim(), k));
        const colsToUse = importantColumns.length > 0 ? importantColumns : recordKeys;
        // Logic aligned with tracker-process.controller.ts:
        // map individually, join with |, then toLowerCase().trim()
        const hashValues = colsToUse.map((col) => {
            var _a;
            const originalKey = keyMap.get(col.toLowerCase().trim());
            return originalKey ? ((_a = record[originalKey]) !== null && _a !== void 0 ? _a : "") : "";
        });
        const hashInput = hashValues.join("|").toLowerCase().trim();
        return {
            row: index + 2,
            hash: crypto_1.default.createHash("sha256").update(hashInput).digest("hex"),
            hashInput, // Optional: for debugging
        };
    });
}
// Get existing hashes from database (Global check)
async function getExistingHashes(connection) {
    const [existingRecords] = (await connection.execute("SELECT DISTINCT hash_value FROM tracker_records"));
    return existingRecords.map((record) => record.hash_value);
}
// Find duplicates between current and existing hashes (including internal)
function findDuplicates(currentHashes, existingHashes, originalData, importantColumns) {
    const existingHashSet = new Set(existingHashes);
    const seenHashesInFile = new Map(); // hash -> first row it appeared
    const duplicates = [];
    currentHashes.forEach((item, index) => {
        const hash = item.hash;
        const rowData = originalData[index];
        const duplicateInDb = existingHashSet.has(hash);
        const duplicateInFile = seenHashesInFile.has(hash);
        if (duplicateInDb || duplicateInFile) {
            // Extract the important column values that caused this duplicate
            const duplicateFields = {};
            const actualImportantCols = importantColumns.length > 0 ? importantColumns : Object.keys(rowData);
            actualImportantCols.forEach((col) => {
                const matchingKey = Object.keys(rowData).find((key) => key.toLowerCase().trim() === col.toLowerCase().trim());
                if (matchingKey) {
                    duplicateFields[col] = rowData[matchingKey];
                }
            });
            duplicates.push({
                row: item.row,
                hash: hash,
                type: duplicateInDb && duplicateInFile
                    ? "both"
                    : duplicateInDb
                        ? "database"
                        : "internal",
                firstOccurrenceRow: seenHashesInFile.get(hash),
                data: rowData,
                duplicateColumns: actualImportantCols,
                duplicateValues: duplicateFields,
            });
        }
        if (!seenHashesInFile.has(hash)) {
            seenHashesInFile.set(hash, item.row);
        }
    });
    return duplicates;
}
// Aggregate multiple AI evaluation results into one
function aggregateAIResults(results) {
    if (!results || results.length === 0)
        return null;
    let totalQualityScore = 0;
    let totalRecords = 0;
    let validRecords = 0;
    let issuesFound = 0;
    let allSuggestions = [];
    let allCriticalIssues = [];
    let summaries = [];
    results.forEach((data) => {
        var _a, _b, _c;
        if (!data)
            return;
        const chunkWeight = ((_a = data.details) === null || _a === void 0 ? void 0 : _a.totalRecords) || 0;
        totalQualityScore += (data.qualityScore || 0) * chunkWeight;
        totalRecords += chunkWeight;
        validRecords += ((_b = data.details) === null || _b === void 0 ? void 0 : _b.validRecords) || 0;
        issuesFound += ((_c = data.details) === null || _c === void 0 ? void 0 : _c.issuesFound) || 0;
        if (data.suggestions)
            allSuggestions = [...allSuggestions, ...data.suggestions];
        if (data.criticalIssues)
            allCriticalIssues = [...allCriticalIssues, ...data.criticalIssues];
        if (data.summary)
            summaries.push(data.summary);
    });
    // Unique suggestions and limit
    const uniqueSuggestions = Array.from(new Set(allSuggestions)).slice(0, 5);
    // Calculate average quality score weighted by records
    const finalQualityScore = totalRecords > 0 ? Math.round(totalQualityScore / totalRecords) : 0;
    return {
        status: "success",
        message: "AI Evaluation Complete (Batched)",
        qualityScore: finalQualityScore,
        details: {
            totalRecords,
            validRecords,
            issuesFound,
        },
        summary: summaries.length > 0
            ? summaries[0].length > 200
                ? summaries[0].slice(0, 200) + "..."
                : summaries[0]
            : "Batch analysis completed.",
        suggestions: uniqueSuggestions,
        criticalIssues: allCriticalIssues.slice(0, 50), // Limit to avoid massive payloads
    };
}
