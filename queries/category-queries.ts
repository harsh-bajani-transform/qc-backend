import get_db_connection from '../database/db';

// Category-related query interfaces
interface QC_AFD {
  qc_afd_id: number;
  project_category_id: number;
  afd_name: string;
  afd_points: number;
  afd_category_id: number;
  created_at: string;
  updated_at: string;
}

interface ProjectCategory {
  project_category_id: number;
  project_category_name: string;
  created_date: string;
  updated_date: string;
}

interface CategoryWithSubcategories {
  category_id: number;
  category_name: string;
  category_points: number;
  project_category_id: number;
  subcategories: {
    subcategory_id: number;
    subcategory_name: string;
    subcategory_points: number;
    is_fatal_error: boolean;
  }[];
}

const categoryQueries = {
  // Get all project categories
  getProjectCategories: async (): Promise<ProjectCategory[]> => {
    const connection = await get_db_connection();
    try {
      const [result] = await connection.execute(
        'SELECT * FROM project_category ORDER BY project_category_id'
      );
      return result as ProjectCategory[];
    } finally {
      await connection.end();
    }
  },

  // Get categories and subcategories for a specific project type
  getCategoriesByProjectType: async (projectCategoryId: number): Promise<CategoryWithSubcategories[]> => {
    const connection = await get_db_connection();
    try {
      // First get main categories (afd_category_id = 0)
      const [categories] = await connection.execute(
        `SELECT qc_afd_id, afd_name, afd_points 
         FROM qc_afd 
         WHERE afd_category_id = 0 
         ORDER BY qc_afd_id`,
        []
      ) as [any[], any];

      // For each category, get its subcategories
      const result = await Promise.all(
        categories.map(async (category: any) => {
          const [subcategories] = await connection.execute(
            `SELECT qc_afd_id, afd_name, afd_points 
             FROM qc_afd 
             WHERE afd_category_id = ? 
             ORDER BY qc_afd_id`,
            [category.qc_afd_id]
          ) as [any[], any];

          return {
            category_id: category.qc_afd_id,
            category_name: category.afd_name,
            category_points: category.afd_points,
            project_category_id: category.project_category_id,
            subcategories: subcategories.map((sub: any) => ({
              subcategory_id: sub.qc_afd_id,
              subcategory_name: sub.afd_name.trim(),
              subcategory_points: sub.afd_points,
              is_fatal_error: sub.afd_points === 100 && sub.afd_name.toLowerCase().includes('fatal error')
            }))
          };
        })
      );

      return result;
    } finally {
      await connection.end();
    }
  },

  // Get all categories with subcategories for all project types
  getAllCategoriesWithSubcategories: async (): Promise<{ [key: number]: CategoryWithSubcategories[] }> => {
    const connection = await get_db_connection();
    try {
      const result: { [key: number]: CategoryWithSubcategories[] } = {};
      
      // Return all categories for all project types (since project_category_id column doesn't exist)
      for (let i = 1; i <= 5; i++) {
        result[i] = await categoryQueries.getCategoriesByProjectType(i);
      }
      
      return result;
    } finally {
      await connection.end();
    }
  },

  // Check if a subcategory is a fatal error
  isFatalError: async (subcategoryId: number): Promise<boolean> => {
    const connection = await get_db_connection();
    try {
      const [result] = await connection.execute(
        'SELECT afd_points, afd_name FROM qc_afd WHERE qc_afd_id = ?',
        [subcategoryId]
      ) as [any[], any];

      if (result.length === 0) return false;
      
      const subcategory = result[0];
      return subcategory.afd_points === 100 && subcategory.afd_name.toLowerCase().includes('fatal error');
    } finally {
      await connection.end();
    }
  }
};

export default categoryQueries;
