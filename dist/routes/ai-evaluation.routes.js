"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ai_evaluation_controller_1 = require("../controllers/ai-evaluation.controller");
const router = (0, express_1.Router)();
// AI evaluation endpoint
router.post('/ai/evaluate', ai_evaluation_controller_1.evaluateExcelFile);
// Duplicate check endpoint
router.post('/ai/duplicate-check', ai_evaluation_controller_1.checkDuplicates);
exports.default = router;
