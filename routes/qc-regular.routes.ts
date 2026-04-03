import { Router } from "express";
import multer from "multer";
import {
  saveRegularQC,
  getRegularQCRecords,
} from "../controllers/qc-regular.controller";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

router.post("/qc-regular/save", saveRegularQC);
router.get("/qc-regular/list", getRegularQCRecords);

export default router;
