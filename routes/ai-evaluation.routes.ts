import { Router } from 'express';
import { 
  evaluateExcelFile, 
  checkDuplicates 
} from '../controllers/ai-evaluation.controller';

const router = Router();

// AI evaluation endpoint
router.post('/ai/evaluate', evaluateExcelFile);

// Duplicate check endpoint
router.post('/ai/duplicate-check', checkDuplicates);

export default router;
