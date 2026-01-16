import { Request, Response } from 'express';
import get_db_connection from '../database/db';
import crypto from 'crypto';
import userQueries from '../queries/user-queries';
import qcQueries from '../queries/qc-queries';

// Get all files available for QC evaluation
export const getQCFilesForEvaluation = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: 'user_id is required'
      });
    }

    const connection = await get_db_connection();

    try {
      // Check if user is a QC agent and get their role
      const user = await userQueries.getUserWithDesignation(user_id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Check if user has QC agent role or higher (designation_id >= 3)
      if (user.designation_id < 3) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only QC agents and above can access evaluation files.'
        });
      }

      console.log(`QC Agent ${user.user_name} (designation_id: ${user.designation_id}) requesting available files for evaluation`);

      // Get all QC performance records with hierarchical access control
      const qcFiles = await qcQueries.getQCFilesForEvaluation();

      // Group files by project for better organization
      const filesByProject = qcFiles.reduce((acc: any, file: any) => {
        const projectId = file.project_id;
        if (!acc[projectId]) {
          acc[projectId] = {
            project_id: file.project_id,
            project_name: file.project_name,
            files: []
          };
        }
        
        acc[projectId].files.push({
          qc_id: file.qc_id,
          file_name: file.file_name,
          task_id: file.task_id,
          task_name: file.task_name,
          tracker_id: file.tracker_id,
          total_records_processed: file.total_records_processed,
          duplicates_found: file.duplicates_found,
          unique_records: file.unique_records,
          processing_status: file.processing_status,
          qc_score: file.qc_score,
          qc_agent_id: file.qc_agent_id,
          qc_agent_name: file.qc_agent_name,
          qc_notes: file.qc_notes,
          created_at: file.created_at,
          updated_at: file.updated_at,
          evaluation_status: file.qc_score ? 'evaluated' : 'pending_evaluation',
          processed_by: file.processed_by,
          processor_designation_id: file.processor_designation_id,
          processor_designation: file.processor_designation
        });
        
        return acc;
      }, {});

      const projectsList = Object.values(filesByProject);

      // Get summary statistics
      const totalFiles = qcFiles.length;
      const evaluatedFiles = qcFiles.filter((file: any) => file.qc_score !== null).length;
      const pendingFiles = totalFiles - evaluatedFiles;

      // Get role hierarchy info
      const allRoles = await userQueries.getAllDesignations();
      const accessibleRoles = allRoles.filter((role: any) => role.designation_id >= 1 && role.designation_id <= 5);
      const inaccessibleRoles = allRoles.filter((role: any) => role.designation_id < 1 || role.designation_id > 5);

      console.log(`Found ${totalFiles} files (${evaluatedFiles} evaluated, ${pendingFiles} pending) accessible to role ${user.role_id}`);

      res.status(200).json({
        success: true,
        message: 'QC files retrieved successfully',
        data: {
          qc_agent: {
            user_id: user.user_id,
            user_name: user.user_name,
            designation: user.designation_name,
            role_id: user.designation_id
          },
          access_control: {
            accessible_roles: accessibleRoles,
            inaccessible_roles: inaccessibleRoles
          },
          summary: {
            total_files: totalFiles,
            evaluated_files: evaluatedFiles,
            pending_files: pendingFiles
          },
          projects: projectsList
        }
      });

    } finally {
      await connection.end();
    }

  } catch (error) {
    console.error('Error in getQCFilesForEvaluation:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving QC files',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get specific file details for QC evaluation
export const getQCFileDetails = async (req: Request, res: Response) => {
  try {
    const { user_id, qc_id } = req.body;
    
    if (!user_id || !qc_id) {
      return res.status(400).json({
        success: false,
        message: 'user_id and qc_id are required'
      });
    }

    const connection = await get_db_connection();

    try {
      // Check if user is a QC agent and get their role
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
      
      // Check if user has QC agent role or higher (role_id >= 3)
      if (user.role_id < 3) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only QC agents and above can access file details.'
        });
      }

      console.log(`QC Agent ${user.user_name} (role_id: ${user.role_id}) requesting details for QC file ${qc_id}`);

      // Get specific QC performance record with hierarchical access control
      const qcFile = await qcQueries.getQCFileDetails(qc_id);

      if (!qcFile) {
        return res.status(404).json({
          success: false,
          message: 'QC file not found or access denied'
        });
      }

      const file = qcFile[0];

      // Get total records in tracker_records for this file/project
      const [recordStats] = await connection.execute(
        `SELECT 
          COUNT(*) as total_records,
          COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_records,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_records,
          MIN(created_at) as first_record_date,
          MAX(created_at) as last_record_date
        FROM tracker_records 
        WHERE project_id = ? 
        AND user_id = ?`,
        [file.project_id, file.user_id] // We need to get the original user_id from qc_performance
      ) as [any[], any];

      // Get the original user_id from qc_performance
      const [originalUser] = await connection.execute(
        'SELECT user_id FROM qc_performance WHERE id = ?',
        [qc_id]
      ) as [any[], any];

      const stats = recordStats[0] || {
        total_records: 0,
        ready_records: 0,
        failed_records: 0,
        first_record_date: null,
        last_record_date: null
      };

      // Parse important columns
      const importantColumns = file.important_columns ? JSON.parse(file.important_columns) : [];

      // Get evaluation criteria (dummy for now)
      const evaluationCriteria = getDummyCriteria(file.project_id);

      // Calculate sample size (10% of records)
      const sampleSize = Math.max(1, Math.ceil(stats.total_records * 0.1));

      console.log(`File details retrieved: ${file.file_name}, Total records: ${stats.total_records}, Sample size: ${sampleSize}`);

      res.status(200).json({
        success: true,
        message: 'QC file details retrieved successfully',
        data: {
          qc_agent: {
            user_id: user.user_id,
            user_name: user.user_name,
            designation: user.designation_name,
            role_id: user.designation_id
          },
          file_details: {
            qc_id: file.qc_id,
            file_name: file.file_name,
            processing_status: file.processing_status,
            evaluation_status: file.qc_score ? 'evaluated' : 'pending_evaluation',
            created_at: file.created_at,
            updated_at: file.updated_at
          },
          project_info: {
            project_id: file.project_id,
            project_name: file.project_name,
            project_description: file.project_description,
            task_id: file.task_id,
            task_name: file.task_name,
            task_description: file.task_description
          },
          processing_info: {
            processed_by: file.processed_by,
            processor_designation_id: file.processor_designation_id,
            processor_designation: file.processor_designation,
            important_columns: importantColumns,
            total_records_processed: file.total_records_processed,
            duplicates_found: file.duplicates_found,
            unique_records: file.unique_records
          },
          record_statistics: {
            total_records: stats.total_records,
            ready_records: stats.ready_records,
            failed_records: stats.failed_records,
            first_record_date: stats.first_record_date,
            last_record_date: stats.last_record_date
          },
          current_evaluation: {
            qc_score: file.qc_score,
            qc_agent_id: file.qc_agent_id,
            qc_agent_name: file.qc_agent_name,
            qc_agent_designation: file.qc_agent_designation,
            qc_notes: file.qc_notes,
            evaluated_at: file.updated_at
          },
          evaluation_setup: {
            evaluation_criteria: evaluationCriteria,
            sampling_percentage: 10,
            sample_size: sampleSize,
            ready_for_evaluation: file.qc_score === null && stats.total_records > 0
          },
          access_control: {
            message: `Access granted - file from user with role_id ${file.processor_role_id} < your role_id ${user.role_id}`,
            can_evaluate: file.qc_score === null,
            can_view_results: file.qc_score !== null
          }
        }
      });

    } finally {
      await connection.end();
    }

  } catch (error) {
    console.error('Error in getQCFileDetails:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving QC file details',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get QC evaluation data for a specific file
export const getQCEvaluationData = async (req: Request, res: Response) => {
  try {
    const { user_id, project_id } = req.body;
    
    if (!user_id || !project_id) {
      return res.status(400).json({
        success: false,
        message: 'user_id and project_id are required'
      });
    }

    const connection = await get_db_connection();

    try {
      // Check if user is a QC agent and get their role
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
      
      // Check if user has QC agent role or higher (role_id >= 3)
      if (user.role_id < 3) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only QC agents and above can access evaluation data.'
        });
      }

      console.log(`QC Agent ${user.user_name} (role_id: ${user.role_id}) accessing evaluation data for project ${project_id}`);

      // Get all tracker records for the project with access control for designations 1-5
      const [trackerRecords] = await connection.execute(
        `SELECT tr.id, tr.record_data, tr.hash_value, tr.created_at, u.user_name as processed_by, u.designation_id as processor_designation_id
         FROM tracker_records tr
         LEFT JOIN tfs_user u ON tr.user_id = u.user_id
         WHERE tr.project_id = ? 
         AND u.designation_id >= 1 AND u.designation_id <= 5  -- Only show records from accessible designations
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
            total_records: 0,
            sampled_records: [],
            evaluation_criteria: getDummyCriteria(project_id),
            sampling_percentage: 10,
            access_control: {
              message: `Only accessing records from users with role_id < ${user.role_id}`
            }
          }
        });
      }

      // Calculate 10% sample size
      const totalRecords = trackerRecords.length;
      const sampleSize = Math.max(1, Math.ceil(totalRecords * 0.1)); // At least 1 record
      
      console.log(`Total records: ${totalRecords}, Sample size: ${sampleSize} (10%)`);

      // Sample records using systematic random sampling
      const sampledRecords = sampleRecords(trackerRecords, sampleSize);

      // Parse record data and prepare for evaluation
      const evaluationData = sampledRecords.map(record => ({
        record_id: record.id,
        hash_value: record.hash_value,
        created_at: record.created_at,
        record_data: JSON.parse(record.record_data),
        processed_by: record.processed_by,
        processor_role_id: record.processor_role_id,
        evaluation_status: 'pending', // pending, passed, failed
        evaluation_score: null,
        evaluation_notes: null,
        criteria_results: {} // Will store criteria-specific results
      }));

      // Get project-specific criteria (dummy for now)
      const evaluationCriteria = getDummyCriteria(project_id);

      console.log(`Prepared ${evaluationData.length} records for QC evaluation`);

      res.status(200).json({
        success: true,
        message: 'QC evaluation data retrieved successfully',
        data: {
          qc_agent: {
            user_id: user.user_id,
            user_name: user.user_name,
            designation: user.designation_name,
            role_id: user.designation_id
          },
          project_id: project_id,
          total_records: totalRecords,
          sampled_records: evaluationData,
          evaluation_criteria: evaluationCriteria,
          sampling_percentage: 10,
          sample_size: sampleSize,
          access_control: {
            message: `Only accessing records from users with role_id < ${user.role_id}`,
            accessible_records: `${totalRecords} records from lower-level users`
          }
        }
      });

    } finally {
      await connection.end();
    }

  } catch (error) {
    console.error('Error in getQCEvaluationData:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving QC evaluation data',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Submit QC evaluation results
export const submitQCEvaluation = async (req: Request, res: Response) => {
  try {
    const { 
      user_id, 
      project_id, 
      evaluation_results,
      overall_notes 
    } = req.body;

    if (!user_id || !project_id || !evaluation_results) {
      return res.status(400).json({
        success: false,
        message: 'user_id, project_id, and evaluation_results are required'
      });
    }

    const connection = await get_db_connection();

    try {
      // Verify QC agent role
      const [userCheck] = await connection.execute(
        'SELECT u.user_id, u.user_name, u.role_id FROM tfs_user u WHERE u.user_id = ? AND u.role_id >= 3',
        [user_id]
      ) as [any[], any];

      if (userCheck.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only QC agents can submit evaluations.'
        });
      }

      const qcAgent = userCheck[0];
      console.log(`QC Agent ${qcAgent.user_name} submitting evaluation for project ${project_id}`);

      // Calculate overall statistics
      const totalEvaluated = evaluation_results.length;
      const passedCount = evaluation_results.filter((result: any) => result.evaluation_status === 'passed').length;
      const failedCount = totalEvaluated - passedCount;
      const passRate = totalEvaluated > 0 ? (passedCount / totalEvaluated) * 100 : 0;

      // Update QC performance records with evaluation results
      for (const result of evaluation_results) {
        await connection.execute(
          `UPDATE qc_performance 
           SET qc_score = ?, qc_agent_id = ?, qc_notes = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id IN (
             SELECT id FROM (
               SELECT id FROM qc_performance 
               WHERE project_id = ? 
               AND file_name = (
                 SELECT file_name FROM tracker_records WHERE id = ? LIMIT 1
               )
               LIMIT 1
             ) AS subquery
           )`,
          [
            result.evaluation_score || 0,
            user_id,
            result.evaluation_notes || overall_notes || '',
            project_id,
            result.record_id
          ]
        );
      }

      // Store evaluation summary (optional - for reporting)
      const evaluationId = crypto.randomUUID();
      await connection.execute(
        `INSERT INTO qc_evaluations 
         (id, user_id, project_id, total_evaluated, passed_count, failed_count, pass_rate, evaluation_data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          evaluationId,
          user_id,
          project_id,
          totalEvaluated,
          passedCount,
          failedCount,
          passRate,
          JSON.stringify(evaluation_results)
        ]
      );

      console.log(`Evaluation completed: ${passedCount}/${totalEvaluated} passed (${passRate.toFixed(1)}%)`);

      res.status(200).json({
        success: true,
        message: 'QC evaluation submitted successfully',
        data: {
          evaluation_id: evaluationId,
          summary: {
            total_evaluated: totalEvaluated,
            passed_count: passedCount,
            failed_count: failedCount,
            pass_rate: passRate.toFixed(1)
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
    console.error('Error in submitQCEvaluation:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting QC evaluation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Helper function to sample records systematically
function sampleRecords(records: any[], sampleSize: number): any[] {
  if (records.length <= sampleSize) {
    return records;
  }

  const sampled: any[] = [];
  const step = Math.floor(records.length / sampleSize);
  const startIndex = Math.floor(Math.random() * step); // Random start within first step

  for (let i = 0; i < sampleSize && startIndex + (i * step) < records.length; i++) {
    sampled.push(records[startIndex + (i * step)]);
  }

  // If we didn't get enough samples, add random ones
  while (sampled.length < sampleSize && sampled.length < records.length) {
    const randomIndex = Math.floor(Math.random() * records.length);
    if (!sampled.includes(records[randomIndex])) {
      sampled.push(records[randomIndex]);
    }
  }

  return sampled;
}

// Helper function to get dummy criteria (will be replaced with dynamic criteria)
function getDummyCriteria(project_id: number): any[] {
  // Dummy criteria - will be replaced with project-specific criteria from frontend
  return [
    {
      id: 'typo_check',
      name: 'Typo Check',
      description: 'Check for typographical errors in text fields',
      weight: 25,
      required: true
    },
    {
      id: 'spelling_check',
      name: 'Spelling Check',
      description: 'Verify spelling accuracy in all text fields',
      weight: 25,
      required: true
    },
    {
      id: 'format_check',
      name: 'Format Validation',
      description: 'Ensure data follows specified format requirements',
      weight: 20,
      required: true
    },
    {
      id: 'completeness_check',
      name: 'Completeness Check',
      description: 'Verify all required fields are filled',
      weight: 20,
      required: true
    },
    {
      id: 'accuracy_check',
      name: 'Data Accuracy',
      description: 'Cross-reference data accuracy against source',
      weight: 10,
      required: false
    }
  ];
}
