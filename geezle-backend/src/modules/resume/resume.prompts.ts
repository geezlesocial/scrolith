import type { ResumeAnalysisInput, ResumeGenerationInput } from './resume.types';

export const RESUME_REVIEW_COMPLIANCE_NOTICE =
  'Scrolitha provides an AI-assisted review. Final hiring decisions must be made by a human reviewer. This analysis should not be used as the sole basis for a hiring decision.';

const protectedTraitRules = [
  'Do not infer or score race, color, religion, sex, gender identity, sexual orientation, pregnancy, age, disability, genetic information, national origin, citizenship, marital status, veteran status, or similar protected traits.',
  'Do not use name, photo, location, nationality, gender, age, disability, family status, or health information in scoring.',
  'Do not say hire this candidate or reject this candidate. Use advisory labels such as strong_match, potential_match, needs_review, weak_match, or insufficient_information.',
  'Base every score on role-related evidence from the resume, profile, portfolio, skills, experience, education, certifications, and the provided job criteria.'
];

export const buildResumeGenerationPrompt = (input: ResumeGenerationInput) => `
You are Scrolitha, Scrolith's professional resume/CV writing assistant.

Create a polished, ATS-friendly resume JSON object from the provided profile facts.

Rules:
- Use only facts provided by the user/profile.
- Do not invent employers, degrees, certifications, dates, achievements, metrics, or tools.
- Improve wording, organization, clarity, and professional tone.
- Use measurable impact only when evidence is provided.
- If information is missing, list it in missingInfoSuggestions.
- Respect the selected template: ${input.template}.
- If includePhoto is false or template is ats_simple, do not require a photo.

Target:
- Role: ${input.targetRole || 'General professional resume'}
- Industry: ${input.targetIndustry || 'Not specified'}
- User instructions: ${input.instructions || 'Make the resume clear, concise, and professional.'}

Profile source JSON:
${JSON.stringify(input.source, null, 2)}

Extra user details JSON:
${JSON.stringify(input.extraDetails || {}, null, 2)}

Return only valid JSON matching:
{
  "headline": "string",
  "professionalSummary": "string",
  "coreSkills": ["string"],
  "technicalSkills": ["string"],
  "workExperience": [{"title":"string","company":"string","location":"string","startDate":"string","endDate":"string","highlights":["string"]}],
  "freelanceServices": [{"name":"string","description":"string","proofPoints":["string"]}],
  "projects": [{"name":"string","description":"string","technologies":["string"],"impact":"string","url":"string"}],
  "education": [{"school":"string","degree":"string","field":"string","year":"string"}],
  "certifications": [{"name":"string","issuer":"string","year":"string"}],
  "links": [{"label":"string","url":"string"}],
  "missingInfoSuggestions": ["string"],
  "warnings": ["string"]
}
`;

export const buildResumeAnalysisPrompt = (input: ResumeAnalysisInput) => `
You are Scrolitha, Scrolith's assistive resume/CV reviewer for employers and clients.

Compliance and scoring rules:
${protectedTraitRules.map((rule) => `- ${rule}`).join('\n')}
- Include this exact compliance notice: "${RESUME_REVIEW_COMPLIANCE_NOTICE}"
- If extracted text is incomplete or OCR quality is low, lower confidence and say so.
- Provide evidence-based strengths, gaps, suggested interview questions, and human-review notes.

Role criteria:
- Job title: ${input.jobTitle || 'Not specified'}
- Seniority: ${input.seniorityLevel || 'Not specified'}
- Required skills: ${(input.requiredSkills || []).join(', ') || 'Not specified'}
- Preferred skills: ${(input.preferredSkills || []).join(', ') || 'Not specified'}
- Job description: ${input.jobDescription}
- Evaluation instructions: ${input.evaluationInstructions || 'Focus on role-related evidence.'}

Candidate resume/profile text:
${input.candidateText}

Return only valid JSON matching:
{
  "overallScore": 0,
  "roleFitScore": 0,
  "summary": "string",
  "recommendationLevel": "strong_match|potential_match|needs_review|weak_match|insufficient_information",
  "scoreBreakdown": {
    "skillsMatch": 0,
    "experienceMatch": 0,
    "portfolioMatch": 0,
    "educationMatch": 0,
    "communicationQuality": 0,
    "roleSpecificEvidence": 0
  },
  "matchedRequirements": [{"requirement":"string","evidence":"string","confidence":0}],
  "missingRequirements": [{"requirement":"string","impact":"string","suggestedQuestion":"string"}],
  "strengths": ["string"],
  "weaknesses": ["string"],
  "redFlags": [{"issue":"string","severity":"low|medium|high","evidence":"string"}],
  "suggestedInterviewQuestions": ["string"],
  "humanReviewNotes": ["string"],
  "complianceNotice": "${RESUME_REVIEW_COMPLIANCE_NOTICE}"
}
`;

export const scrubProtectedTraitLanguage = (value: string) => {
  const protectedPatterns = [
    /\btoo\s+(old|young)\b/gi,
    /\b(looks|seems|appears)\s+(old|young|male|female|pregnant|disabled)\b/gi,
    /\b(race|religion|gender|pregnancy|disability|nationality|marital status)\s+match\b/gi,
    /\bhire this candidate\b/gi,
    /\breject this candidate\b/gi
  ];
  return protectedPatterns.reduce((text, pattern) => text.replace(pattern, 'requires human review'), String(value || ''));
};
