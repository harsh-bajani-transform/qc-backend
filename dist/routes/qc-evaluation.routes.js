"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const qc_evaluation_controller_1 = require("../controllers/qc-evaluation.controller");
const router = (0, express_1.Router)();
// Get all files available for QC evaluation
router.post('/qc-evaluation/files', qc_evaluation_controller_1.getQCFilesForEvaluation);
// Get specific file details for QC evaluation
router.post('/qc-evaluation/file-details', qc_evaluation_controller_1.getQCFileDetails);
// Get QC evaluation data for a specific file/project
router.post('/qc-evaluation/evaluation-data', qc_evaluation_controller_1.getQCEvaluationData);
// Submit QC evaluation results
router.post('/qc-evaluation/submit-evaluation', qc_evaluation_controller_1.submitQCEvaluation);
exports.default = router;
