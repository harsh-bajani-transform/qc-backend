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
exports.getEvaluationResults = exports.submitCategoryBasedEvaluation = void 0;
const scoring_calculator_1 = require("../utils/scoring-calculator");
const db_1 = __importDefault(require("../database/db"));
// Submit QC evaluation with category-based scoring
const submitCategoryBasedEvaluation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { user_id, project_id, qc_performance_id, project_category_id, markings, overall_notes } = req.body;
        // Validation
        if (!user_id || !project_id || !qc_performance_id || !project_category_id || !markings) {
            return res.status(400).json({
                success: false,
                message: 'user_id, project_id, qc_performance_id, project_category_id, and markings are required'
            });
        }
        if (!Array.isArray(markings) || markings.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'markings must be a non-empty array'
            });
        }
        // Validate markings format
        const validation = scoring_calculator_1.ScoringCalculator.validateMarkings(markings);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid markings format',
                errors: validation.errors
            });
        }
        const connection = yield (0, db_1.default)();
        try {
            // Verify QC agent role
            const [userCheck] = yield connection.execute('SELECT user_id, user_name, role_id FROM tfs_user WHERE user_id = ? AND role_id >= 3', [user_id]);
            if (userCheck.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Only QC agents can submit evaluations.'
                });
            }
            const qcAgent = userCheck[0];
            console.log(`QC Agent ${qcAgent.user_name} submitting category-based evaluation for project ${project_id}`);
            // Calculate score using the scoring calculator
            const scoringResult = yield scoring_calculator_1.ScoringCalculator.calculateScore(Number(project_category_id), markings);
            // Store evaluation details
            const evaluationId = crypto.randomUUID();
            // Insert main evaluation record
            yield connection.execute(`INSERT INTO qc_category_evaluations 
         (id, qc_performance_id, project_id, project_category_id, qc_agent_id, 
          total_score, total_percentage, is_rejected, rejection_reason, 
          overall_notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`, [
                evaluationId,
                qc_performance_id,
                project_id,
                project_category_id,
                user_id,
                scoringResult.total_score,
                scoringResult.total_percentage,
                scoringResult.is_rejected,
                scoringResult.rejection_reason || null,
                overall_notes || ''
            ]);
            // Insert category scores
            for (const categoryScore of scoringResult.category_scores) {
                const categoryId = crypto.randomUUID();
                yield connection.execute(`INSERT INTO qc_category_scores 
           (id, evaluation_id, category_id, category_name, category_points, 
            points_deducted, final_score, percentage)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                    categoryId,
                    evaluationId,
                    categoryScore.category_id,
                    categoryScore.category_name,
                    categoryScore.category_points,
                    categoryScore.points_deducted,
                    categoryScore.final_score,
                    categoryScore.percentage
                ]);
                // Insert subcategory markings
                for (const subcategory of categoryScore.subcategories) {
                    const subcategoryId = crypto.randomUUID();
                    yield connection.execute(`INSERT INTO qc_subcategory_markings 
             (id, category_score_id, subcategory_id, subcategory_name, 
              error_count, points_deducted, is_fatal_error)
             VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                        subcategoryId,
                        categoryId,
                        subcategory.subcategory_id,
                        subcategory.subcategory_name,
                        subcategory.error_count,
                        subcategory.points_deducted,
                        subcategory.is_fatal_error
                    ]);
                }
            }
            // Update the main qc_performance table with final score
            yield connection.execute(`UPDATE qc_performance 
         SET qc_score = ?, qc_agent_id = ?, qc_notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`, [
                scoringResult.total_percentage,
                user_id,
                overall_notes || scoring_calculator_1.ScoringCalculator.generateScoringSummary(scoringResult),
                qc_performance_id
            ]);
            console.log(`Category-based evaluation completed: ${scoringResult.total_percentage}% (Rejected: ${scoringResult.is_rejected})`);
            res.status(200).json({
                success: true,
                message: 'QC evaluation submitted successfully',
                data: {
                    evaluation_id: evaluationId,
                    scoring_result: scoringResult,
                    summary: scoring_calculator_1.ScoringCalculator.generateScoringSummary(scoringResult),
                    qc_agent: {
                        user_id: qcAgent.user_id,
                        user_name: qcAgent.user_name
                    }
                }
            });
        }
        finally {
            yield connection.end();
        }
    }
    catch (error) {
        console.error('Error in submitCategoryBasedEvaluation:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting QC evaluation',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.submitCategoryBasedEvaluation = submitCategoryBasedEvaluation;
// Get evaluation results for a specific QC performance
const getEvaluationResults = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { qc_performance_id } = req.params;
        if (!qc_performance_id || isNaN(Number(qc_performance_id))) {
            return res.status(400).json({
                success: false,
                message: 'Valid qc_performance_id is required'
            });
        }
        const connection = yield (0, db_1.default)();
        try {
            // Get main evaluation
            const [evaluation] = yield connection.execute(`SELECT * FROM qc_category_evaluations 
         WHERE qc_performance_id = ? 
         ORDER BY created_at DESC 
         LIMIT 1`, [qc_performance_id]);
            if (evaluation.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Evaluation not found for this QC performance record'
                });
            }
            const evalData = evaluation[0];
            // Get category scores
            const [categoryScores] = yield connection.execute(`SELECT * FROM qc_category_scores 
         WHERE evaluation_id = ?`, [evalData.id]);
            // Get subcategory markings for each category
            const categoryScoresWithDetails = yield Promise.all(categoryScores.map((category) => __awaiter(void 0, void 0, void 0, function* () {
                const [subcategories] = yield connection.execute(`SELECT * FROM qc_subcategory_markings 
             WHERE category_score_id = ?`, [category.id]);
                return Object.assign(Object.assign({}, category), { subcategories });
            })));
            res.status(200).json({
                success: true,
                message: 'Evaluation results retrieved successfully',
                data: {
                    evaluation: evalData,
                    category_scores: categoryScoresWithDetails
                }
            });
        }
        finally {
            yield connection.end();
        }
    }
    catch (error) {
        console.error('Error getting evaluation results:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving evaluation results',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.getEvaluationResults = getEvaluationResults;
