# Phase 26 — Multilingual Intelligence, Language Preferences & Translation Hardening

**Status:** Implemented (not deployed)  
**deploymentPerformed:** false  

## Audit summary (existing system)

| Area | Finding |
|------|---------|
| Translator | `contentTranslation.service.ts` — self-hosted **m2m100** or **mock** |
| Detector | Runtime `/detect` with `fasttext_lid_176` (or mock heuristics) |
| Engine locales | `en`, `es`, `fr`, `tl`, `ha`, `sw`, `zh`, `ar` |
| Post fields | `sourceLanguage`, `sourceLanguageConfidence`, `contentHash`, `translationVersion` |
| Cache | `ContentTranslation` + `ContentLanguageDetection` tables |
| UI | `TranslatablePostText` — “See translation” vs UI locale only |
| User “languages” | `Profile.languages` = freelancing skills, **not** understood languages |
| Onboarding | Follow-only (`FollowOnboarding`) — no language step (pre-26) |
| CMS i18n | Separate UI dictionary (`TranslationKey` / `LanguageConfig`) |

### Unknown root causes addressed

- Empty / media / emoji / URL-only treated as **no_linguistic_content** (not “unknown”)
- Provider failures → **detection_failed** with async-safe retry on next edit/create
- Unmapped aliases → canonical normalize via catalog
- Detection only ran when config.enabled; still improved mock/heuristic layer when provider weak
- Frontend always showed “unknown” when missing — now shows “Language unresolved” / hides for non-linguistic content
- No understood-language suppression before Phase 26

## Architecture after Phase 26

```
Post create/update
  → upsertCommunityPostLanguageMetadata
  → runtime detect (existing) + buildLanguageDetectionResult (hardened)
  → sourceLanguage + languageDetectionStatus + isMixedLanguage + detectedLanguageCodes

User prefs
  → understoodLanguages[] (confirmed)
  → preferredTranslationLanguage
  → suggestions / auto-translate flags

Feed UI (TranslatablePostText)
  → evaluateTranslationDecision(viewer prefs, post language)
  → suppress recommend when USER_UNDERSTANDS_LANGUAGE
  → still allow manual Translate

Onboarding / Settings
  → LanguageMultiSelect (no flags)
  → PUT /auth/me/language-preferences
```

## Canonical catalog

Source: `geezle-backend/src/services/language/supportedLanguages.catalog.ts`  
Frontend mirror: `geezle/src/utils/supportedLanguages.ts`

Translation-supported: **en, es, fr, tl, ha, sw, zh, ar**  
Onboarding-visible includes additional detection languages (hi, id, ur, pt, de, ja, ko, tr, ru, bn) without false translation claims.

## Migration

```json
{
  "migrationRequired": true,
  "migrationName": "20260720190000_phase26_multilingual_intelligence",
  "migrationSafety": "ADDITIVE"
}
```

User fields: `understoodLanguages`, `preferredTranslationLanguage`, `languageSuggestionsEnabled`, `autoTranslateEnabled`, `languagePreferencesUpdatedAt`, `languagePreferencesConfirmed`  
Post fields: `languageDetectionStatus`, `isMixedLanguage`, `detectedLanguageCodes`, `languageManuallySet`, `languageDetectedAt`

## APIs

| Method | Path |
|--------|------|
| GET | `/api/auth/languages/catalog` |
| GET | `/api/auth/me/language-preferences` |
| PUT/PATCH | `/api/auth/me/language-preferences` |
| GET | `/api/community/posts/:postId/translation-decision` |
| POST | `/api/community/posts/:postId/language` (manual correction) |

## Confidence policy

```ts
LANGUAGE_CONFIDENCE = { high: 0.85, medium: 0.65, low: 0.40 }
```

## Security & privacy

- Languages ≠ nationality/ethnicity/location
- No sensitive trait inference
- Manual language corrections audited
- Secrets unchanged; translation runtime key still redacted in admin config

## Performance (local/unit baseline)

| Metric | Note |
|--------|------|
| Detection helpers | Pure CPU, &lt;1ms typical on short text in unit tests |
| Decision policy | Pure, O(n) languages |
| Catalog search | In-memory filter |
| Feed impact | Prefs cached per session in `TranslatablePostText` |
| Cache | Existing `ContentTranslation` TTL unchanged |

Label results as **local unit estimates** until Phase 26A production metrics.

## Historical backfill (26A)

1. Migrate schema.  
2. Dry-run: count posts with null `sourceLanguage` and non-empty text.  
3. Batch re-run `upsertCommunityPostLanguageMetadata` (skip `languageManuallySet`).  
4. Invite existing users to confirm understood languages (no silent permanent inference).

## Phase 26A plan

1. Apply migration.  
2. Deploy backend then frontend (prefs API required before UI).  
3. Smoke: onboarding language step, settings save, post create detection, translation suppress for understood language.  
4. Monitor detection_failed rate, exchange/cache hits, onboarding completion.

## Regression

Do not break feed identity, Scroll deep links, messaging privacy, Community routes, OAuth callbacks, Android push.

## Known limitations

- Segmented mixed-language translation not implemented (whole-post translate).  
- Scrolitha full ranking rewrite deferred — policy helper available for integration.  
- Physical Android language QA in 26A.  
- Translation engine still only fully supports 8 locales.
