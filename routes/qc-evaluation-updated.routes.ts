import { Router } from 'express';
import {
  getQCEvaluationDataWithAFD,
  submitAFDBasedEvaluation
} from '../controllers/qc-evaluation-updated.controller';

const router = Router();

// Get QC evaluation data with AFD criteria
router.post('/evaluation/data-afd', getQCEvaluationDataWithAFD);

// Submit AFD-based QC evaluation
router.post('/evaluation/submit-afd', submitAFDBasedEvaluation);

export default router;
