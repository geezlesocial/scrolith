import { z } from 'zod';

export const resumeTemplates = ['professional', 'modern', 'executive', 'creative', 'ats_simple'] as const;

const csvOrArray = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}, z.array(z.string()).default([]));

export const generateResumeSchema = z.object({
  targetRole: z.string().trim().max(160).optional().default(''),
  targetIndustry: z.string().trim().max(160).optional().default(''),
  template: z.enum(resumeTemplates).optional().default('professional'),
  includePhoto: z.boolean().optional().default(false),
  extraDetails: z.record(z.any()).optional().default({}),
  instructions: z.string().trim().max(4000).optional().default('')
});

export const updateResumeSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  targetRole: z.string().trim().max(160).optional(),
  targetIndustry: z.string().trim().max(160).optional(),
  template: z.enum(resumeTemplates).optional(),
  includePhoto: z.boolean().optional(),
  photoUrl: z.string().trim().max(1000).optional().nullable(),
  editableData: z.record(z.any()).optional(),
  aiOutput: z.record(z.any()).optional()
});

export const regenerateResumeSchema = z.object({
  instructions: z.string().trim().max(4000).optional().default(''),
  editableData: z.record(z.any()).optional()
});

export const reviewProfileUrlSchema = z.object({
  profileUrl: z.string().trim().url(),
  jobTitle: z.string().trim().max(180).optional().default(''),
  jobDescription: z.string().trim().min(10).max(12000),
  requiredSkills: csvOrArray,
  preferredSkills: csvOrArray,
  seniorityLevel: z.string().trim().max(120).optional().default(''),
  evaluationInstructions: z.string().trim().max(4000).optional().default('')
});

export const reviewUploadFieldsSchema = z.object({
  jobTitle: z.string().trim().max(180).optional().default(''),
  jobDescription: z.string().trim().min(10).max(12000),
  requiredSkills: csvOrArray,
  preferredSkills: csvOrArray,
  seniorityLevel: z.string().trim().max(120).optional().default(''),
  evaluationInstructions: z.string().trim().max(4000).optional().default('')
});

export const allowedResumeMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp'
]);

export const MAX_RESUME_UPLOAD_BYTES = 10 * 1024 * 1024;
