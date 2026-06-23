import { Request, Response } from 'express';
import { resolveActorFromRequest } from '../../../services/scrolitha/scrolitha.audit';
import { sanitizeScrolithaUserMessage } from '../../../services/scrolitha/scrolitha.ollama';
import { ScrolithaService } from '../inference/scrolitha.service';
import { enhancePostDraftWithAi, isValidPostEnhanceMode } from '../../../services/postAi.service';

const asText = (value: unknown, fallback = '') => String(value ?? fallback).trim();

const parseList = (source: string, fallback: string[] = []) => {
  const cleaned = String(source || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*\d.]+\s*/, '').trim())
    .filter(Boolean);
  if (cleaned.length) return cleaned.slice(0, 12);
  return fallback;
};

const withError = (res: Response, message: string, error: any, status = 500) =>
  res.status(status).json({
    success: false,
    data: null,
    message,
    error: sanitizeScrolithaUserMessage(String(error?.message || 'Unknown error'))
  });

const asScrolithaModelLabel = (_value?: any) => 'Scrolitha';

const buildScrolithaMeta = (result: any) => ({
  provider: 'scrolitha',
  model: asScrolithaModelLabel(result?.model),
  usedFallback: Boolean(result?.usedFallback ?? result?.fallbackUsed),
  warning: result?.warning || null,
  warningCode: result?.warningCode || null
});

export const scrolithaRewriteController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const text = asText(req.body?.text);
    const tone = asText(req.body?.tone, 'professional');
    const mode = asText(req.body?.mode).toLowerCase();
    if (!text) {
      return res.status(400).json({ success: false, data: null, message: 'text is required' });
    }

    if (mode && isValidPostEnhanceMode(mode)) {
      const result = await enhancePostDraftWithAi({
        text,
        mode,
        scope: actor.scope,
        actor
      });

      return res.json({
        success: true,
        data: {
          rewrittenText: result.enhancedText,
          enhancedText: result.enhancedText,
          rewrite: result.enhancedText,
          text: result.enhancedText,
          mode: result.mode,
          ...buildScrolithaMeta(result)
        },
        message: 'Rewrite completed'
      });
    }

    const result = await ScrolithaService.generate({
      scope: actor.scope,
      actor,
      prompt: `Rewrite the following text in a ${tone} tone while preserving intent.\n\nText:\n${text}`,
      system: 'Rewrite user text for marketplace communication. Output only final rewritten text.'
    });

    return res.json({
      success: true,
      data: {
        rewrittenText: result.text,
        enhancedText: result.text,
        rewrite: result.text,
        text: result.text,
        ...buildScrolithaMeta(result)
      },
      message: 'Rewrite completed'
    });
  } catch (error) {
    return withError(res, 'Failed to rewrite text', error);
  }
};

export const scrolithaHashtagsController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const text = asText(req.body?.text);
    if (!text) {
      return res.status(400).json({ success: false, data: null, message: 'text is required' });
    }

    const result = await ScrolithaService.generate({
      scope: actor.scope,
      actor,
      prompt: `Generate 10 high quality hashtags for this content:\n${text}`,
      system:
        'Return a plain list of hashtags only. One per line. Avoid duplicates. Include niche and broad tags where useful.'
    });

    const hashtags = parseList(result.text)
      .map((entry) => (entry.startsWith('#') ? entry : `#${entry.replace(/^#+/, '')}`))
      .slice(0, 10);

    return res.json({
      success: true,
      data: {
        hashtags,
        ...buildScrolithaMeta(result)
      },
      message: 'Hashtag suggestions ready'
    });
  } catch (error) {
    return withError(res, 'Failed to generate hashtags', error);
  }
};

export const scrolithaCommentSuggestionsController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const text = asText(req.body?.text);
    if (!text) {
      return res.status(400).json({ success: false, data: null, message: 'text is required' });
    }

    const result = await ScrolithaService.generate({
      scope: actor.scope,
      actor,
      prompt: `Create 6 engaging comment suggestions for this post:\n${text}`,
      system:
        'Provide concise, respectful comments that encourage discussion. Output list items only, one per line.'
    });

    const suggestions = parseList(result.text).slice(0, 6);
    return res.json({
      success: true,
      data: {
        suggestions,
        ...buildScrolithaMeta(result)
      },
      message: 'Comment suggestions ready'
    });
  } catch (error) {
    return withError(res, 'Failed to generate comment suggestions', error);
  }
};

export const scrolithaProposalDraftController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const jobTitle = asText(req.body?.jobTitle);
    const jobDescription = asText(req.body?.jobDescription);
    const freelancerBio = asText(req.body?.freelancerBio);

    if (!jobTitle || !jobDescription) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'jobTitle and jobDescription are required'
      });
    }

    const result = await ScrolithaService.generate({
      scope: actor.scope,
      actor,
      prompt: `Create a high-converting freelancer proposal.\nJob Title: ${jobTitle}\nJob Description: ${jobDescription}\nFreelancer Bio: ${freelancerBio}`,
      system:
        'Draft a concise, outcome-focused proposal with greeting, understanding, plan, timeline, and CTA. Return only the final proposal text.'
    });

    return res.json({
      success: true,
      data: {
        draft: result.text,
        ...buildScrolithaMeta(result)
      },
      message: 'Proposal draft ready'
    });
  } catch (error) {
    return withError(res, 'Failed to generate proposal draft', error);
  }
};

export const scrolithaGigImproveController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const title = asText(req.body?.title);
    const description = asText(req.body?.description);
    if (!title && !description) {
      return res.status(400).json({ success: false, data: null, message: 'title or description is required' });
    }

    const result = await ScrolithaService.generate({
      scope: actor.scope,
      actor,
      prompt: `Improve this gig listing for conversion.\nTitle: ${title}\nDescription: ${description}`,
      system:
        'Improve clarity, outcomes, and buyer confidence. Return a markdown-like structure with sections: title, summary, highlights.'
    });

    return res.json({
      success: true,
      data: {
        improved: result.text,
        ...buildScrolithaMeta(result)
      },
      message: 'Gig improvement generated'
    });
  } catch (error) {
    return withError(res, 'Failed to improve gig', error);
  }
};

export const scrolithaJobImproveController = async (req: Request, res: Response) => {
  try {
    const actor = resolveActorFromRequest(req);
    const title = asText(req.body?.title);
    const description = asText(req.body?.description);
    if (!title && !description) {
      return res.status(400).json({ success: false, data: null, message: 'title or description is required' });
    }

    const result = await ScrolithaService.generate({
      scope: actor.scope,
      actor,
      prompt: `Improve this job post for quality applicants.\nTitle: ${title}\nDescription: ${description}`,
      system:
        'Improve role clarity, scope, deliverables, and screening quality. Return the upgraded job copy only.'
    });

    return res.json({
      success: true,
      data: {
        improved: result.text,
        ...buildScrolithaMeta(result)
      },
      message: 'Job improvement generated'
    });
  } catch (error) {
    return withError(res, 'Failed to improve job post', error);
  }
};

export const scrolithaToxicityCheckController = async (req: Request, res: Response) => {
  try {
    const text = asText(req.body?.text);
    if (!text) return res.status(400).json({ success: false, data: null, message: 'text is required' });
    const safety = await ScrolithaService.classifySafety(text);
    return res.json({
      success: true,
      data: safety,
      message: 'Toxicity check complete'
    });
  } catch (error) {
    return withError(res, 'Failed to run toxicity check', error);
  }
};
