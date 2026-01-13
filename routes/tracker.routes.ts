import { Router } from 'express';
import { getTrackerData } from '../controllers/tracker-view.controller';
import { processExcelFiles } from '../controllers/tracker-process.controller';

const router = Router();

// Endpoint for fetching and viewing tracker data (read-only)
router.get('/tracker/view', getTrackerData);

// Endpoint for processing Excel files and storing data in database
router.post('/tracker/process-excel', processExcelFiles);

export default router;
