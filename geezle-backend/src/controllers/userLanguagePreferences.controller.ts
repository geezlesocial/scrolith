import { Request, Response } from 'express';
import {
  getLanguageCatalogPayload,
  getUserLanguagePreferences,
  updateUserLanguagePreferences
} from '../services/language/userLanguagePreferences.service';
import { evaluateTranslationDecision } from '../services/language/translationDecisionPolicy';
import { setCommunityPostLanguageManual } from '../services/contentTranslation.service';
import prisma from '../utils/prismaClient';

const nowIso = () => new Date().toISOString();

export const getLanguageCatalogController = async (_req: Request, res: Response) => {
  return res.json({ success: true, data: getLanguageCatalogPayload(), timestamp: nowIso() });
};

export const getMyLanguagePreferencesController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: nowIso() });
    const prefs = await getUserLanguagePreferences(userId);
    if (!prefs) return res.status(404).json({ success: false, error: 'User not found', timestamp: nowIso() });
    return res.json({ success: true, data: prefs, timestamp: nowIso() });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load language preferences', timestamp: nowIso() });
  }
};

export const updateMyLanguagePreferencesController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: nowIso() });
    const prefs = await updateUserLanguagePreferences(userId, req.body || {});
    return res.json({ success: true, data: prefs, timestamp: nowIso() });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error?.message || 'Failed to update language preferences', timestamp: nowIso() });
  }
};

export const evaluatePostTranslationDecisionController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const postId = String(req.params.postId || '').trim();
    if (!postId) return res.status(400).json({ success: false, error: 'postId required', timestamp: nowIso() });

    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: {
        sourceLanguage: true,
        sourceLanguageConfidence: true,
        languageDetectionStatus: true,
        isMixedLanguage: true,
        detectedLanguageCodes: true
      }
    });
    if (!post) return res.status(404).json({ success: false, error: 'Post not found', timestamp: nowIso() });

    let prefs = null as Awaited<ReturnType<typeof getUserLanguagePreferences>>;
    if (userId) prefs = await getUserLanguagePreferences(userId);

    const decision = evaluateTranslationDecision({
      viewerUnderstoodLanguages: prefs?.understoodLanguages || [],
      viewerPreferredTranslationLanguage: prefs?.preferredTranslationLanguage,
      viewerSuggestionsEnabled: prefs?.languageSuggestionsEnabled,
      viewerAutoTranslateEnabled: prefs?.autoTranslateEnabled,
      viewerPreferencesConfirmed: prefs?.languagePreferencesConfirmed,
      postLanguageCode: post.sourceLanguage,
      detectedLanguageCodes: post.detectedLanguageCodes,
      detectionConfidence: post.sourceLanguageConfidence,
      isMixedLanguage: post.isMixedLanguage,
      languageDetectionStatus: post.languageDetectionStatus,
      translationAvailable: true
    });

    return res.json({
      success: true,
      data: {
        decision,
        postLanguage: {
          sourceLanguage: post.sourceLanguage,
          confidence: post.sourceLanguageConfidence,
          status: post.languageDetectionStatus,
          isMixedLanguage: post.isMixedLanguage,
          detectedLanguageCodes: post.detectedLanguageCodes
        }
      },
      timestamp: nowIso()
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to evaluate translation decision', timestamp: nowIso() });
  }
};

export const setPostLanguageManualController = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized', timestamp: nowIso() });
    const postId = String(req.params.postId || '').trim();
    const languageCode = String(req.body?.languageCode || req.body?.language || '').trim();
    if (!postId || !languageCode) {
      return res.status(400).json({ success: false, error: 'postId and languageCode are required', timestamp: nowIso() });
    }

    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: { authorId: true }
    });
    if (!post) return res.status(404).json({ success: false, error: 'Post not found', timestamp: nowIso() });

    const role = String(req.user?.role || '').toUpperCase();
    const isStaff = role === 'ADMIN' || role === 'MODERATOR' || role === 'STAFF';
    if (post.authorId !== userId && !isStaff) {
      return res.status(403).json({ success: false, error: 'Only the author or moderators may correct language', timestamp: nowIso() });
    }

    const updated = await setCommunityPostLanguageManual(postId, languageCode, userId);
    return res.json({
      success: true,
      data: {
        id: updated.id,
        sourceLanguage: updated.sourceLanguage,
        languageManuallySet: updated.languageManuallySet,
        languageDetectionStatus: updated.languageDetectionStatus
      },
      timestamp: nowIso()
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error?.message || 'Failed to set language', timestamp: nowIso() });
  }
};
