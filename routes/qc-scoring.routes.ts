import { Router } from 'express';
import {
  submitCategoryBasedEvaluation,
  getEvaluationResults
} from '../controllers/qc-scoring.controller';

const router = Router();

// Submit category-based QC evaluation
router.post('/evaluation/submit', submitCategoryBasedEvaluation);

// Get evaluation results for a specific QC performance
router.get('/evaluation/results/:qc_performance_id', getEvaluationResults);

export default router;
