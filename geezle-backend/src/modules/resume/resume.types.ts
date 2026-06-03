export type ResumeTemplate = 'professional' | 'modern' | 'executive' | 'creative' | 'ats_simple';

export type ResumeProfileSource = {
  name: string;
  title: string;
  bio: string;
  skills: string[];
  services: any[];
  portfolio: any[];
  education: any[];
  certifications: any[];
  workHistory: any[];
  location: string;
  profilePhotoUrl: string;
  links: Array<{ label: string; url: string }>;
};

export type ResumeGenerationOutput = {
  headline: string;
  professionalSummary: string;
  coreSkills: string[];
  technicalSkills: string[];
  workExperience: Array<{
    title: string;
    company?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    highlights: string[];
  }>;
  freelanceServices: Array<{
    name: string;
    description: string;
    proofPoints: string[];
  }>;
  projects: Array<{
    name: string;
    description: string;
    technologies?: string[];
    impact?: string;
    url?: string;
  }>;
  education: Array<{
    school: string;
    degree?: string;
    field?: string;
    year?: string;
  }>;
  certifications: Array<{
    name: string;
    issuer?: string;
    year?: string;
  }>;
  links: Array<{
    label: string;
    url: string;
  }>;
  missingInfoSuggestions: string[];
  warnings?: string[];
};

export type ResumeAnalysisOutput = {
  overallScore: number;
  roleFitScore: number;
  summary: string;
  recommendationLevel: 'strong_match' | 'potential_match' | 'needs_review' | 'weak_match' | 'insufficient_information';
  scoreBreakdown: {
    skillsMatch: number;
    experienceMatch: number;
    portfolioMatch: number;
    educationMatch: number;
    communicationQuality: number;
    roleSpecificEvidence: number;
  };
  matchedRequirements: Array<{
    requirement: string;
    evidence: string;
    confidence: number;
  }>;
  missingRequirements: Array<{
    requirement: string;
    impact: string;
    suggestedQuestion: string;
  }>;
  strengths: string[];
  weaknesses: string[];
  redFlags: Array<{
    issue: string;
    severity: 'low' | 'medium' | 'high';
    evidence: string;
  }>;
  suggestedInterviewQuestions: string[];
  humanReviewNotes: string[];
  complianceNotice: string;
};

export type ResumeGenerationInput = {
  userId: string;
  userRole?: string;
  targetRole?: string;
  targetIndustry?: string;
  template: ResumeTemplate;
  includePhoto: boolean;
  source: ResumeProfileSource;
  extraDetails?: Record<string, any>;
  instructions?: string;
};

export type ResumeAnalysisInput = {
  userId: string;
  userRole?: string;
  jobTitle?: string;
  jobDescription: string;
  requiredSkills: string[];
  preferredSkills: string[];
  seniorityLevel?: string;
  evaluationInstructions?: string;
  candidateText: string;
  sourceType: 'upload' | 'profile_url' | 'pasted_text';
};

export type ProgressEvent = {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  step: string;
  progress: number;
  message: string;
};
