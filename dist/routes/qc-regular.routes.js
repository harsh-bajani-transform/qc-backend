"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const qc_regular_controller_1 = require("../controllers/qc-regular.controller");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});
router.post("/qc-regular/save", qc_regular_controller_1.saveRegularQC);
router.get("/qc-regular/list", qc_regular_controller_1.getRegularQCRecords);
exports.default = router;
