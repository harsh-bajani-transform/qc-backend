import { Router } from "express";
import multer from "multer";
import {
  saveReworkQC,
  saveReworkRegularQC,
  getReworkQCRecords,
} from "../controllers/qc-rework.controller";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

router.post("/qc-rework/save", saveReworkQC);
router.post("/qc-rework/save-regular", saveReworkRegularQC);
router.get("/qc-rework/list", getReworkQCRecords);

export default router;
