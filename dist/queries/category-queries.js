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
const db_1 = __importDefault(require("../database/db"));
const categoryQueries = {
    // Get all project categories
    getProjectCategories: () => __awaiter(void 0, void 0, void 0, function* () {
        const connection = yield (0, db_1.default)();
        try {
            const [result] = yield connection.execute('SELECT * FROM project_category ORDER BY project_category_id');
            return result;
        }
        finally {
            yield connection.end();
        }
    }),
    // Get categories and subcategories for a specific project type
    getCategoriesByProjectType: (projectCategoryId) => __awaiter(void 0, void 0, void 0, function* () {
        const connection = yield (0, db_1.default)();
        try {
            // First get main categories (afd_category_id = 0)
            const [categories] = yield connection.execute(`SELECT qc_afd_id, afd_name, afd_points, project_category_id 
         FROM qc_afd 
         WHERE project_category_id = ? AND afd_category_id = 0 
         ORDER BY qc_afd_id`, [projectCategoryId]);
            // For each category, get its subcategories
            const result = yield Promise.all(categories.map((category) => __awaiter(void 0, void 0, void 0, function* () {
                const [subcategories] = yield connection.execute(`SELECT qc_afd_id, afd_name, afd_points 
             FROM qc_afd 
             WHERE afd_category_id = ? 
             ORDER BY qc_afd_id`, [category.qc_afd_id]);
                return {
                    category_id: category.qc_afd_id,
                    category_name: category.afd_name,
                    category_points: category.afd_points,
                    project_category_id: category.project_category_id,
                    subcategories: subcategories.map((sub) => ({
                        subcategory_id: sub.qc_afd_id,
                        subcategory_name: sub.afd_name.trim(),
                        subcategory_points: sub.afd_points,
                        is_fatal_error: sub.afd_points === 100 && sub.afd_name.toLowerCase().includes('fatal error')
                    }))
                };
            })));
            return result;
        }
        finally {
            yield connection.end();
        }
    }),
    // Get all categories with subcategories for all project types
    getAllCategoriesWithSubcategories: () => __awaiter(void 0, void 0, void 0, function* () {
        const connection = yield (0, db_1.default)();
        try {
            const [projectCategories] = yield connection.execute('SELECT project_category_id FROM project_category ORDER BY project_category_id');
            const result = {};
            for (const project of projectCategories) {
                result[project.project_category_id] = yield categoryQueries.getCategoriesByProjectType(project.project_category_id);
            }
            return result;
        }
        finally {
            yield connection.end();
        }
    }),
    // Check if a subcategory is a fatal error
    isFatalError: (subcategoryId) => __awaiter(void 0, void 0, void 0, function* () {
        const connection = yield (0, db_1.default)();
        try {
            const [result] = yield connection.execute('SELECT afd_points, afd_name FROM qc_afd WHERE qc_afd_id = ?', [subcategoryId]);
            if (result.length === 0)
                return false;
            const subcategory = result[0];
            return subcategory.afd_points === 100 && subcategory.afd_name.toLowerCase().includes('fatal error');
        }
        finally {
            yield connection.end();
        }
    })
};
exports.default = categoryQueries;
