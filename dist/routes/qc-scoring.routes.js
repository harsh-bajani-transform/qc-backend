"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const qc_scoring_controller_1 = require("../controllers/qc-scoring.controller");
const router = (0, express_1.Router)();
// Submit category-based QC evaluation
router.post('/evaluation/submit', qc_scoring_controller_1.submitCategoryBasedEvaluation);
// Get evaluation results for a specific QC performance
router.get('/evaluation/results/:qc_performance_id', qc_scoring_controller_1.getEvaluationResults);
exports.default = router;
