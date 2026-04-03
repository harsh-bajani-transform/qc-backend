"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const qc_rework_controller_1 = require("../controllers/qc-rework.controller");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});
router.post("/qc-rework/save", qc_rework_controller_1.saveReworkQC);
router.post("/qc-rework/save-regular", qc_rework_controller_1.saveReworkRegularQC);
router.get("/qc-rework/list", qc_rework_controller_1.getReworkQCRecords);
exports.default = router;
