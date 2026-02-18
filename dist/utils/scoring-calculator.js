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
exports.ScoringCalculator = void 0;
const category_queries_1 = __importDefault(require("../queries/category-queries"));
class ScoringCalculator {
    /**
     * Calculate QC score based on markings and handle fatal errors
     */
    static calculateScore(projectCategoryId, markings) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get categories and subcategories for this project type
                const categories = yield category_queries_1.default.getCategoriesByProjectType(projectCategoryId);
                const categoryScores = [];
                const fatalErrorsFound = [];
                let totalProjectPoints = 0;
                let totalPointsEarned = 0;
                // Process each category
                for (const category of categories) {
                    totalProjectPoints += category.category_points;
                    // Find markings for this category's subcategories
                    const categoryMarkings = markings.filter(marking => category.subcategories.some(sub => sub.subcategory_id === marking.subcategory_id));
                    let categoryPointsDeducted = 0;
                    const processedSubcategories = [];
                    // Process each subcategory in this category
                    for (const subcategory of category.subcategories) {
                        const marking = categoryMarkings.find(m => m.subcategory_id === subcategory.subcategory_id);
                        const errorCount = (marking === null || marking === void 0 ? void 0 : marking.error_count) || 0;
                        const pointsDeducted = (marking === null || marking === void 0 ? void 0 : marking.points_deducted) || 0;
                        // Check for fatal error
                        if (subcategory.is_fatal_error && errorCount > 0) {
                            fatalErrorsFound.push({
                                subcategory_id: subcategory.subcategory_id,
                                subcategory_name: subcategory.subcategory_name,
                                category_name: category.category_name
                            });
                            // For fatal errors, deduct full category points
                            categoryPointsDeducted = category.category_points;
                        }
                        else {
                            categoryPointsDeducted += pointsDeducted;
                        }
                        processedSubcategories.push({
                            subcategory_id: subcategory.subcategory_id,
                            subcategory_name: subcategory.subcategory_name,
                            error_count: errorCount,
                            points_deducted: pointsDeducted,
                            is_fatal_error: subcategory.is_fatal_error
                        });
                    }
                    // Calculate category score
                    const categoryFinalScore = Math.max(0, category.category_points - categoryPointsDeducted);
                    const categoryPercentage = (categoryFinalScore / category.category_points) * 100;
                    totalPointsEarned += categoryFinalScore;
                    categoryScores.push({
                        category_id: category.category_id,
                        category_name: category.category_name,
                        category_points: category.category_points,
                        points_deducted: categoryPointsDeducted,
                        final_score: categoryFinalScore,
                        percentage: categoryPercentage,
                        subcategories: processedSubcategories
                    });
                }
                // Calculate final results
                const totalPercentage = totalProjectPoints > 0 ? (totalPointsEarned / totalProjectPoints) * 100 : 0;
                const isRejected = fatalErrorsFound.length > 0;
                return {
                    total_score: totalPointsEarned,
                    total_percentage: Math.round(totalPercentage * 100) / 100, // Round to 2 decimal places
                    is_rejected: isRejected,
                    rejection_reason: isRejected ? `Fatal error(s) found: ${fatalErrorsFound.map(f => f.subcategory_name).join(', ')}` : undefined,
                    category_scores: categoryScores,
                    fatal_errors_found: fatalErrorsFound
                };
            }
            catch (error) {
                console.error('Error calculating QC score:', error);
                throw error;
            }
        });
    }
    /**
     * Validate markings before calculation
     */
    static validateMarkings(markings) {
        const errors = [];
        for (const marking of markings) {
            if (markings.filter(m => m.subcategory_id === marking.subcategory_id).length > 1) {
                errors.push(`Duplicate markings for subcategory ID ${marking.subcategory_id}`);
            }
            if (marking.error_count < 0) {
                errors.push(`Negative error count for subcategory ID ${marking.subcategory_id}`);
            }
            if (marking.points_deducted < 0) {
                errors.push(`Negative points deducted for subcategory ID ${marking.subcategory_id}`);
            }
        }
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    /**
     * Get scoring summary for reporting
     */
    static generateScoringSummary(result) {
        if (result.is_rejected) {
            return `QC REJECTED: ${result.rejection_reason}. Overall score: ${result.total_percentage}%`;
        }
        const categoryBreakdown = result.category_scores
            .map(cat => `${cat.category_name}: ${cat.percentage.toFixed(1)}%`)
            .join(', ');
        return `QC PASSED: Overall score ${result.total_percentage}%. Category breakdown: ${categoryBreakdown}`;
    }
}
exports.ScoringCalculator = ScoringCalculator;
