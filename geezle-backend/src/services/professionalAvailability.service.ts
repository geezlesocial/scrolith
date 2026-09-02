import prisma from '../utils/prismaClient';

type ProfessionalAvailability = {
  status: string;
  availabilityTypes: string[];
  services: string[];
  workPreference: string;
  timing: string;
  availableFrom: Date | null;
  expiresAt: Date | null;
  visibility: string;
  isActive: boolean;
};

export const AVAILABILITY_TYPES = ['FREELANCE', 'FULL_TIME', 'PART_TIME', 'CONTRACT', 'CONSULTING', 'COLLABORATION'] as const;
export const WORK_PREFERENCES = ['REMOTE', 'ONSITE', 'HYBRID', 'FLEXIBLE'] as const;
export const AVAILABILITY_TIMINGS = ['AVAILABLE_NOW', 'WITHIN_ONE_WEEK', 'WITHIN_ONE_MONTH', 'FLEXIBLE'] as const;
export const AVAILABILITY_VISIBILITIES = ['PUBLIC', 'HIDDEN'] as const;
export const AVAILABILITY_STATUSES = ['ACTIVE', 'PAUSED', 'INACTIVE'] as const;

type AvailabilityInput = {
  status?: string;
  availabilityTypes?: unknown;
  services?: unknown;
  workPreference?: string;
  timing?: string;
  availableFrom?: string | null;
  expiresAt?: string | null;
  visibility?: string;
  isActive?: boolean;
};

const asList = (value: unknown, max: number, itemMax: number) => {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error('Expected a list of values');
  const values = value.map((item) => String(item).trim()).filter(Boolean);
  if (values.length > max || values.some((item) => item.length > itemMax)) {
    throw new Error('Availability lists contain too many or too-long values');
  }
  return [...new Set(values)];
};

const asEnum = <T extends readonly string[]>(value: unknown, allowed: T, field: string) => {
  if (value === undefined) return undefined;
  const normalized = String(value).trim().toUpperCase();
  if (!allowed.includes(normalized)) throw new Error(`Invalid ${field}`);
  return normalized as T[number];
};

const asDate = (value: unknown, field: string) => {
  if (value === undefined || value === null || value === '') return value === null ? null : undefined;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid ${field}`);
  return parsed;
};

export const normalizeAvailabilityInput = (input: AvailabilityInput = {}) => {
  const availabilityTypes = asList(input.availabilityTypes, 6, 32)?.map((item) => {
    const normalized = item.toUpperCase();
    if (!AVAILABILITY_TYPES.includes(normalized as (typeof AVAILABILITY_TYPES)[number])) throw new Error('Invalid availability type');
    return normalized;
  }).filter((item, index, values) => values.indexOf(item) === index);
  const services = asList(input.services, 12, 80);
  const availableFrom = asDate(input.availableFrom, 'availableFrom');
  const expiresAt = asDate(input.expiresAt, 'expiresAt');
  if (availableFrom && expiresAt && expiresAt <= availableFrom) throw new Error('expiresAt must be after availableFrom');
  if (expiresAt && expiresAt <= new Date()) throw new Error('expiresAt must be in the future');

  const status = asEnum(input.status, AVAILABILITY_STATUSES, 'status');
  const isActive = input.isActive === undefined ? undefined : Boolean(input.isActive);
  if (status === 'ACTIVE' && isActive === false) throw new Error('Active availability must be enabled');
  if (status && status !== 'ACTIVE' && isActive === true) throw new Error('Only active availability can be enabled');

  return {
    ...(status ? { status } : {}),
    ...(availabilityTypes ? { availabilityTypes } : {}),
    ...(services ? { services } : {}),
    ...(asEnum(input.workPreference, WORK_PREFERENCES, 'workPreference') ? { workPreference: asEnum(input.workPreference, WORK_PREFERENCES, 'workPreference') } : {}),
    ...(asEnum(input.timing, AVAILABILITY_TIMINGS, 'timing') ? { timing: asEnum(input.timing, AVAILABILITY_TIMINGS, 'timing') } : {}),
    ...(availableFrom !== undefined ? { availableFrom } : {}),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(asEnum(input.visibility, AVAILABILITY_VISIBILITIES, 'visibility') ? { visibility: asEnum(input.visibility, AVAILABILITY_VISIBILITIES, 'visibility') } : {}),
    ...(isActive !== undefined ? { isActive } : {})
  };
};

const isPubliclyAvailable = (availability: ProfessionalAvailability | null | undefined) => Boolean(
  availability &&
  availability.status === 'ACTIVE' &&
  availability.isActive &&
  availability.visibility === 'PUBLIC' &&
  (!availability.expiresAt || availability.expiresAt > new Date())
);

export const serializeProfessionalAvailability = (
  availability: ProfessionalAvailability | null | undefined,
  options: { publicOnly?: boolean } = {}
) => {
  if (!availability || (options.publicOnly && !isPubliclyAvailable(availability))) return null;
  return {
    status: availability.status,
    availabilityTypes: availability.availabilityTypes,
    services: availability.services,
    workPreference: availability.workPreference,
    timing: availability.timing,
    availableFrom: availability.availableFrom?.toISOString() ?? null,
    expiresAt: availability.expiresAt?.toISOString() ?? null,
    visibility: availability.visibility,
    isActive: availability.isActive && isPubliclyAvailable(availability)
  };
};

export const getOrCreateProfessionalAvailability = async (userId: string) => prisma.professionalAvailability.upsert({
  where: { userId },
  create: { userId },
  update: {}
});

export const updateProfessionalAvailability = async (userId: string, input: AvailabilityInput) => {
  const normalized = normalizeAvailabilityInput(input);
  const status = normalized.status ?? (normalized.isActive === false ? 'INACTIVE' : undefined);
  const isActive = normalized.isActive ?? (status === 'ACTIVE' ? true : undefined);
  return prisma.professionalAvailability.upsert({
    where: { userId },
    create: {
      userId,
      ...normalized,
      ...(status ? { status } : {}),
      ...(isActive !== undefined ? { isActive } : {})
    },
    update: {
      ...normalized,
      ...(status ? { status } : {}),
      ...(isActive !== undefined ? { isActive } : {})
    }
  });
};

export const setProfessionalAvailabilityState = async (userId: string, status: 'ACTIVE' | 'PAUSED' | 'INACTIVE') =>
  prisma.professionalAvailability.upsert({
    where: { userId },
    create: { userId, status, isActive: status === 'ACTIVE' },
    update: { status, isActive: status === 'ACTIVE' }
  });
