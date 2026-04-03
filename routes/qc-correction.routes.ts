import { Router } from "express";
import multer from "multer";
import {
  saveCorrectionQC,
  getCorrectionQCRecords,
} from "../controllers/qc-correction.controller";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

router.post("/qc-correction/save", saveCorrectionQC);
router.get("/qc-correction/list", getCorrectionQCRecords);

export default router;
