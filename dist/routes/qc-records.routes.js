"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const qc_records_controller_1 = require("../controllers/qc-records.controller");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});
router.post("/qc-records/generate-sample", qc_records_controller_1.generateCustomSample);
router.get("/qc-records/download-sample/:tracker_id", qc_records_controller_1.downloadCustomSample);
router.post("/qc-records/save", qc_records_controller_1.saveQCRecord);
router.get("/qc-records/list", qc_records_controller_1.getQCRecords);
router.get("/qc-records/view/:id", qc_records_controller_1.getQCRecordById);
router.put("/qc-records/update/:id", qc_records_controller_1.updateQCRecord);
router.delete("/qc-records/delete/:id", qc_records_controller_1.deleteQCRecord);
router.post("/qc-records/agent-upload", upload.single("file"), qc_records_controller_1.agentUploadCorrection);
exports.default = router;
