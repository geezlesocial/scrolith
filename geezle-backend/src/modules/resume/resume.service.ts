import { createHmac } from 'crypto';
import prisma from '../../utils/prismaClient';
import { ResumeAiService } from './resume.ai.service';
import { ResumeParserService } from './resume.parser.service';
import { ResumePdfService } from './resume.pdf.service';
import { RESUME_REVIEW_COMPLIANCE_NOTICE } from './resume.prompts';
import { ResumeStorageService } from './resume.storage.service';
import { requiredSecret } from '../../utils/security/requiredSecret';
import type { ProgressEvent, ResumeAnalysisInput, ResumeProfileSource, ResumeTemplate } from './resume.types';

const prismaAny = prisma as any;

const normalizeRole = (role?: string) => String(role || '').toUpperCase();
export const isAdminRole = (role?: string) => normalizeRole(role).includes('ADMIN');
export const isFreelancerRole = (role?: string) => {
  const normalized = normalizeRole(role);
  return normalized.includes('FREELANCER') || normalized.includes('USER') || isAdminRole(role);
};
export const isClientRole = (role?: string) => {
  const normalized = normalizeRole(role);
  return normalized.includes('CLIENT') || normalized.includes('EMPLOYER') || isAdminRole(role);
};

const asArray = (value: any): any[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
};

const compact = (items: Array<string | undefined | null>) => items.map((item) => String(item || '').trim()).filter(Boolean);

const normalizeProfileSource = async (userId: string): Promise<ResumeProfileSource> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true }
  });
  if (!user) throw new Error('User not found.');

  const gigs = await prisma.gig.findMany({
    where: { userId, isActive: true },
    take: 8,
    orderBy: { updatedAt: 'desc' },
    select: { title: true, description: true, tags: true, slug: true, price: true, rating: true, reviewCount: true }
  });

  const profile = user.profile;
  const links = [
    { label: 'Portfolio', url: profile?.portfolioUrl || '' },
    { label: 'GitHub', url: profile?.githubUrl || '' },
    { label: 'LinkedIn', url: profile?.linkedinUrl || '' },
    { label: 'Website', url: profile?.websiteUrl || '' }
  ].filter((item) => item.url);

  return {
    name: user.name || user.username || 'Scrolith Professional',
    title: profile?.title || '',
    bio: profile?.bio || '',
    skills: Array.isArray(profile?.skills) ? profile.skills : [],
    services: gigs.map((gig) => ({
      name: gig.title,
      description: gig.description,
      proofPoints: compact([gig.rating ? `${gig.rating} rating` : '', gig.reviewCount ? `${gig.reviewCount} reviews` : '']),
      tags: gig.tags,
      url: gig.slug ? `https://scrolith.com/gigs/${gig.slug}` : ''
    })),
    portfolio: asArray(profile?.portfolio),
    education: asArray(profile?.educationItems).length ? asArray(profile?.educationItems) : asArray(profile?.education),
    certifications: asArray(profile?.certifications),
    workHistory: asArray(profile?.experienceItems).length ? asArray(profile?.experienceItems) : asArray(profile?.experience),
    location: compact([profile?.city, profile?.state, profile?.country]).join(', ') || profile?.location || '',
    profilePhotoUrl: user.avatar || profile?.coverPhotoUrl || '',
    links
  };
};

const makeResumeTitle = (targetRole?: string, template?: string) => {
  const role = String(targetRole || '').trim();
  if (role) return `${role} Resume`;
  return `${template || 'Professional'} Resume`;
};

const nextVersionNumber = async (resumeId: string) => {
  const latest = await prismaAny.resumeVersion.findFirst({
    where: { resumeId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true }
  });
  return Number(latest?.versionNumber || 0) + 1;
};

const createVersion = async (resume: any, reason: string, prompt?: string) => {
  await prismaAny.resumeVersion.create({
    data: {
      resumeId: resume.id,
      versionNumber: await nextVersionNumber(resume.id),
      changeReason: reason,
      prompt: prompt || null,
      editableData: resume.editableData || null,
      aiOutput: resume.aiOutput || null,
      pdfUrl: resume.pdfUrl || null,
      pdfStorageKey: resume.pdfStorageKey || null
    }
  });
};

const requireOwnedResume = async (userId: string, resumeId: string) => {
  const resume = await prismaAny.resumeDocument.findFirst({
    where: { id: resumeId, userId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 10 } }
  });
  if (!resume) throw new Error('Resume not found.');
  return resume;
};

const candidateTextFromProfileSource = (source: ResumeProfileSource) => [
  source.name,
  source.title,
  source.bio,
  source.location,
  `Skills: ${source.skills.join(', ')}`,
  `Services: ${JSON.stringify(source.services)}`,
  `Portfolio: ${JSON.stringify(source.portfolio)}`,
  `Work history: ${JSON.stringify(source.workHistory)}`,
  `Education: ${JSON.stringify(source.education)}`,
  `Certifications: ${JSON.stringify(source.certifications)}`,
  `Links: ${JSON.stringify(source.links)}`
].join('\n');

const resolveProfileUrlSource = async (profileUrl: string): Promise<ResumeProfileSource> => {
  let parsed: URL;
  try {
    parsed = new URL(profileUrl);
  } catch {
    throw new Error('Invalid Scrolith profile URL.');
  }

  const allowedHost = parsed.hostname === 'scrolith.com' || parsed.hostname === 'www.scrolith.com' || parsed.hostname.endsWith('.scrolith.com');
  if (!allowedHost) throw new Error('Only Scrolith profile URLs are supported.');

  const parts = parsed.pathname.split('/').filter(Boolean);
  const marker = parts[0]?.toLowerCase();
  const candidate = parts[1] || parts[0] || '';
  if (!candidate || !['profile', 'freelancer', 'u'].includes(marker)) {
    throw new Error('Unsupported Scrolith profile URL format.');
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { id: candidate },
        { username: candidate }
      ]
    },
    select: { id: true }
  });
  if (!user) throw new Error('This profile is private or unavailable for resume review.');
  return normalizeProfileSource(user.id);
};

export const ResumeService = {
  async getProfileSource(userId: string) {
    return normalizeProfileSource(userId);
  },

  async listResumes(userId: string) {
    return prismaAny.resumeDocument.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 3 } }
    });
  },

  async getResume(userId: string, resumeId: string) {
    return requireOwnedResume(userId, resumeId);
  },

  async generateResume(userId: string, role: string | undefined, input: any) {
    const source = await normalizeProfileSource(userId);
    const template = (input.template || 'professional') as ResumeTemplate;
    const includePhoto = Boolean(input.includePhoto) && template !== 'ats_simple';
    const aiOutput = await ResumeAiService.generateResume({
      userId,
      userRole: role,
      targetRole: input.targetRole,
      targetIndustry: input.targetIndustry,
      template,
      includePhoto,
      source,
      extraDetails: input.extraDetails || {},
      instructions: input.instructions || ''
    });

    const resume = await prismaAny.resumeDocument.create({
      data: {
        userId,
        freelancerId: userId,
        title: makeResumeTitle(input.targetRole, template),
        targetRole: input.targetRole || null,
        targetIndustry: input.targetIndustry || null,
        template,
        includePhoto,
        photoUrl: includePhoto ? source.profilePhotoUrl || null : null,
        status: 'generated',
        sourceSnapshot: source,
        editableData: input.extraDetails || {},
        aiOutput
      }
    });
    await createVersion(resume, 'generated', input.instructions || '');
    return requireOwnedResume(userId, resume.id);
  },

  async updateResume(userId: string, resumeId: string, input: any) {
    const existing = await requireOwnedResume(userId, resumeId);
    const updated = await prismaAny.resumeDocument.update({
      where: { id: existing.id },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.targetRole !== undefined ? { targetRole: input.targetRole || null } : {}),
        ...(input.targetIndustry !== undefined ? { targetIndustry: input.targetIndustry || null } : {}),
        ...(input.template ? { template: input.template } : {}),
        ...(input.includePhoto !== undefined ? { includePhoto: Boolean(input.includePhoto) } : {}),
        ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl || null } : {}),
        ...(input.editableData !== undefined ? { editableData: input.editableData } : {}),
        ...(input.aiOutput !== undefined ? { aiOutput: input.aiOutput } : {})
      }
    });
    await createVersion(updated, 'manual_update');
    return requireOwnedResume(userId, resumeId);
  },

  async regenerateResume(userId: string, role: string | undefined, resumeId: string, input: any) {
    const existing = await requireOwnedResume(userId, resumeId);
    const source = (existing.sourceSnapshot || await normalizeProfileSource(userId)) as ResumeProfileSource;
    const editableData = input.editableData || existing.editableData || {};
    const aiOutput = await ResumeAiService.generateResume({
      userId,
      userRole: role,
      targetRole: existing.targetRole,
      targetIndustry: existing.targetIndustry,
      template: existing.template,
      includePhoto: existing.includePhoto,
      source,
      extraDetails: editableData,
      instructions: input.instructions || ''
    });
    const updated = await prismaAny.resumeDocument.update({
      where: { id: existing.id },
      data: { editableData, aiOutput, status: 'generated' }
    });
    await createVersion(updated, 'regenerated', input.instructions || '');
    return requireOwnedResume(userId, resumeId);
  },

  async renderPdf(userId: string, resumeId: string) {
    const resume = await requireOwnedResume(userId, resumeId);
    const source = (resume.sourceSnapshot || await normalizeProfileSource(userId)) as ResumeProfileSource;
    const pdf = await ResumePdfService.renderPdf({
      profile: source,
      resume: resume.aiOutput,
      template: resume.template,
      includePhoto: Boolean(resume.includePhoto),
      photoUrl: resume.photoUrl,
      targetRole: resume.targetRole
    });
    const fileName = `scrolith-resume-${userId}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const key = ResumeStorageService.makeKey({ userId, kind: 'pdf', fileName });
    const stored = await ResumeStorageService.saveBuffer({ key, buffer: pdf, contentType: 'application/pdf' });
    const updated = await prismaAny.resumeDocument.update({
      where: { id: resume.id },
      data: {
        status: 'exported',
        pdfStorageKey: stored.storageKey,
        pdfUrl: `/api/freelancer/resumes/${resume.id}/download`
      }
    });
    await createVersion(updated, 'pdf_rendered');
    return { resume: updated, pdfStorageKey: stored.storageKey, fileName };
  },

  async getResumeDownload(userId: string, resumeId: string) {
    const resume = await requireOwnedResume(userId, resumeId);
    if (!resume.pdfStorageKey) throw new Error('PDF has not been generated yet.');
    return {
      stream: ResumeStorageService.createReadStream(resume.pdfStorageKey),
      fileName: `scrolith-resume-${resume.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`
    };
  },

  async deleteResume(userId: string, resumeId: string) {
    const resume = await requireOwnedResume(userId, resumeId);
    await ResumeStorageService.delete(resume.pdfStorageKey);
    await prismaAny.resumeDocument.delete({ where: { id: resume.id } });
    return true;
  },

  /**
   * Public share without schema change: HMAC token + flag in editableData.publicShare.
   * Import architecture: profile-source remains the supported import; JSON import stub accepts profile snapshot.
   */
  buildShareToken(resumeId: string) {
    const secret = String(process.env.RESUME_SHARE_SECRET || requiredSecret('JWT_SECRET', 'scrolith-resume-share')).trim();
    const sig = createHmac('sha256', secret).update(String(resumeId)).digest('hex').slice(0, 32);
    return `${resumeId}.${sig}`;
  },

  verifyShareToken(token: string): string | null {
    const raw = String(token || '').trim();
    const [resumeId, sig] = raw.split('.');
    if (!resumeId || !sig) return null;
    const expected = this.buildShareToken(resumeId);
    return expected === raw ? resumeId : null;
  },

  async setPublicShare(userId: string, resumeId: string, enabled: boolean) {
    const resume = await requireOwnedResume(userId, resumeId);
    const editableData =
      resume.editableData && typeof resume.editableData === 'object' ? { ...(resume.editableData as any) } : {};
    const token = this.buildShareToken(resume.id);
    editableData.publicShare = {
      enabled: Boolean(enabled),
      token,
      updatedAt: new Date().toISOString()
    };
    const updated = await prismaAny.resumeDocument.update({
      where: { id: resume.id },
      data: { editableData },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 10 } }
    });
    return {
      resume: updated,
      shareEnabled: Boolean(enabled),
      shareToken: enabled ? token : null,
      sharePath: enabled ? `/api/resume/shared/${encodeURIComponent(token)}` : null
    };
  },

  async getSharedResume(token: string) {
    const resumeId = this.verifyShareToken(token);
    if (!resumeId) throw new Error('Invalid share link.');
    const resume = await prismaAny.resumeDocument.findUnique({
      where: { id: resumeId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 5 } }
    });
    if (!resume) throw new Error('Resume not found.');
    const share = (resume.editableData as any)?.publicShare;
    if (!share?.enabled || String(share.token || '') !== String(token)) {
      throw new Error('This resume is not shared publicly.');
    }
    // Public payload: no internal storage keys.
    return {
      id: resume.id,
      title: resume.title,
      targetRole: resume.targetRole,
      targetIndustry: resume.targetIndustry,
      template: resume.template,
      includePhoto: resume.includePhoto,
      photoUrl: resume.photoUrl,
      status: resume.status,
      aiOutput: resume.aiOutput,
      sourceSnapshot: resume.sourceSnapshot
        ? {
            name: (resume.sourceSnapshot as any).name,
            title: (resume.sourceSnapshot as any).title,
            location: (resume.sourceSnapshot as any).location,
            skills: (resume.sourceSnapshot as any).skills,
            bio: (resume.sourceSnapshot as any).bio
          }
        : null,
      updatedAt: resume.updatedAt,
      versions: (resume.versions || []).map((v: any) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        changeReason: v.changeReason,
        createdAt: v.createdAt
      }))
    };
  },

  async importProfileSnapshot(userId: string, snapshot: any) {
    // Future-ready import architecture: accepts a normalized profile snapshot without external OAuth yet.
    const source = await normalizeProfileSource(userId);
    return {
      mode: 'profile_snapshot',
      supportedSources: ['scrolith_profile', 'json_snapshot'],
      plannedSources: ['linkedin', 'github'],
      imported: {
        ...source,
        ...(snapshot && typeof snapshot === 'object'
          ? {
              title: snapshot.title || source.title,
              bio: snapshot.bio || source.bio,
              skills: Array.isArray(snapshot.skills) ? snapshot.skills : source.skills
            }
          : {})
      }
    };
  },

  async listVersions(userId: string, resumeId: string) {
    const resume = await requireOwnedResume(userId, resumeId);
    return resume.versions || [];
  },

  async listAnalyses(clientId: string) {
    return prismaAny.resumeAnalysis.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
  },

  async getAnalysis(clientId: string, analysisId: string) {
    const analysis = await prismaAny.resumeAnalysis.findFirst({ where: { id: analysisId, clientId } });
    if (!analysis) throw new Error('Resume review not found.');
    return analysis;
  },

  async createAnalysisFromUpload(clientId: string, role: string | undefined, file: Express.Multer.File, fields: any) {
    const parsed = await ResumeParserService.parseUpload(file);
    const key = ResumeStorageService.makeKey({ userId: clientId, kind: 'uploads', fileName: file.originalname || 'resume-upload' });
    await ResumeStorageService.saveBuffer({ key, buffer: file.buffer, contentType: parsed.detectedMimeType });

    const analysis = await prismaAny.resumeAnalysis.create({
      data: {
        clientId,
        jobTitle: fields.jobTitle || null,
        jobDescription: fields.jobDescription,
        requiredSkills: fields.requiredSkills || [],
        preferredSkills: fields.preferredSkills || [],
        seniorityLevel: fields.seniorityLevel || null,
        sourceType: 'upload',
        sourceFileName: file.originalname || null,
        sourceMimeType: parsed.detectedMimeType,
        sourceFileUrl: key,
        extractedText: parsed.text,
        status: 'processing'
      }
    });

    return this.completeAnalysis(clientId, role, analysis.id, {
      jobTitle: fields.jobTitle,
      jobDescription: fields.jobDescription,
      requiredSkills: fields.requiredSkills || [],
      preferredSkills: fields.preferredSkills || [],
      seniorityLevel: fields.seniorityLevel,
      evaluationInstructions: [
        fields.evaluationInstructions || '',
        ...parsed.qualityWarnings
      ].filter(Boolean).join('\n'),
      candidateText: parsed.text || parsed.qualityWarnings.join('\n'),
      sourceType: 'upload'
    });
  },

  async createAnalysisFromProfileUrl(clientId: string, role: string | undefined, input: any) {
    const source = await resolveProfileUrlSource(input.profileUrl);
    const analysis = await prismaAny.resumeAnalysis.create({
      data: {
        clientId,
        jobTitle: input.jobTitle || null,
        jobDescription: input.jobDescription,
        requiredSkills: input.requiredSkills || [],
        preferredSkills: input.preferredSkills || [],
        seniorityLevel: input.seniorityLevel || null,
        sourceType: 'profile_url',
        profileUrl: input.profileUrl,
        extractedText: candidateTextFromProfileSource(source),
        normalizedCandidate: source,
        status: 'processing'
      }
    });

    return this.completeAnalysis(clientId, role, analysis.id, {
      jobTitle: input.jobTitle,
      jobDescription: input.jobDescription,
      requiredSkills: input.requiredSkills || [],
      preferredSkills: input.preferredSkills || [],
      seniorityLevel: input.seniorityLevel,
      evaluationInstructions: input.evaluationInstructions || '',
      candidateText: candidateTextFromProfileSource(source),
      sourceType: 'profile_url'
    });
  },

  async completeAnalysis(clientId: string, role: string | undefined, analysisId: string, input: Omit<ResumeAnalysisInput, 'userId' | 'userRole'>) {
    try {
      const result = await ResumeAiService.analyzeResume({
        userId: clientId,
        userRole: role,
        ...input
      });
      return prismaAny.resumeAnalysis.update({
        where: { id: analysisId },
        data: {
          analysisResult: result,
          overallScore: result.overallScore,
          roleFitScore: result.roleFitScore,
          status: 'completed',
          errorMessage: null
        }
      });
    } catch (error: any) {
      return prismaAny.resumeAnalysis.update({
        where: { id: analysisId },
        data: {
          status: 'failed',
          errorMessage: error?.message || 'Resume review failed.',
          analysisResult: {
            complianceNotice: RESUME_REVIEW_COMPLIANCE_NOTICE,
            humanReviewNotes: ['Resume analysis failed and requires human review.']
          }
        }
      });
    }
  },

  async deleteAnalysis(clientId: string, analysisId: string) {
    const analysis = await this.getAnalysis(clientId, analysisId);
    if (analysis.sourceFileUrl) await ResumeStorageService.delete(analysis.sourceFileUrl);
    await prismaAny.resumeAnalysis.delete({ where: { id: analysis.id } });
    return true;
  },

  progressEvent(status: string, step = 'completed'): ProgressEvent {
    const completed = status === 'completed';
    const failed = status === 'failed';
    return {
      status: failed ? 'failed' : completed ? 'completed' : 'processing',
      step: failed ? 'failed' : step,
      progress: failed ? 100 : completed ? 100 : 60,
      message: failed ? 'Resume task failed' : completed ? 'Resume task completed' : 'Resume task is processing'
    };
  }
};
