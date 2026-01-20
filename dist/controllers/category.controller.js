"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllCategoriesWithSubcategories = exports.getCategoriesByProjectType = exports.getProjectCategories = void 0;
const category_queries_1 = __importDefault(require("../queries/category-queries"));
// Get all project categories
const getProjectCategories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const categories = yield category_queries_1.default.getProjectCategories();
        res.status(200).json({
            success: true,
            message: 'Project categories retrieved successfully',
            data: categories
        });
    }
    catch (error) {
        console.error('Error getting project categories:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving project categories',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getProjectCategories = getProjectCategories;
// Get categories and subcategories for a specific project type
const getCategoriesByProjectType = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { project_category_id } = req.params;
        if (!project_category_id || isNaN(Number(project_category_id))) {
            return res.status(400).json({
                success: false,
                message: 'Valid project_category_id is required'
            });
        }
        const categories = yield category_queries_1.default.getCategoriesByProjectType(Number(project_category_id));
        res.status(200).json({
            success: true,
            message: 'Categories retrieved successfully',
            data: categories
        });
    }
    catch (error) {
        console.error('Error getting categories by project type:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving categories',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getCategoriesByProjectType = getCategoriesByProjectType;
// Get all categories with subcategories for all project types
const getAllCategoriesWithSubcategories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const allCategories = yield category_queries_1.default.getAllCategoriesWithSubcategories();
        res.status(200).json({
            success: true,
            message: 'All categories with subcategories retrieved successfully',
            data: allCategories
        });
    }
    catch (error) {
        console.error('Error getting all categories:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving all categories',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getAllCategoriesWithSubcategories = getAllCategoriesWithSubcategories;
