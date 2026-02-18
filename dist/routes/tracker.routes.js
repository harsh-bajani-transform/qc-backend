"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tracker_view_controller_1 = require("../controllers/tracker-view.controller");
const tracker_process_controller_1 = require("../controllers/tracker-process.controller");
const router = (0, express_1.Router)();
// Endpoint for fetching and viewing tracker data (read-only)
router.get('/tracker/view', tracker_view_controller_1.getTrackerData);
// Endpoint for processing Excel files and storing data in database
router.post('/tracker/process-excel', tracker_process_controller_1.processExcelFiles);
exports.default = router;
