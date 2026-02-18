"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const category_controller_1 = require("../controllers/category.controller");
const router = (0, express_1.Router)();
// Get all project categories
router.get('/project-categories', category_controller_1.getProjectCategories);
// Get categories and subcategories for a specific project type
router.get('/project-categories/:project_category_id/categories', category_controller_1.getCategoriesByProjectType);
// Get all categories with subcategories for all project types
router.get('/categories/all', category_controller_1.getAllCategoriesWithSubcategories);
exports.default = router;
