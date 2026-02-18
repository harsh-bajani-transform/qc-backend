"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const qc_evaluation_updated_controller_1 = require("../controllers/qc-evaluation-updated.controller");
const router = (0, express_1.Router)();
// Get QC evaluation data with AFD criteria
router.post('/evaluation/data-afd', qc_evaluation_updated_controller_1.getQCEvaluationDataWithAFD);
// Submit AFD-based QC evaluation
router.post('/evaluation/submit-afd', qc_evaluation_updated_controller_1.submitAFDBasedEvaluation);
exports.default = router;
