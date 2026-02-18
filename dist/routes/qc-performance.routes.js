"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const qc_performance_controller_1 = require("../controllers/qc-performance.controller");
const router = (0, express_1.Router)();
// Get QC performance by user
router.get('/qc-performance/user/:user_id', qc_performance_controller_1.getQCPerformanceByUser);
// Get QC performance by project
router.get('/qc-performance/project/:project_id', qc_performance_controller_1.getQCPerformanceByProject);
// Get QC performance by task
router.get('/qc-performance/task/:task_id', qc_performance_controller_1.getQCPerformanceByTask);
// Get all QC performance records with pagination and filters
router.get('/qc-performance', qc_performance_controller_1.getAllQCPerformance);
// Get QC performance summary statistics
router.get('/qc-performance/summary', qc_performance_controller_1.getQCSummary);
// Update QC performance record (for QC agents)
router.put('/qc-performance/:id', qc_performance_controller_1.updateQCPerformance);
exports.default = router;
