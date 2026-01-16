import { Router } from 'express';
import { getQCFilesForEvaluation, getQCFileDetails, getQCEvaluationData, submitQCEvaluation } from '../controllers/qc-evaluation.controller';

const router = Router();

// Get all files available for QC evaluation
router.post('/qc-evaluation/files', getQCFilesForEvaluation);

// Get specific file details for QC evaluation
router.post('/qc-evaluation/file-details', getQCFileDetails);

// Get QC evaluation data for a specific file/project
router.post('/qc-evaluation/evaluation-data', getQCEvaluationData);

// Submit QC evaluation results
router.post('/qc-evaluation/submit-evaluation', submitQCEvaluation);

export default router;
