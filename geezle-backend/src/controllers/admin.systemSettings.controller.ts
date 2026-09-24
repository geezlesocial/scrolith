import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import fs from 'fs';
import path from 'path';
import { writeFileAtomicallySync } from '../utils/atomicFile';
import { isSafeObjectKey, setSafeObjectValue } from '../utils/security/safeObjectKey';
import {
  createEmailTransporter,
  normalizeEmailSettings,
  validateEmailSettings
} from '../services/email.service';
import {
  DEFAULT_RUNTIME_OPTIMIZATION_CONFIG,
  normalizeRuntimeOptimizationConfig,
  serializeRuntimeOptimizationConfig
} from '../services/runtimeOptimization.service';
import {
  DEFAULT_VERIFICATION_SETTINGS,
  normalizeVerificationSettings
} from '../utils/verificationSettings';
import {
  DEFAULT_TRUST_SCORE_SETTINGS,
  normalizeTrustScoreSettings
} from '../utils/trustScoreSettings';
import {
  DEFAULT_DEAL_FLOW_SETTINGS,
  normalizeDealFlowSettings
} from '../utils/dealFlowSettings';
import {
  DEFAULT_STOREFRONT_SETTINGS,
  normalizeStorefrontSettings
} from '../utils/storefrontSettings';
import { recordGovernedAdminAction } from '../services/enterpriseGovernance.service';
import {
  DEFAULT_CONTENT_OFFER_SETTINGS,
  normalizeContentOfferSettings
} from '../utils/contentOfferSettings';
import { invalidateSystemControlsCache, normalizeMaintenancePage } from '../services/systemControls.service';

export const DEFAULT_SYSTEM = {
  maintenanceMode: false,
  registrationsEnabled: true,
  kycEnforced: false,
  admin2FA: false,
  maintenancePage: {
    slug: 'maintenance',
    title: 'We’ll be back soon',
    message:
      'Scrolith is undergoing scheduled maintenance to improve reliability and security. Admins can still access the control plane. Please try again shortly.',
    eta: null as string | null,
    contactEmail: 'support@scrolith.com',
    showCountdown: false,
    ctaLabel: 'Contact support',
    ctaUrl: 'mailto:support@scrolith.com'
  },
  resumeAi: {
    enabled: true,
    builderEnabled: true,
    reviewerEnabled: true,
    adminAccessEnabled: true
  },
  listings: {
    autoApproveGigs: false,
    autoApproveJobs: false,
    featurePolicy: {
      freeFeaturedGigsPerMonth: 1,
      freeFeaturedJobsPerMonth: 1,
      feedCardEveryPosts: 2,
      maxListingCardsPerFeed: 8,
      recommendedPoolLimit: 20
    }
  },
  currency: {
    autoExchangeRate: true,
    baseCurrency: 'USD',
    provider: 'openexchangerates'
  },
  fx: {
    enabled: true,
    providerCode: 'frankfurter_ecb',
    syncBaseCurrency: 'USD',
    autoApproveSnapshots: true,
    refreshEnabled: true,
    refreshCron: '17 0 * * 1-5',
    staleAfterSeconds: 172800,
    fallbackToStoredRates: true,
    sourceBaseUrl: process.env.FX_SOURCE_BASE_URL || 'https://api.frankfurter.app',
    sourceProvider: 'ECB',
    timezone: process.env.SCHEDULE_TIMEZONE || 'UTC'
  },
  optimization: serializeRuntimeOptimizationConfig(DEFAULT_RUNTIME_OPTIMIZATION_CONFIG),
  verification: DEFAULT_VERIFICATION_SETTINGS,
  trustScore: DEFAULT_TRUST_SCORE_SETTINGS,
  dealFlow: DEFAULT_DEAL_FLOW_SETTINGS,
  storefront: DEFAULT_STOREFRONT_SETTINGS,
  contentOffers: DEFAULT_CONTENT_OFFER_SETTINGS,
  currencies: []
};

const isPlainObject = (v: any) => v && typeof v === 'object' && !Array.isArray(v);

// Merge rules: objects = deep merge, arrays = replace if provided, scalars = replace
export const deepMergeReplaceArrays = (existing: any, incoming: any): any => {
  if (incoming === undefined) return existing;
  if (Array.isArray(incoming)) return incoming;
  if (!isPlainObject(incoming)) return incoming;
  const out: any = { ...(isPlainObject(existing) ? existing : {}) };
  for (const key of Object.keys(incoming)) {
    if (!isSafeObjectKey(key)) continue;
    const safeKey = key.trim();
    setSafeObjectValue(out, safeKey, deepMergeReplaceArrays(existing ? existing[safeKey] : undefined, incoming[key]));
  }
  return out;
};

export const hydrateSystemSettings = (raw: any) => {
  const merged = deepMergeReplaceArrays(DEFAULT_SYSTEM, raw || {});
  const normalizedOptimization = normalizeRuntimeOptimizationConfig(merged?.optimization);
  merged.optimization = serializeRuntimeOptimizationConfig(normalizedOptimization);
  merged.verification = normalizeVerificationSettings(merged?.verification);
  merged.trustScore = normalizeTrustScoreSettings(merged?.trustScore ?? merged?.trust_score);
  merged.dealFlow = normalizeDealFlowSettings(merged?.dealFlow ?? merged?.deal_flow);
  merged.storefront = normalizeStorefrontSettings(merged?.storefront ?? merged?.storefront_settings);
  merged.contentOffers = normalizeContentOfferSettings(
    merged?.contentOffers ??
      merged?.content_offers ??
      merged?.contentOfferTags ??
      merged?.content_offer_tags
  );
  merged.maintenancePage = normalizeMaintenancePage(
    merged?.maintenancePage ?? merged?.maintenance_page
  );
  merged.maintenanceMode = Boolean(merged.maintenanceMode);
  merged.registrationsEnabled =
    merged.registrationsEnabled === undefined ? true : Boolean(merged.registrationsEnabled);
  merged.kycEnforced = Boolean(merged.kycEnforced);
  merged.admin2FA = Boolean(merged.admin2FA);
  return merged;
};

const pickFirstDefined = (source: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
};

export const validateSystem = (obj: any) => {
  const errors: string[] = [];
  if (obj.maintenanceMode !== undefined && typeof obj.maintenanceMode !== 'boolean') errors.push('maintenanceMode must be boolean');
  if (obj.registrationsEnabled !== undefined && typeof obj.registrationsEnabled !== 'boolean') errors.push('registrationsEnabled must be boolean');
  if (obj.kycEnforced !== undefined && typeof obj.kycEnforced !== 'boolean') errors.push('kycEnforced must be boolean');
  if (obj.admin2FA !== undefined && typeof obj.admin2FA !== 'boolean') errors.push('admin2FA must be boolean');
  if (obj.listings?.featurePolicy) {
    const policy = obj.listings.featurePolicy;
    const numericRules: Array<{ key: string; min?: number; max?: number }> = [
      { key: 'freeFeaturedGigsPerMonth', min: 0, max: 500 },
      { key: 'freeFeaturedJobsPerMonth', min: 0, max: 500 },
      { key: 'feedCardEveryPosts', min: 2, max: 20 },
      { key: 'maxListingCardsPerFeed', min: 1, max: 50 },
      { key: 'recommendedPoolLimit', min: 4, max: 200 }
    ];
    numericRules.forEach(({ key, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER }) => {
      if (policy[key] === undefined) return;
      const numeric = Number(policy[key]);
      if (!Number.isFinite(numeric)) {
        errors.push(`listings.featurePolicy.${key} must be a number`);
        return;
      }
      if (numeric < min || numeric > max) {
        errors.push(`listings.featurePolicy.${key} must be between ${min} and ${max}`);
      }
    });
  }

  // currency checks
  const currency = obj.currency;
  if (currency) {
    if (currency.baseCurrency && obj.currencies && Array.isArray(obj.currencies)) {
      const exists = obj.currencies.some((c: any) => c.code === currency.baseCurrency && c.isActive !== false);
      if (!exists) errors.push('currency.baseCurrency must exist in active currencies');
    }
  }

  const fx = obj.fx;
  if (fx !== undefined) {
    if (!isPlainObject(fx)) {
      errors.push('fx must be an object');
    } else {
      if (fx.providerCode !== undefined && !String(fx.providerCode || '').trim()) {
        errors.push('fx.providerCode is required when fx is configured');
      }
      if (fx.syncBaseCurrency !== undefined && !String(fx.syncBaseCurrency || '').trim()) {
        errors.push('fx.syncBaseCurrency is required when provided');
      }
      if (
        fx.syncBaseCurrency !== undefined &&
        currency?.baseCurrency !== undefined &&
        String(fx.syncBaseCurrency || '').trim().toUpperCase() !== String(currency.baseCurrency || '').trim().toUpperCase()
      ) {
        errors.push('fx.syncBaseCurrency must match currency.baseCurrency in Phase 1');
      }
      if (fx.refreshCron !== undefined && !String(fx.refreshCron || '').trim()) {
        errors.push('fx.refreshCron must be a non-empty cron expression');
      }
      if (fx.staleAfterSeconds !== undefined) {
        const staleAfterSeconds = Number(fx.staleAfterSeconds);
        if (!Number.isFinite(staleAfterSeconds) || staleAfterSeconds < 60) {
          errors.push('fx.staleAfterSeconds must be a number greater than or equal to 60');
        }
      }
    }
  }

  // currencies uniqueness
  if (obj.currencies && Array.isArray(obj.currencies)) {
    const codes = obj.currencies.map((c: any) => (c.code || '').toString().toUpperCase());
    const dup = codes.find((c: any, i: number) => codes.indexOf(c) !== i);
    if (dup) errors.push(`duplicate currency code: ${dup}`);
  }

  // email.port if present
  if (obj.email && obj.email.port !== undefined && typeof obj.email.port !== 'number') errors.push('email.port must be a number');
  if (obj.email && obj.email.provider !== undefined) {
    const provider = String(obj.email.provider).trim().toLowerCase();
    if (!['smtp', 'ses', 'sendgrid', 'mailgun', 'brevo'].includes(provider)) {
      errors.push('email.provider must be one of smtp, ses, sendgrid, mailgun, brevo');
    }
  }
  if (obj.email && obj.email.encryption !== undefined) {
    const encryption = String(obj.email.encryption).trim().toLowerCase();
    if (!['tls', 'ssl', 'none'].includes(encryption)) {
      errors.push('email.encryption must be one of tls, ssl, none');
    }
  }

  // aiConfig.safety.maxTokens
  if (obj.aiConfig && obj.aiConfig.safety && obj.aiConfig.safety.maxTokens !== undefined && typeof obj.aiConfig.safety.maxTokens !== 'number') errors.push('aiConfig.safety.maxTokens must be a number');

  if (obj.optimization !== undefined) {
    if (!isPlainObject(obj.optimization)) {
      errors.push('optimization must be an object');
    } else {
      const optimization = obj.optimization as Record<string, any>;
      const booleanRules: Array<{ key: string; aliases?: string[] }> = [
        { key: 'enabled' },
        { key: 'compressionEnabled', aliases: ['compression_enabled'] },
        { key: 'apiResponseCachingEnabled', aliases: ['api_response_caching_enabled'] },
        { key: 'staticAssetCachingEnabled', aliases: ['static_asset_caching_enabled'] },
        { key: 'htmlMinifyEnabled', aliases: ['html_minify_enabled'] },
        { key: 'htmlCollapseWhitespace', aliases: ['html_collapse_whitespace'] },
        { key: 'htmlRemoveComments', aliases: ['html_remove_comments'] },
        { key: 'jsonMinifyEnabled', aliases: ['json_minify_enabled'] },
        { key: 'speedHintsEnabled', aliases: ['speed_hints_enabled'] },
        { key: 'dataSaverModeEnabled', aliases: ['data_saver_mode_enabled'] },
        { key: 'autoplayEnabled', aliases: ['autoplay_enabled'] }
      ];
      for (const rule of booleanRules) {
        const value = pickFirstDefined(optimization, [rule.key, ...(rule.aliases || [])]);
        if (value === undefined) continue;
        if (typeof value !== 'boolean') {
          errors.push(`optimization.${rule.key} must be boolean`);
        }
      }

      const numericRules: Array<{ key: string; aliases?: string[]; min: number; max: number }> = [
        { key: 'compressionLevel', aliases: ['compression_level'], min: 1, max: 9 },
        { key: 'compressionThresholdKb', aliases: ['compression_threshold_kb'], min: 0, max: 2048 },
        { key: 'apiResponseCacheSeconds', aliases: ['api_response_cache_seconds'], min: 5, max: 3600 },
        { key: 'apiResponseCacheMaxEntries', aliases: ['api_response_cache_max_entries'], min: 50, max: 5000 },
        { key: 'staticAssetCacheSeconds', aliases: ['static_asset_cache_seconds'], min: 60, max: 31536000 },
        { key: 'feedPageSize', aliases: ['feed_page_size'], min: 5, max: 80 },
        { key: 'lowBandwidthFeedPageSize', aliases: ['low_bandwidth_feed_page_size'], min: 3, max: 40 },
        { key: 'realtimeThrottleMs', aliases: ['realtime_throttle_ms'], min: 0, max: 10000 }
      ];
      for (const rule of numericRules) {
        const value = pickFirstDefined(optimization, [rule.key, ...(rule.aliases || [])]);
        if (value === undefined) continue;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          errors.push(`optimization.${rule.key} must be a number`);
          continue;
        }
        if (numeric < rule.min || numeric > rule.max) {
          errors.push(`optimization.${rule.key} must be between ${rule.min} and ${rule.max}`);
        }
      }

      const preconnect = pickFirstDefined(optimization, ['preconnectOrigins', 'preconnect_origins']);
      if (preconnect !== undefined) {
        const origins = Array.isArray(preconnect)
          ? preconnect
          : String(preconnect || '')
              .split(/[,\n]/g)
              .map((entry) => String(entry || '').trim())
              .filter(Boolean);
        if (origins.length > 20) {
          errors.push('optimization.preconnectOrigins supports at most 20 entries');
        }
        const invalidOrigin = origins.find((origin) => !/^https?:\/\//i.test(String(origin || '').trim()));
        if (invalidOrigin) {
          errors.push('optimization.preconnectOrigins must contain valid http(s) URLs');
        }
      }

      const apiCacheExcludePaths = pickFirstDefined(optimization, ['apiCacheExcludePaths', 'api_cache_exclude_paths']);
      if (apiCacheExcludePaths !== undefined) {
        const paths = Array.isArray(apiCacheExcludePaths)
          ? apiCacheExcludePaths
          : String(apiCacheExcludePaths || '')
              .split(/[,\n]/g)
              .map((entry) => String(entry || '').trim())
              .filter(Boolean);
        if (paths.length > 100) {
          errors.push('optimization.apiCacheExcludePaths supports at most 100 entries');
        }
      }

      const mediaQualityPreset = pickFirstDefined(optimization, ['mediaQualityPreset', 'media_quality_preset']);
      if (mediaQualityPreset !== undefined) {
        const normalized = String(mediaQualityPreset || '').trim().toLowerCase();
        if (!['auto', 'low', 'balanced', 'high'].includes(normalized)) {
          errors.push('optimization.mediaQualityPreset must be one of auto, low, balanced, high');
        }
      }
    }
  }

  if (obj.verification !== undefined) {
    if (!isPlainObject(obj.verification)) {
      errors.push('verification must be an object');
    } else {
      const verification = obj.verification as Record<string, any>;
      if (verification.enabled !== undefined && typeof verification.enabled !== 'boolean') {
        errors.push('verification.enabled must be boolean');
      }
      if (verification.showTooltips !== undefined && typeof verification.showTooltips !== 'boolean') {
        errors.push('verification.showTooltips must be boolean');
      }

      if (verification.levels !== undefined) {
        if (!isPlainObject(verification.levels)) {
          errors.push('verification.levels must be an object');
        } else {
          ['standard', 'pro', 'business', 'government'].forEach((key) => {
            if (verification.levels[key] !== undefined && typeof verification.levels[key] !== 'boolean') {
              errors.push(`verification.levels.${key} must be boolean`);
            }
          });
        }
      }

      if (verification.roles !== undefined) {
        if (!isPlainObject(verification.roles)) {
          errors.push('verification.roles must be an object');
        } else {
          ['guest', 'user', 'freelancer', 'employer', 'business', 'admin'].forEach((key) => {
            if (verification.roles[key] !== undefined && typeof verification.roles[key] !== 'boolean') {
              errors.push(`verification.roles.${key} must be boolean`);
            }
          });
        }
      }
    }
  }

  if (obj.trustScore !== undefined || obj.trust_score !== undefined) {
    const trustScore = (obj.trustScore ?? obj.trust_score) as Record<string, any>;
    if (!isPlainObject(trustScore)) {
      errors.push('trustScore must be an object');
    } else {
      ['enabled', 'showOnProfiles', 'showOnListings', 'showRiskIndicators'].forEach((key) => {
        const raw = pickFirstDefined(trustScore, [key, key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)]);
        if (raw !== undefined && typeof raw !== 'boolean') {
          errors.push(`trustScore.${key} must be boolean`);
        }
      });

      const weights = trustScore.weights;
      if (weights !== undefined) {
        if (!isPlainObject(weights)) {
          errors.push('trustScore.weights must be an object');
        } else {
          [
            'completionRate',
            'responseRate',
            'responseTime',
            'reviewRating',
            'reviewVolume',
            'disputeRate',
            'cancellationRate'
          ].forEach((key) => {
            const raw = pickFirstDefined(weights, [key, key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)]);
            if (raw === undefined) return;
            const numeric = Number(raw);
            if (!Number.isFinite(numeric)) {
              errors.push(`trustScore.weights.${key} must be a number`);
              return;
            }
            if (numeric < 0 || numeric > 1) {
              errors.push(`trustScore.weights.${key} must be between 0 and 1`);
            }
          });
        }
      }

      const thresholds = trustScore.thresholds;
      if (thresholds !== undefined) {
        if (!isPlainObject(thresholds)) {
          errors.push('trustScore.thresholds must be an object');
        } else {
          ['elite', 'established'].forEach((key) => {
            if (thresholds[key] === undefined) return;
            const numeric = Number(thresholds[key]);
            if (!Number.isFinite(numeric)) {
              errors.push(`trustScore.thresholds.${key} must be a number`);
              return;
            }
            if (numeric < 0 || numeric > 100) {
              errors.push(`trustScore.thresholds.${key} must be between 0 and 100`);
            }
          });
        }
      }
    }
  }

  if (obj.dealFlow !== undefined || obj.deal_flow !== undefined) {
    const dealFlow = (obj.dealFlow ?? obj.deal_flow) as Record<string, any>;
    if (!isPlainObject(dealFlow)) {
      errors.push('dealFlow must be an object');
    } else {
      const booleanKeys = ['enabled', 'allowCreateBriefFromChat', 'allowBriefToProposal', 'autoCreatePrivateJobs'];
      booleanKeys.forEach((key) => {
        const raw = pickFirstDefined(dealFlow, [key, key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)]);
        if (raw !== undefined && typeof raw !== 'boolean') {
          errors.push(`dealFlow.${key} must be boolean`);
        }
      });

      const defaultCategory = pickFirstDefined(dealFlow, ['defaultCategory', 'default_category']);
      if (defaultCategory !== undefined && !String(defaultCategory || '').trim()) {
        errors.push('dealFlow.defaultCategory must be a non-empty string');
      }

      const allowedCategories = pickFirstDefined(dealFlow, ['allowedCategories', 'allowed_categories']);
      if (allowedCategories !== undefined) {
        if (!Array.isArray(allowedCategories)) {
          errors.push('dealFlow.allowedCategories must be an array');
        } else if (allowedCategories.some((entry) => !String(entry || '').trim())) {
          errors.push('dealFlow.allowedCategories cannot contain empty values');
        }
      }

      if (dealFlow.templates !== undefined) {
        if (!Array.isArray(dealFlow.templates)) {
          errors.push('dealFlow.templates must be an array');
        } else {
          dealFlow.templates.forEach((template: any, index: number) => {
            if (!isPlainObject(template)) {
              errors.push(`dealFlow.templates[${index}] must be an object`);
              return;
            }
            if (!String(template.id || '').trim()) errors.push(`dealFlow.templates[${index}].id is required`);
            if (!String(template.label || '').trim()) errors.push(`dealFlow.templates[${index}].label is required`);
            if (!String(template.category || '').trim()) errors.push(`dealFlow.templates[${index}].category is required`);
          });
        }
      }

      if (dealFlow.timeline !== undefined) {
        if (!isPlainObject(dealFlow.timeline)) {
          errors.push('dealFlow.timeline must be an object');
        } else {
          ['briefs', 'proposals', 'contracts'].forEach((key) => {
            if (dealFlow.timeline[key] !== undefined && typeof dealFlow.timeline[key] !== 'boolean') {
              errors.push(`dealFlow.timeline.${key} must be boolean`);
            }
          });
        }
      }

      const proposalDefaults = dealFlow.proposalDefaults ?? dealFlow.proposal_defaults;
      if (proposalDefaults !== undefined) {
        if (!isPlainObject(proposalDefaults)) {
          errors.push('dealFlow.proposalDefaults must be an object');
        } else {
          const timelineDays = pickFirstDefined(proposalDefaults, ['timelineDays', 'timeline_days']);
          if (timelineDays !== undefined) {
            const numeric = Number(timelineDays);
            if (!Number.isFinite(numeric) || numeric < 1 || numeric > 365) {
              errors.push('dealFlow.proposalDefaults.timelineDays must be between 1 and 365');
            }
          }

          const paymentCycle = pickFirstDefined(proposalDefaults, ['paymentCycle', 'payment_cycle']);
          if (paymentCycle !== undefined) {
            const normalized = String(paymentCycle || '').trim().toUpperCase();
            if (!['WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(normalized)) {
              errors.push('dealFlow.proposalDefaults.paymentCycle must be one of WEEKLY, BIWEEKLY, MONTHLY');
            }
          }
        }
      }

      const contractTemplates = pickFirstDefined(dealFlow, ['contractTemplates', 'contract_templates']);
      if (contractTemplates !== undefined) {
        if (!Array.isArray(contractTemplates)) {
          errors.push('dealFlow.contractTemplates must be an array');
        } else {
          contractTemplates.forEach((template: any, index: number) => {
            if (!isPlainObject(template)) {
              errors.push(`dealFlow.contractTemplates[${index}] must be an object`);
              return;
            }
            if (!String(template.id || '').trim()) errors.push(`dealFlow.contractTemplates[${index}].id is required`);
            if (!String(template.label || '').trim()) errors.push(`dealFlow.contractTemplates[${index}].label is required`);
            const contractType = String(template.contractType ?? template.contract_type ?? '').trim().toUpperCase();
            if (contractType && !['FIXED', 'HOURLY'].includes(contractType)) {
              errors.push(`dealFlow.contractTemplates[${index}].contractType must be FIXED or HOURLY`);
            }
            const paymentCycle = String(template.paymentCycle ?? template.payment_cycle ?? '').trim().toUpperCase();
            if (paymentCycle && !['WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(paymentCycle)) {
              errors.push(`dealFlow.contractTemplates[${index}].paymentCycle must be WEEKLY, BIWEEKLY, or MONTHLY`);
            }
            const milestoneCount = pickFirstDefined(template, ['milestoneCount', 'milestone_count']);
            if (milestoneCount !== undefined) {
              const numeric = Number(milestoneCount);
              if (!Number.isFinite(numeric) || numeric < 0 || numeric > 12) {
                errors.push(`dealFlow.contractTemplates[${index}].milestoneCount must be between 0 and 12`);
              }
            }
          });
        }
      }

      const contractDefaults = dealFlow.contractDefaults ?? dealFlow.contract_defaults;
      if (contractDefaults !== undefined) {
        if (!isPlainObject(contractDefaults)) {
          errors.push('dealFlow.contractDefaults must be an object');
        } else {
          const numericRules: Array<{ key: string; min: number; max: number }> = [
            { key: 'startLeadDays', min: 0, max: 30 },
            { key: 'fixedMilestoneCount', min: 1, max: 12 },
            { key: 'hourlyWeeklyCap', min: 1, max: 168 },
            { key: 'upfrontPercent', min: 0, max: 100 }
          ];
          numericRules.forEach(({ key, min, max }) => {
            const raw = pickFirstDefined(contractDefaults, [key, key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)]);
            if (raw === undefined) return;
            const numeric = Number(raw);
            if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
              errors.push(`dealFlow.contractDefaults.${key} must be between ${min} and ${max}`);
            }
          });
        }
      }

      const contractRules = dealFlow.contractRules ?? dealFlow.contract_rules;
      if (contractRules !== undefined) {
        if (!isPlainObject(contractRules)) {
          errors.push('dealFlow.contractRules must be an object');
        } else {
          ['allowFixedContracts', 'allowHourlyContracts', 'requireMilestonesForFixed'].forEach((key) => {
            const raw = pickFirstDefined(contractRules, [key, key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)]);
            if (raw !== undefined && typeof raw !== 'boolean') {
              errors.push(`dealFlow.contractRules.${key} must be boolean`);
            }
          });
          const maxMilestones = pickFirstDefined(contractRules, ['maxMilestones', 'max_milestones']);
          if (maxMilestones !== undefined) {
            const numeric = Number(maxMilestones);
            if (!Number.isFinite(numeric) || numeric < 1 || numeric > 20) {
              errors.push('dealFlow.contractRules.maxMilestones must be between 1 and 20');
            }
          }
        }
      }

      const feePolicy = dealFlow.feePolicy ?? dealFlow.fee_policy;
      if (feePolicy !== undefined) {
        if (!isPlainObject(feePolicy)) {
          errors.push('dealFlow.feePolicy must be an object');
        } else {
          ['clientFeePercent', 'contractorFeePercent'].forEach((key) => {
            const raw = pickFirstDefined(feePolicy, [key, key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)]);
            if (raw === undefined) return;
            const numeric = Number(raw);
            if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
              errors.push(`dealFlow.feePolicy.${key} must be between 0 and 100`);
            }
          });
          const allowDeposits = pickFirstDefined(feePolicy, ['allowDeposits', 'allow_deposits']);
          if (allowDeposits !== undefined && typeof allowDeposits !== 'boolean') {
            errors.push('dealFlow.feePolicy.allowDeposits must be boolean');
          }
        }
      }
    }
  }

  if (obj.storefront !== undefined || obj.storefront_settings !== undefined) {
    const storefront = (obj.storefront ?? obj.storefront_settings) as Record<string, any>;
    if (!isPlainObject(storefront)) {
      errors.push('storefront must be an object');
    } else {
      const booleanRules: Array<{ key: string; aliases?: string[] }> = [
        { key: 'enabled' },
        { key: 'userProfilesEnabled', aliases: ['user_profiles_enabled'] },
        { key: 'businessPagesEnabled', aliases: ['business_pages_enabled'] }
      ];
      for (const rule of booleanRules) {
        const raw = pickFirstDefined(storefront, [rule.key, ...(rule.aliases || [])]);
        if (raw === undefined) continue;
        if (typeof raw !== 'boolean') {
          errors.push(`storefront.${rule.key} must be boolean`);
        }
      }

      if (storefront.roles !== undefined) {
        if (!isPlainObject(storefront.roles)) {
          errors.push('storefront.roles must be an object');
        } else {
          ['user', 'freelancer', 'employer', 'business', 'admin'].forEach((key) => {
            if (storefront.roles[key] !== undefined && typeof storefront.roles[key] !== 'boolean') {
              errors.push(`storefront.roles.${key} must be boolean`);
            }
          });
        }
      }

      if (storefront.modules !== undefined) {
        if (!isPlainObject(storefront.modules)) {
          errors.push('storefront.modules must be an object');
        } else {
          [
            ['merchantSummary', 'merchant_summary'],
            ['userGigs', 'user_gigs'],
            ['businessPackages', 'business_packages']
          ].forEach(([camel, snake]) => {
            const raw = pickFirstDefined(storefront.modules, [camel, snake]);
            if (raw !== undefined && typeof raw !== 'boolean') {
              errors.push(`storefront.modules.${camel} must be boolean`);
            }
          });
        }
      }

      [
        ['maxFeaturedItems', 'max_featured_items', 1, 12],
        ['maxCatalogItems', 'max_catalog_items', 1, 60]
      ].forEach(([camel, snake, min, max]) => {
        const raw = pickFirstDefined(storefront, [camel as string, snake as string]);
        if (raw === undefined) return;
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) {
          errors.push(`storefront.${camel} must be a number`);
          return;
        }
        if (numeric < (min as number) || numeric > (max as number)) {
          errors.push(`storefront.${camel} must be between ${min} and ${max}`);
        }
      });
    }
  }

  if (
    obj.contentOffers !== undefined ||
    obj.content_offers !== undefined ||
    obj.contentOfferTags !== undefined ||
    obj.content_offer_tags !== undefined
  ) {
    const contentOffers = (
      obj.contentOffers ??
      obj.content_offers ??
      obj.contentOfferTags ??
      obj.content_offer_tags
    ) as Record<string, any>;
    if (!isPlainObject(contentOffers)) {
      errors.push('contentOffers must be an object');
    } else {
      const booleanRules: Array<{ key: string; aliases?: string[] }> = [
        { key: 'enabled' },
        { key: 'postsEnabled', aliases: ['posts_enabled'] },
        { key: 'scrollEnabled', aliases: ['scroll_enabled'] },
        { key: 'liveEnabled', aliases: ['live_enabled'] }
      ];
      for (const rule of booleanRules) {
        const raw = pickFirstDefined(contentOffers, [rule.key, ...(rule.aliases || [])]);
        if (raw === undefined) continue;
        if (typeof raw !== 'boolean') {
          errors.push(`contentOffers.${rule.key} must be boolean`);
        }
      }

      if (contentOffers.roles !== undefined) {
        if (!isPlainObject(contentOffers.roles)) {
          errors.push('contentOffers.roles must be an object');
        } else {
          ['user', 'freelancer', 'employer', 'business', 'admin'].forEach((key) => {
            if (contentOffers.roles[key] !== undefined && typeof contentOffers.roles[key] !== 'boolean') {
              errors.push(`contentOffers.roles.${key} must be boolean`);
            }
          });
        }
      }

      if (contentOffers.modules !== undefined) {
        if (!isPlainObject(contentOffers.modules)) {
          errors.push('contentOffers.modules must be an object');
        } else {
          [
            ['userGigs', 'user_gigs'],
            ['businessPackages', 'business_packages'],
            ['storefrontCta', 'storefront_cta'],
            ['messageCta', 'message_cta'],
            ['briefCta', 'brief_cta']
          ].forEach(([camel, snake]) => {
            const raw = pickFirstDefined(contentOffers.modules, [camel, snake]);
            if (raw !== undefined && typeof raw !== 'boolean') {
              errors.push(`contentOffers.modules.${camel} must be boolean`);
            }
          });
        }
      }

      const maxTags = pickFirstDefined(contentOffers, ['maxTagsPerContent', 'max_tags_per_content']);
      if (maxTags !== undefined) {
        const numeric = Number(maxTags);
        if (!Number.isFinite(numeric) || numeric < 1 || numeric > 6) {
          errors.push('contentOffers.maxTagsPerContent must be between 1 and 6');
        }
      }

      const moderationMode = pickFirstDefined(contentOffers, ['moderationMode', 'moderation_mode']);
      if (moderationMode !== undefined) {
        const normalized = String(moderationMode || '').trim().toLowerCase();
        if (!['off', 'review', 'strict'].includes(normalized)) {
          errors.push('contentOffers.moderationMode must be one of off, review, strict');
        }
      }

      const restrictedCategories = pickFirstDefined(contentOffers, ['restrictedCategories', 'restricted_categories']);
      if (restrictedCategories !== undefined) {
        const valid =
          Array.isArray(restrictedCategories) ||
          typeof restrictedCategories === 'string';
        if (!valid) {
          errors.push('contentOffers.restrictedCategories must be an array or comma-separated string');
        }
      }
    }
  }

  return errors;
};

export const getSystemSettings = async (req: Request, res: Response) => {
  // Try DB first; if DB unavailable, fall back to file persistence used in admin routes
  const SETTINGS_DIR = path.resolve(__dirname, '../../../data');
  const SETTINGS_FILE = path.join(SETTINGS_DIR, 'platform-system-settings.json');

  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    const data = hydrateSystemSettings(record?.data ?? DEFAULT_SYSTEM);
    (req.app as any)?.set?.('runtime:systemSettings', data);
    (req.app as any)?.set?.('runtime:systemSettingsVersion', Date.now());
    (req.app as any)?.set?.('runtime:optimizationConfig', normalizeRuntimeOptimizationConfig((data as any)?.optimization));
    invalidateSystemControlsCache();
    return res.json({ success: true, data });
  } catch (error) {
    console.warn('getSystemSettings DB error, attempting file fallback', error);
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.system) {
          const data = hydrateSystemSettings(parsed.system);
          (req.app as any)?.set?.('runtime:systemSettings', data);
          (req.app as any)?.set?.('runtime:systemSettingsVersion', Date.now());
          (req.app as any)?.set?.('runtime:optimizationConfig', normalizeRuntimeOptimizationConfig((data as any)?.optimization));
          return res.json({ success: true, data });
        }
        if (parsed && parsed.platform) {
          // older platform-only file; return defaults merged
          const data = hydrateSystemSettings(DEFAULT_SYSTEM);
          (req.app as any)?.set?.('runtime:systemSettings', data);
          (req.app as any)?.set?.('runtime:systemSettingsVersion', Date.now());
          (req.app as any)?.set?.('runtime:optimizationConfig', normalizeRuntimeOptimizationConfig((data as any)?.optimization));
          return res.json({ success: true, data });
        }
      }
    } catch (fsErr) {
      console.warn('Failed to read persisted settings file', fsErr);
    }
    return res.json({ success: true, data: DEFAULT_SYSTEM });
  }
};

export const updateSystemSettings = async (req: Request, res: Response) => {
  let merged: any;
  try {
    const payload = req.body || {};

    // Load existing
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    const existing = hydrateSystemSettings(record?.data ?? DEFAULT_SYSTEM);

    // Merge safely
    merged = deepMergeReplaceArrays(existing, payload);
    merged = hydrateSystemSettings(merged);

    // Validation
    const errors = validateSystem(merged);
    if (errors.length) {
      return res.status(400).json({ success: false, error: errors.join('; '), timestamp: new Date().toISOString() });
    }

    // Upsert
    const upserted = await prisma.appSetting.upsert({
      where: { scope: 'system' },
      create: { scope: 'system', data: merged },
      update: { data: merged }
    });

    // Emit socket event
    const io = (req.app as unknown as { get?: (k: string) => unknown }).get?.('io') as { emit?: (ev: string, payload: unknown) => void } | undefined;
    io?.emit?.('settings:updated', { scope: 'system', settings: merged });
    (req.app as any)?.set?.('runtime:systemSettings', merged);
    (req.app as any)?.set?.('runtime:systemSettingsVersion', Date.now());
    (req.app as any)?.set?.('runtime:optimizationConfig', normalizeRuntimeOptimizationConfig((merged as any)?.optimization));
    invalidateSystemControlsCache();

    await recordGovernedAdminAction(req, {
      moduleKey: 'settings',
      actionKey: 'system_settings_update',
      entityType: 'system_settings',
      entityId: 'system',
      message: 'System settings updated',
      metadata: {
        scope: 'system',
        keys: Object.keys(payload || {}),
        maintenanceMode: merged.maintenanceMode,
        registrationsEnabled: merged.registrationsEnabled,
        kycEnforced: merged.kycEnforced,
        admin2FA: merged.admin2FA
      },
      approvalActionKey: 'enterprise_change',
      approvalEntityType: 'system_settings',
      approvalTitle: 'System settings updated'
    });

    return res.json({ success: true, data: merged });
  } catch (error) {
    console.error('updateSystemSettings DB error, attempting file fallback', error);
    // Attempt file-based persistence as a fallback (use same file as admin router)
    try {
      const SETTINGS_DIR = path.resolve(__dirname, '../../../data');
      const SETTINGS_FILE = path.join(SETTINGS_DIR, 'platform-system-settings.json');
      fs.mkdirSync(SETTINGS_DIR, { recursive: true });
      const existingRaw = fs.existsSync(SETTINGS_FILE) ? fs.readFileSync(SETTINGS_FILE, 'utf-8') : '{}';
      let existing: Record<string, unknown> = {};
      try { existing = existingRaw ? JSON.parse(existingRaw) : {}; } catch (e) { existing = {}; }
      existing['system'] = merged;
      writeFileAtomicallySync(SETTINGS_FILE, JSON.stringify(existing, null, 2));
      const io = (req.app as unknown as { get?: (k: string) => unknown }).get?.('io') as { emit?: (ev: string, payload: unknown) => void } | undefined;
      io?.emit?.('settings:updated', { scope: 'system', settings: merged });
      (req.app as any)?.set?.('runtime:systemSettings', merged);
      (req.app as any)?.set?.('runtime:systemSettingsVersion', Date.now());
      (req.app as any)?.set?.('runtime:optimizationConfig', normalizeRuntimeOptimizationConfig((merged as any)?.optimization));
      console.log('[admin] Persisted system settings to', SETTINGS_FILE);
      await recordGovernedAdminAction(req, {
        moduleKey: 'settings',
        actionKey: 'system_settings_update',
        entityType: 'system_settings',
        entityId: 'system',
        message: 'System settings updated via fallback persistence',
        metadata: { scope: 'system', fallback: 'file' },
        approvalActionKey: 'enterprise_change',
        approvalEntityType: 'system_settings',
        approvalTitle: 'System settings updated'
      });
      return res.json({ success: true, data: merged, fallback: 'file' });
    } catch (fsErr) {
      console.error('Failed to write fallback settings file', fsErr);
      return res.status(500).json({ success: false, error: 'Failed to save system settings', timestamp: new Date().toISOString() });
    }
  }
};

export const testEmailSettings = async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const to = payload.to || payload.email || payload.recipient;
    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient email is required' });
    }

    const providedConfig = payload.config || payload.emailConfig || payload.smtp || null;
    let config = providedConfig;

    if (!config) {
      const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
      const data = record?.data as any;
      config = data?.email || null;
    }

    if (!config) {
      return res.status(400).json({ success: false, error: 'Email configuration not found' });
    }

    const normalized = normalizeEmailSettings(config);
    const validationErrors = validateEmailSettings(normalized);
    if (validationErrors.length || !normalized) {
      return res.status(400).json({ success: false, error: validationErrors[0] || 'Invalid email configuration' });
    }

    const transporter = createEmailTransporter(normalized);
    if (typeof transporter.verify === 'function') {
      await transporter.verify();
    }

    await transporter.sendMail({
      from: `${normalized.fromName} <${normalized.fromEmail}>`,
      to,
      subject: `Scrolith Email Test (${normalized.provider.toUpperCase()})`,
      text: `This is a test email from Scrolith System Settings using ${normalized.provider.toUpperCase()}. If you received this, your email provider configuration is working.`
    });

    return res.json({ success: true, message: `Test email sent to ${to}`, provider: normalized.provider });
  } catch (error: any) {
    console.error('SMTP test failed', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to send test email' });
  }
};

export default { getSystemSettings, updateSystemSettings, testEmailSettings };
