import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

// AI Configuration for QC Evaluation Analysis
export const AI_CONFIG = {
  model: google('gemini-2.5-flash'),
  defaultOptions: {
    temperature: 0.3, // Lower temperature for consistent analysis
    maxTokens: 1500, // Reasonable limit for detailed feedback
    timeout: 100000, // 60 seconds timeout for Vercel/serverless environments
  }
};

// QC Evaluation Criteria Prompts
export const QC_PROMPTS = {
  // Analyze individual record for compliance
  analyzeRecord: (recordData: any, criteria: any) => `
    You are a QC evaluation AI assistant.
    Return ONLY valid JSON. Do not include markdown, code fences, or extra text.

    Goal: Check whether this record follows the QC evaluation criteria.
    If it fails, specify exactly which criteria failed and why, and point to the field(s) involved.

    RECORD DATA:
    ${JSON.stringify(recordData, null, 2)}

    EVALUATION CRITERIA:
    ${JSON.stringify(criteria, null, 2)}

    Output JSON schema (strict):
    {
      "recordId": "<string|number>",
      "isCompliant": <boolean>,
      "score": <number 0-100>,
      "failedCriteria": [
        {
          "criteria_id": "<string>",
          "criteria_name": "<string>",
          "reason": "<string>",
          "field_paths": ["<string>"]
        }
      ],
      "issues": ["<string>"],
      "missingFields": ["<string>"],
      "suggestions": ["<string>"],
      "detailedFeedback": "<string>"
    }
  `,

  // Analyze multiple records at once (more efficient)
  analyzeRecords: (records: any[], criteria: any) => `
    You are a QC evaluation AI assistant.
    Return ONLY valid JSON. Do not include markdown, code fences, or extra text.

    Goal: For each record, check whether it follows QC evaluation criteria.
    If it fails, specify exactly which criteria failed and why, and point to the field(s) involved.
    
    RECORDS:
    ${records.map((record, index) => `Record ${index + 1}:
    ${JSON.stringify(record, null, 2)}`).join('\n    ')}
    
    EVALUATION CRITERIA:
    ${JSON.stringify(criteria, null, 2)}
    
    Output JSON schema (strict):
    [
      {
        "recordId": "<MUST match input record.id>",
        "isCompliant": <boolean>,
        "score": <number 0-100>,
        "failedCriteria": [
          {
            "criteria_id": "<string>",
            "criteria_name": "<string>",
            "reason": "<string>",
            "field_paths": ["<string>"]
          }
        ],
        "issues": ["<string>"],
        "missingFields": ["<string>"],
        "suggestions": ["<string>"],
        "detailedFeedback": "<string>"
      }
    ]
  `,

  // Generate comprehensive feedback for low scores
  generateFeedback: (evaluationData: any, overallScore: number) => `
    You are a QC evaluation expert.
    Return ONLY valid JSON. Do not include markdown, code fences, or extra text.

    Goal: Provide actionable feedback for user so they can fix the records.
    You MUST mention which criteria were not followed and in which recordId those issues occurred.
    
    EVALUATION SUMMARY:
    Overall Score: ${overallScore}%
    Total Records Evaluated: ${evaluationData.totalRecords}
    Records with Issues: ${evaluationData.recordsWithIssues}
    
    DETAILED ISSUES BY RECORD:
    ${JSON.stringify(evaluationData.issuesByRecord, null, 2)}
    
    Output JSON schema (strict):
    {
      "summary": "<string>",
      "overallScore": <number 0-100>,
      "criteriaNotMet": ["<criteria_id or criteria_name>"],
      "recordIssues": [
        {
          "recordId": "<string|number>",
          "failedCriteria": [
            {
              "criteria_id": "<string>",
              "criteria_name": "<string>",
              "reason": "<string>",
              "field_paths": ["<string>"]
            }
          ],
          "suggestions": ["<string>"]
        }
      ],
      "priorityFixes": [
        {"recordId": "<string|number>", "issue": "<string>", "priority": "high|medium|low", "action": "<string>"}
      ],
      "recommendations": ["<string>"],
      "improvementTips": ["<string>"]
    }
  `,

  // Generate AFD-based feedback for category-specific errors
  generateAFDFeedback: (errorAnalysis: any) => `
    You are a QC evaluation expert specializing in AFD (Area For Defects) analysis.
    Return ONLY valid JSON. Do not include markdown, code fences, or extra text.

    Goal: Provide detailed feedback based on AFD category-specific errors found during QC evaluation.
    Focus on which categories/subcategories had the most issues and provide actionable recommendations.
    
    EVALUATION ANALYSIS:
    Overall Score: ${errorAnalysis.overallScore}%
    Total Records Evaluated: ${errorAnalysis.totalRecords}
    Is Rejected: ${errorAnalysis.isRejected}
    
    ERRORS BY SUBCATEGORY:
    ${JSON.stringify(errorAnalysis.errorsBySubcategory, null, 2)}
    
    FATAL ERRORS:
    ${JSON.stringify(errorAnalysis.fatalErrors, null, 2)}
    
    Output JSON schema (strict):
    {
      "summary": "<string>",
      "overallScore": <number 0-100>,
      "isRejected": <boolean>,
      "categoryAnalysis": [
        {
          "subcategory_name": "<string>",
          "error_count": <number>,
          "is_fatal_error": <boolean>,
          "impact": "<string>",
          "recommendations": ["<string>"]
        }
      ],
      "priorityIssues": [
        {
          "subcategory": "<string>",
          "severity": "high|medium|low",
          "affected_records": <number>,
          "action_required": "<string>"
        }
      ],
      "improvementSuggestions": ["<string>"],
      "nextSteps": ["<string>"]
    }
  `
};

// AI Service Functions
export class AIService {
  private static model = AI_CONFIG.model;

  private static parseJson(text: string) {
    let cleanText = text;
    cleanText = cleanText.replace(/```json\n?/gi, '```');
    if (cleanText.includes('```')) {
      cleanText = cleanText.replace(/```\n?([\s\S]*?)```/g, '$1').trim();
    }

    try {
      return JSON.parse(cleanText);
    } catch {
      const firstObj = cleanText.indexOf('{');
      const lastObj = cleanText.lastIndexOf('}');
      const firstArr = cleanText.indexOf('[');
      const lastArr = cleanText.lastIndexOf(']');

      if (firstArr !== -1 && lastArr !== -1 && (firstObj === -1 || firstArr < firstObj)) {
        return JSON.parse(cleanText.slice(firstArr, lastArr + 1));
      }
      if (firstObj !== -1 && lastObj !== -1) {
        return JSON.parse(cleanText.slice(firstObj, lastObj + 1));
      }
      throw new Error('AI returned non-JSON response');
    }
  }

  // Analyze a single record against criteria
  static async analyzeRecord(recordData: any, criteria: any) {
    try {
      const { text } = await generateText({
        model: this.model,
        prompt: QC_PROMPTS.analyzeRecord(recordData, criteria),
        ...AI_CONFIG.defaultOptions,
      });

      return this.parseJson(text);
    } catch (error) {
      console.error('Error analyzing record with AI:', error);
      throw new Error('Failed to analyze record with AI');
    }
  }

  // Analyze multiple records at once (more efficient)
  static async analyzeRecords(records: any[], criteria: any) {
    try {
      const { text } = await generateText({
        model: this.model,
        prompt: QC_PROMPTS.analyzeRecords(records, criteria),
        ...AI_CONFIG.defaultOptions,
      });

      return this.parseJson(text);
    } catch (error) {
      console.error('Error analyzing records with AI:', error);
      throw new Error('Failed to analyze records with AI');
    }
  }

  // Generate comprehensive feedback for evaluation results
  static async generateEvaluationFeedback(evaluationData: any, overallScore: number) {
    try {
      const { text } = await generateText({
        model: this.model,
        prompt: QC_PROMPTS.generateFeedback(evaluationData, overallScore),
        ...AI_CONFIG.defaultOptions,
      });

      return this.parseJson(text);
    } catch (error) {
      console.error('Error generating AI feedback:', error);
      throw new Error('Failed to generate AI feedback');
    }
  }

  // Generate AFD-based feedback for category-specific errors
  static async generateAFDEvaluationFeedback(errorAnalysis: any) {
    try {
      const { text } = await generateText({
        model: this.model,
        prompt: QC_PROMPTS.generateAFDFeedback(errorAnalysis),
        ...AI_CONFIG.defaultOptions,
      });

      return this.parseJson(text);
    } catch (error) {
      console.error('Error generating AFD AI feedback:', error);
      throw new Error('Failed to generate AFD AI feedback');
    }
  }

  // Evaluate Excel data with custom prompt
  static async evaluateData(prompt: string) {
    try {
      const { text } = await generateText({
        model: this.model,
        prompt: prompt,
        ...AI_CONFIG.defaultOptions,
      });

      return this.parseJson(text);
    } catch (error) {
      console.error('Error evaluating data with AI:', error);
      throw new Error('Failed to evaluate data with AI');
    }
  }

  // Check if AI is properly configured
  static isConfigured(): boolean {
    return !!(process.env.GOOGLE_GENERATIVE_AI_API_KEY && AI_CONFIG.model);
  }
}

export default AIService;