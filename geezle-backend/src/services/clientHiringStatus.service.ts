import prisma from '../utils/prismaClient';

export const CLIENT_HIRING_TYPES = ['FREELANCE', 'FULL_TIME', 'PART_TIME', 'CONTRACT', 'CONSULTING', 'AGENCIES'] as const;
export const CLIENT_HIRING_TIMINGS = ['AVAILABLE_NOW', 'WITHIN_ONE_WEEK', 'WITHIN_ONE_MONTH', 'FLEXIBLE'] as const;
export const CLIENT_HIRING_VISIBILITIES = ['PUBLIC', 'HIDDEN'] as const;
export const CLIENT_HIRING_STATUSES = ['ACTIVE', 'PAUSED', 'INACTIVE'] as const;

type ClientHiringInput = {
  status?: string;
  hiringTypes?: unknown;
  focusAreas?: unknown;
  timing?: string;
  visibility?: string;
  isActive?: boolean;
  expiresAt?: string | null;
};

type ClientHiringStatusRecord = {
  status: string;
  hiringTypes: string[];
  focusAreas: string[];
  timing: string;
  visibility: string;
  isActive: boolean;
  expiresAt: Date | null;
};

export const isClientOrEmployerRole = (role?: string | null) => {
  const normalized = String(role || '').trim().toUpperCase();
  return normalized === 'CLIENT' || normalized === 'EMPLOYER';
};

const asList = (value: unknown, max: number, itemMax: number, label: string) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${label} must be a list of values`);
  const values = value.map((item) => String(item).trim()).filter(Boolean);
  if (values.length > max || values.some((item) => item.length > itemMax)) {
    throw new Error(`${label} contains too many or too-long values`);
  }
  return [...new Set(values)];
};

const asEnum = <T extends readonly string[]>(value: unknown, allowed: T, field: string) => {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toUpperCase();
  if (!allowed.includes(normalized)) throw new Error(`Invalid ${field}`);
  return normalized as T[number];
};

const asDate = (value: unknown) => {
  if (value === undefined || value === null || value === '') return value === null ? null : undefined;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error('Invalid expiresAt');
  if (parsed <= new Date()) throw new Error('expiresAt must be in the future');
  return parsed;
};

export const normalizeClientHiringInput = (input: ClientHiringInput = {}) => {
  const hiringTypes = asList(input.hiringTypes, 6, 32, 'hiringTypes')?.map((item) => {
    const normalized = item.toUpperCase();
    if (!CLIENT_HIRING_TYPES.includes(normalized as (typeof CLIENT_HIRING_TYPES)[number])) throw new Error('Invalid hiring type');
    return normalized;
  }).filter((item, index, values) => values.indexOf(item) === index);
  const focusAreas = asList(input.focusAreas, 12, 80, 'focusAreas');
  const expiresAt = asDate(input.expiresAt);
  const status = asEnum(input.status, CLIENT_HIRING_STATUSES, 'status');
  const isActive = input.isActive === undefined ? undefined : Boolean(input.isActive);
  if (status === 'ACTIVE' && isActive === false) throw new Error('Active hiring status must be enabled');
  if (status && status !== 'ACTIVE' && isActive === true) throw new Error('Only active hiring status can be enabled');

  return {
    ...(status ? { status } : {}),
    ...(hiringTypes ? { hiringTypes } : {}),
    ...(focusAreas ? { focusAreas } : {}),
    ...(asEnum(input.timing, CLIENT_HIRING_TIMINGS, 'timing') ? { timing: asEnum(input.timing, CLIENT_HIRING_TIMINGS, 'timing') } : {}),
    ...(asEnum(input.visibility, CLIENT_HIRING_VISIBILITIES, 'visibility') ? { visibility: asEnum(input.visibility, CLIENT_HIRING_VISIBILITIES, 'visibility') } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(isActive !== undefined ? { isActive } : {})
  };
};

const isPubliclyHiring = (status: ClientHiringStatusRecord | null | undefined) => Boolean(
  status &&
  status.status === 'ACTIVE' &&
  status.isActive &&
  status.visibility === 'PUBLIC' &&
  (!status.expiresAt || status.expiresAt > new Date())
);

export const serializeClientHiringStatus = (
  status: ClientHiringStatusRecord | null | undefined,
  options: { publicOnly?: boolean; targetRole?: string | null } = {}
) => {
  if (!status || (options.publicOnly && options.targetRole && !isClientOrEmployerRole(options.targetRole))) return null;
  if (options.publicOnly && !isPubliclyHiring(status)) return null;
  return {
    status: status.status,
    hiringTypes: status.hiringTypes,
    focusAreas: status.focusAreas,
    timing: status.timing,
    visibility: status.visibility,
    expiresAt: status.expiresAt?.toISOString() ?? null,
    isActive: options.publicOnly ? status.isActive && isPubliclyHiring(status) : status.isActive
  };
};

export const getOrCreateClientHiringStatus = async (userId: string) => prisma.clientHiringStatus.upsert({
  where: { userId },
  create: { userId },
  update: {}
});

export const updateClientHiringStatus = async (userId: string, input: ClientHiringInput) => {
  const normalized = normalizeClientHiringInput(input);
  const status = normalized.status ?? (normalized.isActive === false ? 'INACTIVE' : undefined);
  const isActive = normalized.isActive ?? (status === 'ACTIVE' ? true : undefined);
  return prisma.clientHiringStatus.upsert({
    where: { userId },
    create: { userId, ...normalized, ...(status ? { status } : {}), ...(isActive !== undefined ? { isActive } : {}) },
    update: { ...normalized, ...(status ? { status } : {}), ...(isActive !== undefined ? { isActive } : {}) }
  });
};

export const setClientHiringState = async (userId: string, status: 'ACTIVE' | 'PAUSED' | 'INACTIVE') =>
  prisma.clientHiringStatus.upsert({
    where: { userId },
    create: { userId, status, isActive: status === 'ACTIVE' },
    update: { status, isActive: status === 'ACTIVE' }
  });
