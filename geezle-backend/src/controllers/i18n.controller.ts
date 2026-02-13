import type { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const DEFAULT_SCOPE = 'default';
const DEFAULT_LOCALE = 'en';
const MAX_PAGE_SIZE = 100;

const DEFAULT_RTL_LOCALES = ['ar', 'he', 'fa', 'ur'];

const success = (res: Response, data: any, message = '') =>
  res.json({ success: true, data, message });

const fail = (res: Response, status: number, message: string, data: any = null) =>
  res.status(status).json({ success: false, data, message });

const asString = (value: unknown) => String(value ?? '').trim();

const normalizeLocale = (value: unknown, fallback = DEFAULT_LOCALE) => {
  const locale = asString(value).toLowerCase().replace('_', '-');
  return locale || fallback;
};

const normalizeLocaleList = (value: unknown, fallback: string[] = []) => {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,]/)
      : [];
  const dedup = new Set(
    source
      .map((item) => normalizeLocale(item))
      .filter(Boolean)
  );
  const list = Array.from(dedup);
  return list.length ? list : fallback;
};

const parseIntSafe = (value: unknown, fallback: number, min = 1, max = 1000) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const csvEscape = (value: unknown) => {
  const raw = String(value ?? '');
  if (/["\n,]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
};

const setPublicCache = (res: Response, maxAgeSeconds: number) => {
  const ttl = Number.isFinite(maxAgeSeconds) ? Math.max(1, Math.floor(maxAgeSeconds)) : 60;
  res.setHeader('Cache-Control', `public, max-age=${ttl}`);
};

// Basic CSV parser with quote support.
const parseCsv = (csvText: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  const pushValue = () => {
    row.push(value);
    value = '';
  };

  const pushRow = () => {
    // Skip trailing empty line.
    if (row.length === 1 && row[0] === '' && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      pushValue();
      continue;
    }

    if (char === '\n') {
      pushValue();
      pushRow();
      continue;
    }

    if (char === '\r') continue;

    value += char;
  }

  pushValue();
  if (row.length) pushRow();
  return rows;
};

const getLanguageConfig = async () => {
  let config = await prisma.languageConfig.findUnique({
    where: { scope: DEFAULT_SCOPE }
  });

  if (!config) {
    config = await prisma.languageConfig.create({
      data: {
        scope: DEFAULT_SCOPE,
        defaultLocale: DEFAULT_LOCALE,
        enabledLocales: [DEFAULT_LOCALE],
        rtlLocales: DEFAULT_RTL_LOCALES
      }
    });
  }
  return config;
};

const emitI18n = (req: Request, event: string, payload: Record<string, any>) => {
  try {
    const io = req.app.get('io');
    io?.emit(event, { ...payload, timestamp: new Date().toISOString() });
  } catch (error) {
    console.warn('[i18n] failed to emit socket event', event, error);
  }
};

const getDictionaryMap = async (locale: string, fallbackLocale: string) => {
  const normalizedLocale = normalizeLocale(locale, fallbackLocale);
  const normalizedFallback = normalizeLocale(fallbackLocale, DEFAULT_LOCALE);

  const targetRows = await prisma.translationValue.findMany({
    where: {
      locale: normalizedLocale,
      translationKey: { isActive: true }
    },
    include: {
      translationKey: {
        select: {
          key: true
        }
      }
    }
  });

  const dictionary: Record<string, string> = {};
  targetRows.forEach((row) => {
    dictionary[row.translationKey.key] = row.value;
  });

  if (normalizedLocale !== normalizedFallback) {
    const fallbackRows = await prisma.translationValue.findMany({
      where: {
        locale: normalizedFallback,
        translationKey: { isActive: true }
      },
      include: {
        translationKey: {
          select: {
            key: true
          }
        }
      }
    });
    fallbackRows.forEach((row) => {
      if (dictionary[row.translationKey.key] === undefined) {
        dictionary[row.translationKey.key] = row.value;
      }
    });
  }

  return dictionary;
};

const parseImportRows = (req: Request) => {
  const body = (req.body || {}) as any;
  const format = asString(body.format).toLowerCase();
  const defaultLocale = normalizeLocale(body.locale || DEFAULT_LOCALE);
  const rows: Array<{
    key: string;
    locale: string;
    value: string;
    namespace?: string | null;
    description?: string | null;
  }> = [];

  const errors: string[] = [];
  const warnings: string[] = [];

  if (Array.isArray(body.rows)) {
    body.rows.forEach((row: any) => {
      const key = asString(row?.key);
      const locale = normalizeLocale(row?.locale || defaultLocale);
      if (!key) {
        errors.push('row.key is required');
        return;
      }
      rows.push({
        key,
        locale,
        value: String(row?.value ?? ''),
        namespace: asString(row?.namespace) || null,
        description: asString(row?.description) || null
      });
    });
    return { rows, errors, warnings };
  }

  const objectMap = body.dictionary || body.data || body.map;
  if (objectMap && typeof objectMap === 'object' && !Array.isArray(objectMap)) {
    Object.entries(objectMap).forEach(([keyRaw, valueRaw]) => {
      const key = asString(keyRaw);
      if (!key) return;
      rows.push({
        key,
        locale: defaultLocale,
        value: String(valueRaw ?? '')
      });
    });
    return { rows, errors, warnings };
  }

  const jsonRaw = asString(body.json || body.contentJson || (format === 'json' ? body.content : ''));
  if (format === 'json' && jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (Array.isArray(parsed)) {
        parsed.forEach((row: any) => {
          const key = asString(row?.key);
          const locale = normalizeLocale(row?.locale || defaultLocale);
          if (!key) {
            errors.push('row.key is required');
            return;
          }
          rows.push({
            key,
            locale,
            value: String(row?.value ?? ''),
            namespace: asString(row?.namespace) || null,
            description: asString(row?.description) || null
          });
        });
      } else if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([keyRaw, valueRaw]) => {
          const key = asString(keyRaw);
          if (!key) return;
          rows.push({
            key,
            locale: defaultLocale,
            value: String(valueRaw ?? '')
          });
        });
      } else {
        errors.push('Invalid JSON import payload format');
      }
    } catch {
      errors.push('Invalid JSON content');
    }
    return { rows, errors, warnings };
  }

  const csvRaw = asString(body.csv || body.content || body.payload);
  if (format === 'csv' || csvRaw.includes(',')) {
    const parsed = parseCsv(csvRaw);
    if (!parsed.length) return { rows, errors, warnings };
    const header = parsed[0].map((cell) => asString(cell).toLowerCase());
    const idxKey = header.indexOf('key');
    const idxLocale = header.indexOf('locale');
    const idxValue = header.indexOf('value');
    const idxNamespace = header.indexOf('namespace');
    const idxDescription = header.indexOf('description');
    if (idxKey < 0) warnings.push('CSV header did not include key; using first column as key');
    if (idxValue < 0) warnings.push('CSV header did not include value; using second column as value');

    parsed.slice(1).forEach((line) => {
      const key = asString(line[idxKey >= 0 ? idxKey : 0]);
      const value = String(line[idxValue >= 0 ? idxValue : 1] ?? '');
      if (!key) {
        errors.push('CSV row has empty key');
        return;
      }
      rows.push({
        key,
        locale: normalizeLocale(line[idxLocale >= 0 ? idxLocale : -1] || defaultLocale),
        value,
        namespace: idxNamespace >= 0 ? asString(line[idxNamespace]) || null : null,
        description: idxDescription >= 0 ? asString(line[idxDescription]) || null : null
      });
    });
  }

  return { rows, errors, warnings };
};

export const getI18nConfigPublic = async (_req: Request, res: Response) => {
  try {
    const config = await getLanguageConfig();
    setPublicCache(res, Math.max(config.dictionaryCacheSeconds, config.overridesCacheSeconds, 60));
    return success(
      res,
      {
        defaultLocale: config.defaultLocale,
        enabledLocales: config.enabledLocales,
        rtlLocales: config.rtlLocales,
        dictionaryCacheSeconds: config.dictionaryCacheSeconds,
        overridesCacheSeconds: config.overridesCacheSeconds
      },
      'i18n config loaded'
    );
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to load i18n config');
  }
};

export const getI18nDictionaryPublic = async (req: Request, res: Response) => {
  try {
    const config = await getLanguageConfig();
    const locale = normalizeLocale(req.query.locale, config.defaultLocale);
    const dictionary = await getDictionaryMap(locale, config.defaultLocale);
    setPublicCache(res, config.dictionaryCacheSeconds);
    return success(
      res,
      {
        locale,
        defaultLocale: config.defaultLocale,
        dictionary
      },
      'dictionary loaded'
    );
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to load dictionary');
  }
};

export const getI18nOverridesPublic = async (req: Request, res: Response) => {
  try {
    const config = await getLanguageConfig();
    const locale = normalizeLocale(req.query.locale, config.defaultLocale);
    const localeCandidates = Array.from(
      new Set(
        [locale, config.defaultLocale, '*']
          .map((entry) => normalizeLocale(entry))
          .filter(Boolean)
      )
    );
    const overrides = await prisma.textOverride.findMany({
      where: {
        enabled: true,
        locale: { in: localeCandidates }
      },
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }]
    });
    setPublicCache(res, config.overridesCacheSeconds);

    return success(
      res,
      {
        locale,
        overrides: overrides.map((item) => ({
          id: item.id,
          locale: item.locale,
          matchText: item.matchText,
          replacementText: item.replacementText,
          isRegex: item.isRegex,
          enabled: item.enabled,
          priority: item.priority,
          updatedAt: item.updatedAt
        }))
      },
      'overrides loaded'
    );
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to load overrides');
  }
};

export const getAdminI18nConfig = async (_req: Request, res: Response) => {
  try {
    const config = await getLanguageConfig();
    return success(res, config, 'i18n config loaded');
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to load i18n config');
  }
};

export const updateAdminI18nConfig = async (req: Request, res: Response) => {
  try {
    const existing = await getLanguageConfig();
    const defaultLocale = normalizeLocale(req.body?.defaultLocale, existing.defaultLocale);
    const enabledLocales = normalizeLocaleList(req.body?.enabledLocales, existing.enabledLocales);
    const rtlLocales = normalizeLocaleList(req.body?.rtlLocales, existing.rtlLocales);

    if (!enabledLocales.includes(defaultLocale)) {
      enabledLocales.unshift(defaultLocale);
    }

    const updated = await prisma.languageConfig.update({
      where: { id: existing.id },
      data: {
        defaultLocale,
        enabledLocales,
        rtlLocales,
        dictionaryCacheSeconds: parseIntSafe(
          req.body?.dictionaryCacheSeconds,
          existing.dictionaryCacheSeconds,
          1,
          86400
        ),
        overridesCacheSeconds: parseIntSafe(
          req.body?.overridesCacheSeconds,
          existing.overridesCacheSeconds,
          1,
          86400
        ),
        updatedByAdminId: req.user?.id || null
      }
    });

    emitI18n(req, 'i18n:updated', { locale: '*' });
    return success(res, updated, 'i18n config updated');
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to update i18n config');
  }
};

export const listAdminI18nKeys = async (req: Request, res: Response) => {
  try {
    const search = asString(req.query.search);
    const page = parseIntSafe(req.query.page, 1, 1, 100000);
    const limit = parseIntSafe(req.query.limit, 25, 1, MAX_PAGE_SIZE);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (asString(req.query.includeInactive).toLowerCase() !== 'true') {
      where.isActive = true;
    }
    if (search) {
      where.OR = [
        { key: { contains: search, mode: 'insensitive' } },
        { namespace: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        {
          values: {
            some: {
              value: { contains: search, mode: 'insensitive' }
            }
          }
        }
      ];
    }

    const [items, total] = await Promise.all([
      prisma.translationKey.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          values: {
            select: {
              locale: true
            }
          },
          _count: {
            select: { values: true }
          }
        }
      }),
      prisma.translationKey.count({ where })
    ]);

    return success(
      res,
      {
        items,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      },
      'keys loaded'
    );
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to list translation keys');
  }
};

export const createAdminI18nKey = async (req: Request, res: Response) => {
  try {
    const key = asString(req.body?.key);
    if (!key) return fail(res, 400, 'key is required');

    const created = await prisma.translationKey.create({
      data: {
        key,
        namespace: asString(req.body?.namespace) || null,
        description: asString(req.body?.description) || null,
        isActive: req.body?.isActive !== false
      }
    });

    emitI18n(req, 'i18n:updated', { locale: '*' });
    return success(res, created, 'translation key created');
  } catch (error: any) {
    if (String(error?.code) === 'P2002') {
      return fail(res, 409, 'translation key already exists');
    }
    return fail(res, 500, error?.message || 'Failed to create translation key');
  }
};

export const updateAdminI18nKey = async (req: Request, res: Response) => {
  try {
    const id = asString(req.params.id);
    if (!id) return fail(res, 400, 'key id is required');

    const data: any = {};
    if (req.body?.key !== undefined) data.key = asString(req.body.key);
    if (req.body?.namespace !== undefined) data.namespace = asString(req.body.namespace) || null;
    if (req.body?.description !== undefined) data.description = asString(req.body.description) || null;
    if (req.body?.isActive !== undefined) data.isActive = Boolean(req.body.isActive);

    const updated = await prisma.translationKey.update({
      where: { id },
      data
    });

    emitI18n(req, 'i18n:updated', { locale: '*' });
    return success(res, updated, 'translation key updated');
  } catch (error: any) {
    if (String(error?.code) === 'P2025') return fail(res, 404, 'translation key not found');
    if (String(error?.code) === 'P2002') return fail(res, 409, 'translation key already exists');
    return fail(res, 500, error?.message || 'Failed to update translation key');
  }
};

export const deleteAdminI18nKey = async (req: Request, res: Response) => {
  try {
    const id = asString(req.params.id);
    if (!id) return fail(res, 400, 'key id is required');

    const updated = await prisma.translationKey.update({
      where: { id },
      data: { isActive: false }
    });

    emitI18n(req, 'i18n:updated', { locale: '*' });
    return success(res, updated, 'translation key deleted');
  } catch (error: any) {
    if (String(error?.code) === 'P2025') return fail(res, 404, 'translation key not found');
    return fail(res, 500, error?.message || 'Failed to delete translation key');
  }
};

export const listAdminI18nValues = async (req: Request, res: Response) => {
  try {
    const keyId = asString(req.query.keyId);
    const key = asString(req.query.key);
    const locale = asString(req.query.locale) ? normalizeLocale(req.query.locale) : '';

    let translationKeyId = keyId;
    if (!translationKeyId && key) {
      const keyRow = await prisma.translationKey.findUnique({
        where: { key },
        select: { id: true }
      });
      translationKeyId = keyRow?.id || '';
    }

    if (!translationKeyId) {
      return success(res, { items: [] }, 'values loaded');
    }

    const where: any = { translationKeyId };
    if (locale) where.locale = locale;

    const items = await prisma.translationValue.findMany({
      where,
      orderBy: [{ locale: 'asc' }, { updatedAt: 'desc' }]
    });

    return success(res, { items }, 'values loaded');
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to list translation values');
  }
};

export const upsertAdminI18nValue = async (req: Request, res: Response) => {
  try {
    const key = asString(req.body?.key);
    const locale = normalizeLocale(req.body?.locale);
    const value = String(req.body?.value ?? '');
    if (!key) return fail(res, 400, 'key is required');
    if (!locale) return fail(res, 400, 'locale is required');

    const keyRow = await prisma.translationKey.upsert({
      where: { key },
      create: {
        key,
        namespace: asString(req.body?.namespace) || null,
        description: asString(req.body?.description) || null,
        isActive: true
      },
      update: {
        namespace: req.body?.namespace !== undefined ? asString(req.body.namespace) || null : undefined,
        description: req.body?.description !== undefined ? asString(req.body.description) || null : undefined,
        isActive: true
      }
    });

    const updated = await prisma.translationValue.upsert({
      where: {
        translationKeyId_locale: {
          translationKeyId: keyRow.id,
          locale
        }
      },
      create: {
        translationKeyId: keyRow.id,
        locale,
        value,
        updatedByAdminId: req.user?.id || null
      },
      update: {
        value,
        updatedByAdminId: req.user?.id || null
      }
    });

    emitI18n(req, 'i18n:updated', { locale });
    return success(
      res,
      {
        key: keyRow,
        value: updated
      },
      'translation value saved'
    );
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to save translation value');
  }
};

export const listAdminI18nOverrides = async (req: Request, res: Response) => {
  try {
    const locale = asString(req.query.locale) ? normalizeLocale(req.query.locale) : '';
    const page = parseIntSafe(req.query.page, 1, 1, 100000);
    const limit = parseIntSafe(req.query.limit, 50, 1, MAX_PAGE_SIZE);
    const skip = (page - 1) * limit;
    const where: any = {};
    if (locale) where.locale = locale;

    const [items, total] = await Promise.all([
      prisma.textOverride.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }]
      }),
      prisma.textOverride.count({ where })
    ]);

    return success(
      res,
      {
        items,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      },
      'overrides loaded'
    );
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to list overrides');
  }
};

export const createAdminI18nOverride = async (req: Request, res: Response) => {
  try {
    const locale = normalizeLocale(req.body?.locale);
    const matchText = asString(req.body?.matchText);
    const replacementText = String(req.body?.replacementText ?? '');
    if (!locale) return fail(res, 400, 'locale is required');
    if (!matchText) return fail(res, 400, 'matchText is required');

    const created = await prisma.textOverride.create({
      data: {
        locale,
        matchText,
        replacementText,
        isRegex: Boolean(req.body?.isRegex),
        enabled: req.body?.enabled !== false,
        priority: parseIntSafe(req.body?.priority, 100, 1, 100000),
        updatedByAdminId: req.user?.id || null
      }
    });

    emitI18n(req, 'i18n:override_updated', { locale });
    return success(res, created, 'override created');
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to create override');
  }
};

export const updateAdminI18nOverride = async (req: Request, res: Response) => {
  try {
    const id = asString(req.params.id);
    if (!id) return fail(res, 400, 'override id is required');

    const data: any = {
      updatedByAdminId: req.user?.id || null
    };
    if (req.body?.locale !== undefined) data.locale = normalizeLocale(req.body.locale);
    if (req.body?.matchText !== undefined) data.matchText = asString(req.body.matchText);
    if (req.body?.replacementText !== undefined) data.replacementText = String(req.body.replacementText ?? '');
    if (req.body?.isRegex !== undefined) data.isRegex = Boolean(req.body.isRegex);
    if (req.body?.enabled !== undefined) data.enabled = Boolean(req.body.enabled);
    if (req.body?.priority !== undefined) {
      data.priority = parseIntSafe(req.body.priority, 100, 1, 100000);
    }

    const updated = await prisma.textOverride.update({
      where: { id },
      data
    });

    emitI18n(req, 'i18n:override_updated', { locale: updated.locale });
    return success(res, updated, 'override updated');
  } catch (error: any) {
    if (String(error?.code) === 'P2025') return fail(res, 404, 'override not found');
    return fail(res, 500, error?.message || 'Failed to update override');
  }
};

export const deleteAdminI18nOverride = async (req: Request, res: Response) => {
  try {
    const id = asString(req.params.id);
    if (!id) return fail(res, 400, 'override id is required');

    const existing = await prisma.textOverride.findUnique({
      where: { id },
      select: { locale: true }
    });
    await prisma.textOverride.delete({ where: { id } });

    emitI18n(req, 'i18n:override_updated', { locale: existing?.locale || '*' });
    return success(res, { id }, 'override deleted');
  } catch (error: any) {
    if (String(error?.code) === 'P2025') return fail(res, 404, 'override not found');
    return fail(res, 500, error?.message || 'Failed to delete override');
  }
};

export const importAdminI18n = async (req: Request, res: Response) => {
  try {
    const { rows, errors, warnings } = parseImportRows(req);
    if (!rows.length) {
      return fail(res, 400, 'No valid rows to import', {
        validation: {
          errors,
          warnings
        }
      });
    }

    const duplicateKeys = new Set<string>();
    const seen = new Set<string>();
    rows.forEach((row) => {
      const identity = `${row.key}::${row.locale}`;
      if (seen.has(identity)) duplicateKeys.add(identity);
      seen.add(identity);
    });

    const validateOnly = ['1', 'true', 'yes', 'on'].includes(
      asString(req.body?.validateOnly || req.query?.validateOnly).toLowerCase()
    );
    const createdKeys = new Set<string>();
    const updatedValues = new Set<string>();
    const localesTouched = new Set<string>();

    if (validateOnly) {
      return success(
        res,
        {
          rowsReceived: rows.length,
          rowsValid: rows.length,
          keysTouched: new Set(rows.map((row) => row.key)).size,
          valuesUpserted: 0,
          duplicates: Array.from(duplicateKeys),
          validation: {
            errors,
            warnings
          }
        },
        'validation completed'
      );
    }

    for (const row of rows) {
      const keyRow = await prisma.translationKey.upsert({
        where: { key: row.key },
        create: {
          key: row.key,
          namespace: row.namespace || null,
          description: row.description || null,
          isActive: true
        },
        update: {
          namespace: row.namespace || undefined,
          description: row.description || undefined,
          isActive: true
        }
      });

      if (!createdKeys.has(keyRow.id)) createdKeys.add(keyRow.id);
      localesTouched.add(row.locale);

      const upserted = await prisma.translationValue.upsert({
        where: {
          translationKeyId_locale: {
            translationKeyId: keyRow.id,
            locale: row.locale
          }
        },
        create: {
          translationKeyId: keyRow.id,
          locale: row.locale,
          value: row.value,
          updatedByAdminId: req.user?.id || null
        },
        update: {
          value: row.value,
          updatedByAdminId: req.user?.id || null
        }
      });
      updatedValues.add(upserted.id);
    }

    localesTouched.forEach((locale) => emitI18n(req, 'i18n:updated', { locale }));

    return success(
      res,
      {
        rowsReceived: rows.length,
        keysTouched: createdKeys.size,
        valuesUpserted: updatedValues.size,
        duplicates: Array.from(duplicateKeys),
        validation: {
          errors,
          warnings
        }
      },
      'import completed'
    );
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to import translations');
  }
};

export const exportAdminI18n = async (req: Request, res: Response) => {
  try {
    const config = await getLanguageConfig();
    const requestedLocale = asString(req.query.locale).toLowerCase();
    const locale = requestedLocale === 'all'
      ? 'all'
      : normalizeLocale(req.query.locale, config.defaultLocale);
    const format = asString(req.query.format).toLowerCase() || 'json';

    const includeAllLocales = locale === 'all';
    const rows = await prisma.translationKey.findMany({
      where: { isActive: true },
      orderBy: [{ key: 'asc' }],
      include: {
        values: {
          ...(includeAllLocales
            ? {}
            : {
                where: { locale },
                take: 1
              })
        }
      }
    });

    if (format === 'csv') {
      const header = ['key', 'locale', 'value', 'namespace', 'description'].join(',');
      const lines: string[] = [];
      rows.forEach((row) => {
        if (includeAllLocales) {
          if (!row.values.length) {
            lines.push(
              [
                csvEscape(row.key),
                csvEscape(config.defaultLocale),
                csvEscape(''),
                csvEscape(row.namespace || ''),
                csvEscape(row.description || '')
              ].join(',')
            );
            return;
          }
          row.values.forEach((valueRow) => {
            lines.push(
              [
                csvEscape(row.key),
                csvEscape(valueRow.locale),
                csvEscape(valueRow.value || ''),
                csvEscape(row.namespace || ''),
                csvEscape(row.description || '')
              ].join(',')
            );
          });
          return;
        }
        lines.push(
          [
            csvEscape(row.key),
            csvEscape(locale),
            csvEscape(row.values[0]?.value || ''),
            csvEscape(row.namespace || ''),
            csvEscape(row.description || '')
          ].join(',')
        );
      });
      const content = [header, ...lines].join('\n');
      return success(
        res,
        {
          format: 'csv',
          locale,
          filename: `translations-${includeAllLocales ? 'all' : locale}.csv`,
          content
        },
        'export generated'
      );
    }

    const dictionary: Record<string, string> = {};
    const dictionaries: Record<string, Record<string, string>> = {};

    if (includeAllLocales) {
      rows.forEach((row) => {
        row.values.forEach((valueRow) => {
          if (!dictionaries[valueRow.locale]) dictionaries[valueRow.locale] = {};
          dictionaries[valueRow.locale][row.key] = valueRow.value || '';
        });
      });
    } else {
      rows.forEach((row) => {
        dictionary[row.key] = row.values[0]?.value || '';
      });
    }

    return success(
      res,
      {
        format: 'json',
        locale,
        filename: `translations-${includeAllLocales ? 'all' : locale}.json`,
        content: JSON.stringify(includeAllLocales ? dictionaries : dictionary, null, 2),
        ...(includeAllLocales
          ? { dictionaries }
          : { dictionary })
      },
      'export generated'
    );
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to export translations');
  }
};
