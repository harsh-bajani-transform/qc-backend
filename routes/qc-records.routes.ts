import { Router } from "express";
import {
  generateTenPercentSample,
  saveQCRecord,
  getQCRecords,
  getQCRecordById,
  updateQCRecord,
  deleteQCRecord,
} from "../controllers/qc-records.controller";

const router = Router();

router.post("/qc-records/generate-sample", generateTenPercentSample);
router.post("/qc-records/save", saveQCRecord);
router.get("/qc-records/list", getQCRecords);
router.get("/qc-records/view/:id", getQCRecordById);
router.put("/qc-records/update/:id", updateQCRecord);
router.delete("/qc-records/delete/:id", deleteQCRecord);

export default router;
