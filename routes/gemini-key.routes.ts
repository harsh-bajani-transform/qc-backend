import { Router } from "express";
import {
  saveGeminiKey,
  getGeminiKey,
  deleteGeminiKey,
} from "../controllers/gemini-key.controller";

const router = Router();

router.post("/gemini-key/save", saveGeminiKey);
router.post("/gemini-key/get", getGeminiKey);
router.post("/gemini-key/delete", deleteGeminiKey);

export default router;
