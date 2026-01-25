import express, { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';

type BriefRecord = {
  id: string;
  user_id: string;
  prompt: string;
  title: string;
  category: string;
  budget_range: string;
  timeline: string;
  description: string;
  required_skills: string[];
  screening_questions: string[];
  created_at: string;
  updated_at: string;
};

const router = express.Router();
const briefs: BriefRecord[] = [];

const nowIso = () => new Date().toISOString();
const makeId = () => `brief_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const normalizeRole = (role?: string) => (role || '').toString().toLowerCase();

const requireEmployer = (req: Request, res: Response): boolean => {
  const role = normalizeRole(req.user?.role);
  if (role.includes('admin') || role.includes('client') || role.includes('employer')) return true;
  res.status(403).json({ success: false, error: 'Access denied', code: 'ERR_FORBIDDEN' });
  return false;
};

const toTitle = (prompt: string) => {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New Project';
  const sentence = cleaned.split(/[.!?]/)[0] || cleaned;
  return sentence.length > 80 ? `${sentence.slice(0, 77)}...` : sentence;
};

const extractSkills = (prompt: string) => {
  const tokens = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  const seen = new Set<string>();
  const skills: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    skills.push(token);
    if (skills.length >= 6) break;
  }
  return skills.length ? skills : ['planning', 'communication'];
};

const generateBrief = (prompt: string) => {
  const skills = extractSkills(prompt);
  const title = toTitle(prompt);
  return {
    title,
    category: 'General',
    budgetRange: 'TBD',
    timeline: '2-4 weeks',
    description: `Project overview:\n${prompt.trim()}\n\nDeliverables and milestones will be refined after kickoff.`,
    requiredSkills: skills,
    screeningQuestions: [
      'Describe a similar project you have delivered.',
      'What approach would you take to deliver this on time?'
    ]
  };
};

router.get('/', authMiddleware, (req: Request, res: Response) => {
  if (!requireEmployer(req, res)) return;
  const userId = req.user?.id || '';
  const role = normalizeRole(req.user?.role);
  const requestedUserId = (req.query.userId as string) || (req.query.user_id as string) || '';

  const list = role.includes('admin') && requestedUserId
    ? briefs.filter((brief) => brief.user_id === requestedUserId)
    : role.includes('admin') && !requestedUserId
      ? briefs
      : briefs.filter((brief) => brief.user_id === userId);

  res.json({ success: true, data: list });
});

router.post('/generate', authMiddleware, (req: Request, res: Response) => {
  if (!requireEmployer(req, res)) return;
  const prompt = (req.body?.prompt || '').toString().trim();
  if (!prompt) {
    res.status(400).json({ success: false, error: 'Prompt is required', code: 'ERR_BAD_REQUEST' });
    return;
  }

  const generated = generateBrief(prompt);
  res.json({ success: true, data: generated });
});

router.post('/', authMiddleware, (req: Request, res: Response) => {
  if (!requireEmployer(req, res)) return;
  const userId = req.user?.id || '';
  const payload = req.body || {};
  const prompt = (payload.prompt || payload.description || '').toString().trim();

  if (!prompt) {
    res.status(400).json({ success: false, error: 'Prompt is required', code: 'ERR_BAD_REQUEST' });
    return;
  }

  const createdAt = nowIso();
  const record: BriefRecord = {
    id: payload.id || makeId(),
    user_id: userId,
    prompt,
    title: payload.title || toTitle(prompt),
    category: payload.category || 'General',
    budget_range: payload.budget_range || payload.budgetRange || 'TBD',
    timeline: payload.timeline || '2-4 weeks',
    description: payload.description || prompt,
    required_skills: Array.isArray(payload.required_skills || payload.requiredSkills)
      ? (payload.required_skills || payload.requiredSkills)
      : extractSkills(prompt),
    screening_questions: Array.isArray(payload.screening_questions || payload.screeningQuestions)
      ? (payload.screening_questions || payload.screeningQuestions)
      : [],
    created_at: createdAt,
    updated_at: createdAt
  };

  const existingIndex = briefs.findIndex((brief) => brief.id === record.id);
  if (existingIndex >= 0) {
    briefs[existingIndex] = { ...briefs[existingIndex], ...record, updated_at: nowIso() };
    res.json({ success: true, data: briefs[existingIndex] });
    return;
  }

  briefs.unshift(record);
  res.json({ success: true, data: record });
});

router.post('/:id/use-to-create-job', authMiddleware, (req: Request, res: Response) => {
  if (!requireEmployer(req, res)) return;
  const id = req.params.id;
  const brief = briefs.find((item) => item.id === id);
  if (!brief) {
    res.status(404).json({ success: false, error: 'Brief not found', code: 'ERR_NOT_FOUND' });
    return;
  }

  res.json({
    success: true,
    data: {
      brief,
      jobDraft: {
        title: brief.title,
        description: brief.description,
        tags: brief.required_skills,
        budget: brief.budget_range,
        timeline: brief.timeline
      }
    }
  });
});

export default router;
