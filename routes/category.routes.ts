import { Router } from 'express';
import {
  getProjectCategories,
  getCategoriesByProjectType,
  getAllCategoriesWithSubcategories
} from '../controllers/category.controller';

const router = Router();

// Get all project categories
router.get('/project-categories', getProjectCategories);

// Get categories and subcategories for a specific project type
router.get('/project-categories/:project_category_id/categories', getCategoriesByProjectType);

// Get all categories with subcategories for all project types
router.get('/categories/all', getAllCategoriesWithSubcategories);

export default router;
