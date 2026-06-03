import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ResumeParserService } from './resume.parser.service';
import { ResumeService, isClientRole, isFreelancerRole } from './resume.service';
import {
  generateResumeSchema,
  regenerateResumeSchema,
  reviewProfileUrlSchema,
  reviewUploadFieldsSchema,
  updateResumeSchema
} from './resume.validation';

const success = (res: Response, data: any, status = 200) => res.status(status).json({ success: true, data });
const failure = (res: Response, status: number, error: string, details?: any) =>
  res.status(status).json({ success: false, error, details });

const parseBody = <T>(schema: { parse: (value: unknown) => T }, body: unknown): T => schema.parse(body || {});

type ResumeAiRuntimeConfig = {
  enabled: boolean;
  builderEnabled: boolean;
  reviewerEnabled: boolean;
  adminAccessEnabled: boolean;
};

const DEFAULT_RESUME_AI_RUNTIME_CONFIG: ResumeAiRuntimeConfig = {
  enabled: true,
  builderEnabled: true,
  reviewerEnabled: true,
  adminAccessEnabled: true
};

const normalizeRole = (role?: string) => String(role || '').trim().toUpperCase();
const isFreelancerDashboardRole = (role?: string) => {
  const normalized = normalizeRole(role);
  return normalized.includes('FREELANCER') || normalized.includes('USER');
};
const isClientDashboardRole = (role?: string) => {
  const normalized = normalizeRole(role);
  return normalized.includes('CLIENT') || normalized.includes('EMPLOYER') || normalized.includes('BUYER');
};

const resolveEffectiveRole = (req: Request, userRole?: string) => {
  const queryRole = normalizeRole((req.query?.role as string) || (req.query?.as as string));
  if (!queryRole) return normalizeRole(userRole);
  if (queryRole.includes('ADMIN') || queryRole.includes('SUPERADMIN')) return normalizeRole(userRole);
  if (isFreelancerDashboardRole(queryRole)) return 'FREELANCER';
  if (isClientDashboardRole(queryRole)) return 'CLIENT';
  return normalizeRole(userRole);
};

const parseBoolean = (value: any, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  return fallback;
};

const getResumeAiRuntimeConfig = (appLike: any): ResumeAiRuntimeConfig => {
  const runtimeSettings = appLike?.get?.('runtime:systemSettings') || {};
  const raw = runtimeSettings?.resumeAi ?? runtimeSettings?.resume_ai ?? {};
  const envEnabled = process.env.RESUME_AI_ENABLED;
  const envBuilderEnabled = process.env.RESUME_AI_BUILDER_ENABLED;
  const envReviewerEnabled = process.env.RESUME_AI_REVIEWER_ENABLED;
  const envAdminAccessEnabled = process.env.RESUME_AI_ADMIN_ACCESS_ENABLED;

  return {
    enabled: parseBoolean(
      raw.enabled ?? raw.isEnabled ?? raw.resumeEnabled ?? raw.resume_enabled,
      envEnabled === undefined ? DEFAULT_RESUME_AI_RUNTIME_CONFIG.enabled : parseBoolean(envEnabled, DEFAULT_RESUME_AI_RUNTIME_CONFIG.enabled)
    ),
    builderEnabled: parseBoolean(
      raw.builderEnabled ?? raw.builder_enabled ?? raw.builder ?? raw.resumeBuilderEnabled ?? raw.resume_builder_enabled,
      envBuilderEnabled === undefined
        ? DEFAULT_RESUME_AI_RUNTIME_CONFIG.builderEnabled
        : parseBoolean(envBuilderEnabled, DEFAULT_RESUME_AI_RUNTIME_CONFIG.builderEnabled)
    ),
    reviewerEnabled: parseBoolean(
      raw.reviewerEnabled ?? raw.reviewer_enabled ?? raw.reviewer ?? raw.resumeReviewerEnabled ?? raw.resume_reviewer_enabled,
      envReviewerEnabled === undefined
        ? DEFAULT_RESUME_AI_RUNTIME_CONFIG.reviewerEnabled
        : parseBoolean(envReviewerEnabled, DEFAULT_RESUME_AI_RUNTIME_CONFIG.reviewerEnabled)
    ),
    adminAccessEnabled: parseBoolean(
      raw.adminAccessEnabled ?? raw.admin_access_enabled ?? raw.allowAdminAccess ?? raw.allow_admin_access,
      envAdminAccessEnabled === undefined
        ? DEFAULT_RESUME_AI_RUNTIME_CONFIG.adminAccessEnabled
        : parseBoolean(envAdminAccessEnabled, DEFAULT_RESUME_AI_RUNTIME_CONFIG.adminAccessEnabled)
    )
  };
};

const canUseResumeBuilder = (appLike: any, user: any) => {
  const policy = getResumeAiRuntimeConfig(appLike);
  if (!user) return false;
  if (String(user.role || '').toUpperCase().includes('ADMIN')) return policy.adminAccessEnabled;
  return policy.enabled && policy.builderEnabled;
};

const canUseResumeReviewer = (appLike: any, user: any) => {
  const policy = getResumeAiRuntimeConfig(appLike);
  if (!user) return false;
  if (String(user.role || '').toUpperCase().includes('ADMIN')) return policy.adminAccessEnabled;
  return policy.enabled && policy.reviewerEnabled;
};

const handleError = (res: Response, error: any) => {
  if (error instanceof ZodError) {
    console.warn('[resume] Validation error:', JSON.stringify(error.flatten(), null, 2));
    failure(res, 400, 'Invalid request payload.', error.flatten());
    return;
  }
  const message = String(error?.message || 'Request failed.');
  const status = message.toLowerCase().includes('not found') ? 404 : message.toLowerCase().includes('private') ? 404 : 500;
  failure(res, status, message);
};

const requireUser = (req: Request, res: Response) => {
  if (req.user?.id) return req.user;
  failure(res, 401, 'Authentication required.');
  return null;
};

const requireFreelancer = (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return null;
  const effectiveRole = resolveEffectiveRole(req, user.role);
  if (!canUseResumeBuilder(req.app, user)) {
    failure(res, 403, 'Resume/CV Builder is disabled by an administrator.');
    return null;
  }
  if (isFreelancerRole(effectiveRole)) return user;
  failure(res, 403, 'Freelancer access required.');
  return null;
};

const requireClient = (req: Request, res: Response) => {
  const user = requireUser(req, res);
  if (!user) return null;
  const effectiveRole = resolveEffectiveRole(req, user.role);
  if (!canUseResumeReviewer(req.app, user)) {
    failure(res, 403, 'Resume/CV Reviewer is disabled by an administrator.');
    return null;
  }
  if (isClientRole(effectiveRole)) return user;
  failure(res, 403, 'Client access required.');
  return null;
};

export const ResumeController = {
  async profileSource(req: Request, res: Response) {
    const user = requireFreelancer(req, res);
    if (!user) return;
    try {
      success(res, await ResumeService.getProfileSource(user.id));
    } catch (error) {
      handleError(res, error);
    }
  },

  async listResumes(req: Request, res: Response) {
    const user = requireFreelancer(req, res);
    if (!user) return;
    try {
      success(res, await ResumeService.listResumes(user.id));
    } catch (error) {
      handleError(res, error);
    }
  },

  async getResume(req: Request, res: Response) {
    const user = requireFreelancer(req, res);
    if (!user) return;
    try {
      success(res, await ResumeService.getResume(user.id, req.params.id));
    } catch (error) {
      handleError(res, error);
    }
  },

  async generateResume(req: Request, res: Response) {
    const user = requireFreelancer(req, res);
    if (!user) return;
    try {
      const input = parseBody(generateResumeSchema, req.body);
      success(res, await ResumeService.generateResume(user.id, user.role, input), 201);
    } catch (error) {
      handleError(res, error);
    }
  },

  async updateResume(req: Request, res: Response) {
    const user = requireFreelancer(req, res);
    if (!user) return;
    try {
      const input = parseBody(updateResumeSchema, req.body);
      success(res, await ResumeService.updateResume(user.id, req.params.id, input));
    } catch (error) {
      handleError(res, error);
    }
  },

  async regenerateResume(req: Request, res: Response) {
    const user = requireFreelancer(req, res);
    if (!user) return;
    try {
      const input = parseBody(regenerateResumeSchema, req.body);
      success(res, await ResumeService.regenerateResume(user.id, user.role, req.params.id, input));
    } catch (error) {
      handleError(res, error);
    }
  },

  async renderPdf(req: Request, res: Response) {
    const user = requireFreelancer(req, res);
    if (!user) return;
    try {
      success(res, await ResumeService.renderPdf(user.id, req.params.id));
    } catch (error) {
      handleError(res, error);
    }
  },

  async downloadResume(req: Request, res: Response) {
    const user = requireFreelancer(req, res);
    if (!user) return;
    try {
      const { stream, fileName } = await ResumeService.getResumeDownload(user.id, req.params.id);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      stream.on('error', (error: any) => handleError(res, error));
      stream.pipe(res);
    } catch (error) {
      handleError(res, error);
    }
  },

  async deleteResume(req: Request, res: Response) {
    const user = requireFreelancer(req, res);
    if (!user) return;
    try {
      await ResumeService.deleteResume(user.id, req.params.id);
      success(res, { deleted: true });
    } catch (error) {
      handleError(res, error);
    }
  },

  async listReviews(req: Request, res: Response) {
    const user = requireClient(req, res);
    if (!user) return;
    try {
      success(res, await ResumeService.listAnalyses(user.id));
    } catch (error) {
      handleError(res, error);
    }
  },

  async getReview(req: Request, res: Response) {
    const user = requireClient(req, res);
    if (!user) return;
    try {
      success(res, await ResumeService.getAnalysis(user.id, req.params.id));
    } catch (error) {
      handleError(res, error);
    }
  },

  async uploadReview(req: Request, res: Response) {
    const user = requireClient(req, res);
    if (!user) return;
    try {
      const validation = ResumeParserService.validateUpload(req.file);
      if (!validation.ok) {
        failure(res, 400, validation.error || 'Invalid upload.');
        return;
      }
      const input = parseBody(reviewUploadFieldsSchema, req.body);
      success(res, await ResumeService.createAnalysisFromUpload(user.id, user.role, req.file as Express.Multer.File, input), 201);
    } catch (error) {
      handleError(res, error);
    }
  },

  async profileUrlReview(req: Request, res: Response) {
    const user = requireClient(req, res);
    if (!user) return;
    try {
      const input = parseBody(reviewProfileUrlSchema, req.body);
      success(res, await ResumeService.createAnalysisFromProfileUrl(user.id, user.role, input), 201);
    } catch (error) {
      handleError(res, error);
    }
  },

  async deleteReview(req: Request, res: Response) {
    const user = requireClient(req, res);
    if (!user) return;
    try {
      await ResumeService.deleteAnalysis(user.id, req.params.id);
      success(res, { deleted: true });
    } catch (error) {
      handleError(res, error);
    }
  },

  async reviewEvents(req: Request, res: Response) {
    const user = requireClient(req, res);
    if (!user) return;
    try {
      const analysis = await ResumeService.getAnalysis(user.id, req.params.id);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify(ResumeService.progressEvent(analysis.status))}\n\n`);
      res.end();
    } catch (error) {
      handleError(res, error);
    }
  },

  async resumeEvents(req: Request, res: Response) {
    const user = requireFreelancer(req, res);
    if (!user) return;
    try {
      const resume = await ResumeService.getResume(user.id, req.params.id);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify(ResumeService.progressEvent(resume.status === 'generated' || resume.status === 'exported' ? 'completed' : 'processing'))}\n\n`);
      res.end();
    } catch (error) {
      handleError(res, error);
    }
  },

  async publicInfo(_req: Request, res: Response) {
    const config = getResumeAiRuntimeConfig((_req as any).app);
    success(res, {
      feature: 'resume-ai',
      status: config.enabled && (config.builderEnabled || config.reviewerEnabled) ? 'available' : 'disabled',
      enabled: config.enabled,
      builderEnabled: config.builderEnabled,
      reviewerEnabled: config.reviewerEnabled,
      adminAccessEnabled: config.adminAccessEnabled
    });
  }
};
