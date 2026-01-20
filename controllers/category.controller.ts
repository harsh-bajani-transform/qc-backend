import { Request, Response } from 'express';
import categoryQueries from '../queries/category-queries';

// Get all project categories
export const getProjectCategories = async (req: Request, res: Response) => {
  try {
    const categories = await categoryQueries.getProjectCategories();
    
    res.status(200).json({
      success: true,
      message: 'Project categories retrieved successfully',
      data: categories
    });
  } catch (error) {
    console.error('Error getting project categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving project categories',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get categories and subcategories for a specific project type
export const getCategoriesByProjectType = async (req: Request, res: Response) => {
  try {
    const { project_category_id } = req.params;
    
    if (!project_category_id || isNaN(Number(project_category_id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid project_category_id is required'
      });
    }

    const categories = await categoryQueries.getCategoriesByProjectType(Number(project_category_id));
    
    res.status(200).json({
      success: true,
      message: 'Categories retrieved successfully',
      data: categories
    });
  } catch (error) {
    console.error('Error getting categories by project type:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving categories',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get all categories with subcategories for all project types
export const getAllCategoriesWithSubcategories = async (req: Request, res: Response) => {
  try {
    const allCategories = await categoryQueries.getAllCategoriesWithSubcategories();
    
    res.status(200).json({
      success: true,
      message: 'All categories with subcategories retrieved successfully',
      data: allCategories
    });
  } catch (error) {
    console.error('Error getting all categories:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving all categories',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
