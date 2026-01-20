import { Request, Response } from 'express';
import get_db_connection from '../database/db';
import userQueries from '../queries/user-queries';
import qcQueries from '../queries/qc-queries';
import categoryQueries from '../queries/category-queries';
import { ScoringCalculator, QCMarking } from '../utils/scoring-calculator';
import AIService from '../config/ai';
import { sampleRecords } from '../utils/qc-helpers';

// Get QC evaluation data with AFD criteria for a specific project
export const getQCEvaluationDataWithAFD = async (req: Request, res: Response) => {
  try {
    const { user_id, project_id, project_category_id } = req.body;
    
    if (!user_id || !project_id || !project_category_id) {
      return res.status(400).json({
        success: false,
        message: 'user_id, project_id, and project_category_id are required'
      });
    }

    const connection = await get_db_connection();

    try {
      // Check if user is a QC agent
      const [userCheck] = await connection.execute(
        'SELECT u.user_id, u.user_name, u.role_id, u.designation_id, ud.designation as designation_name FROM tfs_user u LEFT JOIN user_designation ud ON u.designation_id = ud.designation_id WHERE u.user_id = ?',
        [user_id]
      ) as [any[], any];

      if (userCheck.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const user = userCheck[0];
      
      if (user.role_id < 3) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only QC agents and above can access evaluation data.'
        });
      }

      console.log(`QC Agent ${user.user_name} accessing AFD-based evaluation for project ${project_id}`);

      // Get AFD categories and subcategories for this project type
      const afdCategories = await categoryQueries.getCategoriesByProjectType(Number(project_category_id));
      
      // Get tracker records for the project (10% sampling)
      const [trackerRecords] = await connection.execute(
        `SELECT tr.id, tr.record_data, tr.hash_value, tr.created_at, u.user_name as processed_by, u.designation_id as processor_designation_id
         FROM tracker_records tr
         LEFT JOIN tfs_user u ON tr.user_id = u.user_id
         WHERE tr.project_id = ? 
         AND u.designation_id >= 1 AND u.designation_id <= 5
         ORDER BY tr.created_at DESC`,
        [project_id]
      ) as [any[], any];

      if (trackerRecords.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No records found for evaluation',
          data: {
            qc_agent: {
              user_id: user.user_id,
              user_name: user.user_name,
              designation: user.designation_name,
              role_id: user.role_id
            },
            project_id: project_id,
            project_category_id: project_category_id,
            total_records: 0,
            sampled_records: [],
            afd_categories: afdCategories,
            access_control: {
              message: `Only accessing records from users with role_id < ${user.role_id}`
            }
          }
        });
      }

      const totalRecords = trackerRecords.length;
      const sampleSize = Math.max(1, Math.ceil(totalRecords * 0.1)); // 10% sample
      console.log(`Total records: ${totalRecords}, Sample size: ${sampleSize} (10%)`);

      // Sample records using systematic random sampling
      const sampledRecords = sampleRecords(trackerRecords, sampleSize);

      // Prepare evaluation data with AFD structure
      const evaluationData = sampledRecords.map((record: any) => ({
        record_id: record.id,
        hash_value: record.hash_value,
        created_at: record.created_at,
        record_data: JSON.parse(record.record_data),
        processed_by: record.processed_by,
        processor_designation_id: record.processor_designation_id,
        evaluation_status: 'pending',
        afd_markings: afdCategories.flatMap(category => 
          category.subcategories.map(subcategory => ({
            subcategory_id: subcategory.subcategory_id,
            subcategory_name: subcategory.subcategory_name,
            is_fatal_error: subcategory.is_fatal_error,
            has_error: false,
            error_count: 0,
            points_deducted: 0,
            notes: ''
          }))
        )
      }));

      console.log(`Prepared ${evaluationData.length} sampled records with AFD criteria for QC evaluation`);

      res.status(200).json({
        success: true,
        message: 'QC evaluation data with AFD criteria retrieved successfully',
        data: {
          qc_agent: {
            user_id: user.user_id,
            user_name: user.user_name,
            designation: user.designation_name,
            role_id: user.role_id
          },
          project_id: project_id,
          project_category_id: project_category_id,
          total_records: totalRecords,
          sampled_records: evaluationData,
          afd_categories: afdCategories,
          sampling_percentage: 10,
          sample_size: sampleSize,
          access_control: {
            message: `Only accessing records from users with role_id < ${user.role_id}`,
            accessible_records: `${totalRecords} records from lower-level users`,
            sampling_info: `Sampled ${sampleSize} records (${Math.round((sampleSize/totalRecords)*100)}%) for QC evaluation`
          }
        }
      });

    } finally {
      await connection.end();
    }

  } catch (error) {
    console.error('Error in getQCEvaluationDataWithAFD:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving QC evaluation data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Submit AFD-based QC evaluation with AI feedback
export const submitAFDBasedEvaluation = async (req: Request, res: Response) => {
  try {
    const { 
      user_id, 
      project_id,
      qc_performance_id,
      project_category_id,
      evaluation_results,
      overall_notes 
    } = req.body;

    if (!user_id || !project_id || !qc_performance_id || !project_category_id || !evaluation_results) {
      return res.status(400).json({
        success: false,
        message: 'user_id, project_id, qc_performance_id, project_category_id, and evaluation_results are required'
      });
    }

    if (!Array.isArray(evaluation_results) || evaluation_results.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'evaluation_results must be a non-empty array'
      });
    }

    const connection = await get_db_connection();

    try {
      // Verify QC agent role
      const [userCheck] = await connection.execute(
        'SELECT user_id, user_name, role_id FROM tfs_user WHERE user_id = ? AND role_id >= 3',
        [user_id]
      ) as [any[], any];

      if (userCheck.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only QC agents can submit evaluations.'
        });
      }

      const qcAgent = userCheck[0];
      console.log(`QC Agent ${qcAgent.user_name} submitting AFD-based evaluation for project ${project_id}`);

      // Extract markings from evaluation results
      const markings: QCMarking[] = [];
      const errorsBySubcategory: { [key: number]: any[] } = {};

      evaluation_results.forEach((result: any) => {
        if (result.afd_markings && Array.isArray(result.afd_markings)) {
          result.afd_markings.forEach((marking: any) => {
            if (marking.has_error && marking.error_count > 0) {
              markings.push({
                subcategory_id: marking.subcategory_id,
                error_count: marking.error_count,
                points_deducted: marking.points_deducted
              });

              // Collect errors for AI feedback
              if (!errorsBySubcategory[marking.subcategory_id]) {
                errorsBySubcategory[marking.subcategory_id] = [];
              }
              errorsBySubcategory[marking.subcategory_id].push({
                record_id: result.record_id,
                error_details: marking.notes || `${marking.subcategory_name} error`,
                data_snippet: JSON.stringify(result.record_data).substring(0, 200) + '...'
              });
            }
          });
        }
      });

      // Calculate score using AFD-based scoring calculator
      const scoringResult = await ScoringCalculator.calculateScore(
        Number(project_category_id),
        markings
      );

      // Generate AI feedback based on AFD markings
      let aiFeedback = null;
      try {
        const afdCategories = await categoryQueries.getCategoriesByProjectType(Number(project_category_id));
        
        // Prepare detailed error analysis for AI
        const errorAnalysis = {
          totalRecords: evaluation_results.length,
          errorsBySubcategory: Object.keys(errorsBySubcategory).map(subcategoryId => {
            const subcatId = Number(subcategoryId);
            const subcategory = afdCategories
              .flatMap(cat => cat.subcategories)
              .find(sub => sub.subcategory_id === subcatId);
            
            return {
              subcategory_name: subcategory?.subcategory_name || `Subcategory ${subcatId}`,
              error_count: errorsBySubcategory[subcatId].length,
              error_details: errorsBySubcategory[subcatId],
              is_fatal_error: subcategory?.is_fatal_error || false
            };
          }),
          overallScore: scoringResult.total_percentage,
          isRejected: scoringResult.is_rejected,
          fatalErrors: scoringResult.fatal_errors_found
        };

        if (scoringResult.total_percentage < 95 || scoringResult.is_rejected) {
          aiFeedback = await AIService.generateAFDEvaluationFeedback(errorAnalysis);
        }
      } catch (aiError) {
        console.error('Error generating AI feedback:', aiError);
      }

      // Store evaluation results in database
      const evaluationId = crypto.randomUUID();
      
      // Insert main evaluation record
      await connection.execute(
        `INSERT INTO qc_category_evaluations 
         (id, qc_performance_id, project_id, project_category_id, qc_agent_id, 
          total_score, total_percentage, is_rejected, rejection_reason, 
          overall_notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
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
        ]
      );

      // Insert category scores and subcategory markings
      for (const categoryScore of scoringResult.category_scores) {
        const categoryId = crypto.randomUUID();
        await connection.execute(
          `INSERT INTO qc_category_scores 
           (id, evaluation_id, category_id, category_name, category_points, 
            points_deducted, final_score, percentage)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            categoryId,
            evaluationId,
            categoryScore.category_id,
            categoryScore.category_name,
            categoryScore.category_points,
            categoryScore.points_deducted,
            categoryScore.final_score,
            categoryScore.percentage
          ]
        );

        for (const subcategory of categoryScore.subcategories) {
          const subcategoryId = crypto.randomUUID();
          await connection.execute(
            `INSERT INTO qc_subcategory_markings 
             (id, category_score_id, subcategory_id, subcategory_name, 
              error_count, points_deducted, is_fatal_error)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              subcategoryId,
              categoryId,
              subcategory.subcategory_id,
              subcategory.subcategory_name,
              subcategory.error_count,
              subcategory.points_deducted,
              subcategory.is_fatal_error
            ]
          );
        }
      }

      // Update main qc_performance table
      await connection.execute(
        `UPDATE qc_performance 
         SET qc_score = ?, qc_agent_id = ?, qc_notes = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          scoringResult.total_percentage,
          user_id,
          overall_notes || `AFD-based evaluation: ${scoringResult.total_percentage}%`,
          qc_performance_id
        ]
      );

      console.log(`AFD-based evaluation completed: ${scoringResult.total_percentage}% (Rejected: ${scoringResult.is_rejected})`);

      res.status(200).json({
        success: true,
        message: 'AFD-based QC evaluation submitted successfully',
        data: {
          evaluation_id: evaluationId,
          scoring_result: scoringResult,
          ai_feedback: aiFeedback,
          summary: {
            total_evaluated: evaluation_results.length,
            total_errors_found: markings.reduce((sum, m) => sum + m.error_count, 0),
            final_score: scoringResult.total_percentage,
            is_rejected: scoringResult.is_rejected
          },
          qc_agent: {
            user_id: qcAgent.user_id,
            user_name: qcAgent.user_name
          }
        }
      });

    } finally {
      await connection.end();
    }

  } catch (error) {
    console.error('Error in submitAFDBasedEvaluation:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting AFD-based QC evaluation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
