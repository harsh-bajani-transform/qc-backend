"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const gemini_key_controller_1 = require("../controllers/gemini-key.controller");
const router = (0, express_1.Router)();
router.post("/gemini-key/save", gemini_key_controller_1.saveGeminiKey);
router.post("/gemini-key/get", gemini_key_controller_1.getGeminiKey);
router.post("/gemini-key/delete", gemini_key_controller_1.deleteGeminiKey);
exports.default = router;
