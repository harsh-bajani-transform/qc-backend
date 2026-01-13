import { Router } from 'express';
import {
  getQCPerformanceByUser,
  getQCPerformanceByProject,
  getQCPerformanceByTask,
  updateQCPerformance,
  getQCSummary,
  getAllQCPerformance
} from '../controllers/qc-performance.controller';

const router = Router();

// Get QC performance by user
router.get('/qc-performance/user/:user_id', getQCPerformanceByUser);

// Get QC performance by project
router.get('/qc-performance/project/:project_id', getQCPerformanceByProject);

// Get QC performance by task
router.get('/qc-performance/task/:task_id', getQCPerformanceByTask);

// Get all QC performance records with pagination and filters
router.get('/qc-performance', getAllQCPerformance);

// Get QC performance summary statistics
router.get('/qc-performance/summary', getQCSummary);

// Update QC performance record (for QC agents)
router.put('/qc-performance/:id', updateQCPerformance);

export default router;
