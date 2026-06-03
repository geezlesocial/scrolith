import { ScrolithaService } from '../scrolitha/inference/scrolitha.service';
import type { ResumeAnalysisInput, ResumeAnalysisOutput, ResumeGenerationInput, ResumeGenerationOutput } from './resume.types';
import { RESUME_REVIEW_COMPLIANCE_NOTICE, buildResumeAnalysisPrompt, buildResumeGenerationPrompt, scrubProtectedTraitLanguage } from './resume.prompts';

const clampScore = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const stringArray = (value: unknown, fallback: string[] = []) => {
  if (!Array.isArray(value)) return fallback;
  return value.map((item) => scrubProtectedTraitLanguage(String(item || '').trim())).filter(Boolean).slice(0, 20);
};

const extractJson = (text: string): any | null => {
  const source = String(text || '').trim();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    // Continue with fenced/object extraction.
  }

  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Continue with object extraction.
    }
  }

  const first = source.indexOf('{');
  const last = source.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(source.slice(first, last + 1));
    } catch {
      return null;
    }
  }
  return null;
};

const makeActor = (userId: string, role?: string) => {
  const normalizedRole = String(role || 'USER').toUpperCase();
  return {
    id: userId,
    role: normalizedRole,
    scope: normalizedRole.includes('ADMIN') ? 'admin' : 'user',
    isAdmin: normalizedRole.includes('ADMIN')
  } as any;
};

const normalizeResumeOutput = (input: ResumeGenerationInput, raw: any): ResumeGenerationOutput => {
  const source = input.source || ({} as any);
  const extra = input.extraDetails || {};
  const fallbackSkills = [...(source.skills || []), ...stringArray((extra as any).skills)].filter(Boolean);
  const projects = Array.isArray(raw?.projects) ? raw.projects : Array.isArray(source.portfolio) ? source.portfolio : [];
  const warnings: string[] = [];

  if (input.includePhoto && !source.profilePhotoUrl && input.template !== 'ats_simple') {
    warnings.push('No profile photo found. Resume generated without photo.');
  }

  return {
    headline: String(raw?.headline || input.targetRole || source.title || 'Professional Freelancer').trim(),
    professionalSummary: String(raw?.professionalSummary || raw?.summary || source.bio || (extra as any).summary || 'Experienced professional focused on clear delivery and measurable client outcomes.').trim(),
    coreSkills: stringArray(raw?.coreSkills, fallbackSkills.slice(0, 10)),
    technicalSkills: stringArray(raw?.technicalSkills, fallbackSkills.slice(0, 12)),
    workExperience: Array.isArray(raw?.workExperience) ? raw.workExperience.slice(0, 8) : Array.isArray(source.workHistory) ? source.workHistory.slice(0, 8) : [],
    freelanceServices: Array.isArray(raw?.freelanceServices) ? raw.freelanceServices.slice(0, 8) : Array.isArray(source.services) ? source.services.slice(0, 8) : [],
    projects: projects.slice(0, 10).map((project: any, index: number) => ({
      name: String(project?.name || project?.title || `Project ${index + 1}`).trim(),
      description: String(project?.description || project?.summary || project?.content || '').trim(),
      technologies: stringArray(project?.technologies || project?.skills || []),
      impact: String(project?.impact || '').trim(),
      url: String(project?.url || project?.link || '').trim()
    })),
    education: Array.isArray(raw?.education) ? raw.education.slice(0, 8) : Array.isArray(source.education) ? source.education.slice(0, 8) : [],
    certifications: Array.isArray(raw?.certifications) ? raw.certifications.slice(0, 8) : Array.isArray(source.certifications) ? source.certifications.slice(0, 8) : [],
    links: Array.isArray(raw?.links) ? raw.links.slice(0, 8) : Array.isArray(source.links) ? source.links.slice(0, 8) : [],
    missingInfoSuggestions: stringArray(raw?.missingInfoSuggestions, [
      'Add measurable project outcomes where available.',
      'Add date ranges for recent work experience.',
      'Add certifications or education details if relevant to the target role.'
    ]),
    warnings: [...stringArray(raw?.warnings), ...warnings]
  };
};

const keywordScore = (needles: string[], haystack: string) => {
  const text = String(haystack || '').toLowerCase();
  const normalized = needles.map((item) => item.toLowerCase().trim()).filter(Boolean);
  if (!normalized.length) return 60;
  const matched = normalized.filter((item) => text.includes(item));
  return clampScore((matched.length / normalized.length) * 100);
};

const normalizeAnalysisOutput = (input: ResumeAnalysisInput, raw: any): ResumeAnalysisOutput => {
  const required = input.requiredSkills || [];
  const preferred = input.preferredSkills || [];
  const skillsMatch = clampScore(raw?.scoreBreakdown?.skillsMatch || keywordScore(required, input.candidateText));
  const preferredScore = keywordScore(preferred, input.candidateText);
  const roleEvidenceScore = clampScore(raw?.scoreBreakdown?.roleSpecificEvidence || keywordScore([input.jobTitle || '', ...required], input.candidateText));
  const communicationQuality = clampScore(raw?.scoreBreakdown?.communicationQuality || Math.min(85, Math.max(35, input.candidateText.length / 40)));
  const experienceMatch = clampScore(raw?.scoreBreakdown?.experienceMatch || keywordScore(['experience', 'project', 'client', 'delivered', ...required.slice(0, 3)], input.candidateText));
  const portfolioMatch = clampScore(raw?.scoreBreakdown?.portfolioMatch || keywordScore(['portfolio', 'project', 'github', 'case study'], input.candidateText));
  const educationMatch = clampScore(raw?.scoreBreakdown?.educationMatch || keywordScore(['degree', 'certification', 'certificate', 'education'], input.candidateText));
  const roleFitScore = clampScore(raw?.roleFitScore || Math.round((skillsMatch * 0.35) + (experienceMatch * 0.25) + (roleEvidenceScore * 0.25) + (preferredScore * 0.15)));
  const overallScore = clampScore(raw?.overallScore || Math.round((roleFitScore * 0.75) + (communicationQuality * 0.25)));

  const recommendationLevel =
    raw?.recommendationLevel ||
    (input.candidateText.trim().length < 200
      ? 'insufficient_information'
      : overallScore >= 82
        ? 'strong_match'
        : overallScore >= 65
          ? 'potential_match'
          : overallScore >= 45
            ? 'needs_review'
            : 'weak_match');

  const matchedRequirements = Array.isArray(raw?.matchedRequirements)
    ? raw.matchedRequirements
    : required
        .filter((skill) => input.candidateText.toLowerCase().includes(skill.toLowerCase()))
        .slice(0, 8)
        .map((skill) => ({ requirement: skill, evidence: `The resume/profile references ${skill}.`, confidence: 75 }));

  const missingRequirements = Array.isArray(raw?.missingRequirements)
    ? raw.missingRequirements
    : required
        .filter((skill) => !input.candidateText.toLowerCase().includes(skill.toLowerCase()))
        .slice(0, 8)
        .map((skill) => ({
          requirement: skill,
          impact: 'No direct evidence was found in the submitted resume/profile.',
          suggestedQuestion: `Can you describe your hands-on experience with ${skill}?`
        }));

  return {
    overallScore,
    roleFitScore,
    summary: scrubProtectedTraitLanguage(String(raw?.summary || 'Scrolitha reviewed the provided candidate evidence against the role criteria. Use this report to guide a human interview and verification process.')),
    recommendationLevel,
    scoreBreakdown: {
      skillsMatch,
      experienceMatch,
      portfolioMatch,
      educationMatch,
      communicationQuality,
      roleSpecificEvidence: roleEvidenceScore
    },
    matchedRequirements,
    missingRequirements,
    strengths: stringArray(raw?.strengths, matchedRequirements.length ? matchedRequirements.map((item: any) => `Evidence found for ${item.requirement}.`) : ['Candidate material is available for human review.']),
    weaknesses: stringArray(raw?.weaknesses, missingRequirements.length ? missingRequirements.map((item: any) => `Missing direct evidence for ${item.requirement}.`) : ['Verify role-specific depth in interview.']),
    redFlags: Array.isArray(raw?.redFlags) ? raw.redFlags.slice(0, 8) : [],
    suggestedInterviewQuestions: stringArray(raw?.suggestedInterviewQuestions, [
      'Which recent project best demonstrates your fit for this role?',
      'What production constraints did you handle in that project?',
      'Which skills from the role requirements are strongest for you, and which need support?'
    ]),
    humanReviewNotes: stringArray(raw?.humanReviewNotes, [
      'Verify claims with portfolio samples, references, or work examples.',
      'Use consistent interview criteria across candidates.'
    ]),
    complianceNotice: RESUME_REVIEW_COMPLIANCE_NOTICE
  };
};

export const ResumeAiService = {
  async generateResume(input: ResumeGenerationInput): Promise<ResumeGenerationOutput> {
    const result = await ScrolithaService.generate({
      scope: 'user',
      actor: makeActor(input.userId, input.userRole),
      prompt: buildResumeGenerationPrompt(input),
      system: 'You are Scrolitha. Return valid JSON only.',
      maxTokens: 3500,
      temperature: 0.35
    });
    return normalizeResumeOutput(input, extractJson(result.text));
  },

  async analyzeResume(input: ResumeAnalysisInput): Promise<ResumeAnalysisOutput> {
    const result = await ScrolithaService.generate({
      scope: 'user',
      actor: makeActor(input.userId, input.userRole),
      prompt: buildResumeAnalysisPrompt(input),
      system: 'You are Scrolitha. Return valid JSON only and follow employment compliance rules.',
      maxTokens: 3500,
      temperature: 0.2
    });
    return normalizeAnalysisOutput(input, extractJson(result.text));
  }
};
