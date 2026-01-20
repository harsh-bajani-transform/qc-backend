import categoryQueries from '../queries/category-queries';

export interface QCMarking {
  subcategory_id: number;
  error_count: number;
  points_deducted: number;
}

export interface CategoryScore {
  category_id: number;
  category_name: string;
  category_points: number;
  points_deducted: number;
  final_score: number;
  percentage: number;
  subcategories: {
    subcategory_id: number;
    subcategory_name: string;
    error_count: number;
    points_deducted: number;
    is_fatal_error: boolean;
  }[];
}

export interface QCFinalResult {
  total_score: number;
  total_percentage: number;
  is_rejected: boolean;
  rejection_reason?: string;
  category_scores: CategoryScore[];
  fatal_errors_found: {
    subcategory_id: number;
    subcategory_name: string;
    category_name: string;
  }[];
}

export class ScoringCalculator {
  /**
   * Calculate QC score based on markings and handle fatal errors
   */
  static async calculateScore(
    projectCategoryId: number,
    markings: QCMarking[]
  ): Promise<QCFinalResult> {
    try {
      // Get categories and subcategories for this project type
      const categories = await categoryQueries.getCategoriesByProjectType(projectCategoryId);
      
      const categoryScores: CategoryScore[] = [];
      const fatalErrorsFound: any[] = [];
      let totalProjectPoints = 0;
      let totalPointsEarned = 0;

      // Process each category
      for (const category of categories) {
        totalProjectPoints += category.category_points;
        
        // Find markings for this category's subcategories
        const categoryMarkings = markings.filter(marking => 
          category.subcategories.some(sub => sub.subcategory_id === marking.subcategory_id)
        );

        let categoryPointsDeducted = 0;
        const processedSubcategories: any[] = [];

        // Process each subcategory in this category
        for (const subcategory of category.subcategories) {
          const marking = categoryMarkings.find(m => m.subcategory_id === subcategory.subcategory_id);
          const errorCount = marking?.error_count || 0;
          const pointsDeducted = marking?.points_deducted || 0;

          // Check for fatal error
          if (subcategory.is_fatal_error && errorCount > 0) {
            fatalErrorsFound.push({
              subcategory_id: subcategory.subcategory_id,
              subcategory_name: subcategory.subcategory_name,
              category_name: category.category_name
            });
            // For fatal errors, deduct full category points
            categoryPointsDeducted = category.category_points;
          } else {
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

    } catch (error) {
      console.error('Error calculating QC score:', error);
      throw error;
    }
  }

  /**
   * Validate markings before calculation
   */
  static validateMarkings(markings: QCMarking[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

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
  static generateScoringSummary(result: QCFinalResult): string {
    if (result.is_rejected) {
      return `QC REJECTED: ${result.rejection_reason}. Overall score: ${result.total_percentage}%`;
    }

    const categoryBreakdown = result.category_scores
      .map(cat => `${cat.category_name}: ${cat.percentage.toFixed(1)}%`)
      .join(', ');

    return `QC PASSED: Overall score ${result.total_percentage}%. Category breakdown: ${categoryBreakdown}`;
  }
}
