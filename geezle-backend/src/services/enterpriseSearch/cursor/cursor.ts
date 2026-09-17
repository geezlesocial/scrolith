/**
 * Opaque HMAC search cursor — viewer-scoped, tamper-resistant, no PII leakage.
 */
import { createHmac, createHash, randomBytes } from 'crypto';
import {
  SEARCH_CURSOR_MAX_TTL_MS,
  SEARCH_CURSOR_TTL_MS,
  SEARCH_CURSOR_VERSION,
  SEARCH_MODEL_VERSION
} from '../contracts/constants';
import { SearchContractError } from '../contracts/types';
import { requiredSecret } from '../../../utils/security/requiredSecret';

export type SearchCursorPayload = {
  v: typeof SEARCH_CURSOR_VERSION;
  p: string; // viewerKey
  o: number;
  s: string[];
  qh: string;
  dh: string;
  fh: string;
  sm: string;
  rm: string;
  d: string;
  exp: number;
  /** nonce — reduces replay/dupe confusion across pages */
  n?: string;
  sig?: string;
};

/** Recently issued cursor signatures per viewer (duplicate page protection soft) */
const issuedCursorSigs = new Map<string, number>();
const ISSUED_TTL_MS = SEARCH_CURSOR_TTL_MS;

const cursorSecret = () => String(
  process.env.SEARCH_CURSOR_HMAC || process.env.DISCOVERY_CURSOR_HMAC || requiredSecret('JWT_SECRET', 'search-dev-cursor')
).slice(0, 64);

const sign = (payload: Omit<SearchCursorPayload, 'sig'>): string =>
  createHmac('sha256', cursorSecret())
    .update(
      JSON.stringify({
        v: payload.v,
        p: payload.p,
        o: payload.o,
        s: payload.s,
        qh: payload.qh,
        dh: payload.dh,
        fh: payload.fh,
        sm: payload.sm,
        rm: payload.rm,
        d: payload.d,
        exp: payload.exp,
        n: payload.n || ''
      })
    )
    .digest('base64url')
    .slice(0, 24);

const pruneIssued = () => {
  const now = Date.now();
  for (const [k, exp] of issuedCursorSigs) {
    if (exp <= now) issuedCursorSigs.delete(k);
  }
};

export const hashViewerKey = (viewerId: string | null | undefined): string => {
  const raw = String(viewerId || '').trim() || 'anon';
  return createHash('sha256').update(raw).digest('base64url').slice(0, 16);
};

export const hashQueryBinding = (normalizedQuery: string): string =>
  createHash('sha256').update(String(normalizedQuery || '').toLowerCase()).digest('base64url').slice(0, 16);

export const hashDomainsBinding = (domains: string[]): string =>
  createHash('sha256')
    .update(
      [...domains]
        .map((d) => String(d).toLowerCase())
        .sort()
        .join(',')
    )
    .digest('base64url')
    .slice(0, 16);

export const hashFiltersBinding = (filters: unknown): string => {
  try {
    return createHash('sha256').update(JSON.stringify(filters || {})).digest('base64url').slice(0, 16);
  } catch {
    return '0';
  }
};

export const encodeSearchCursor = (input: {
  viewerId?: string | null;
  offset: number;
  seen: string[];
  normalizedQuery: string;
  domains: string[];
  filters?: unknown;
  rankingModelVersion: string;
  searchModelVersion?: string;
  ttlMs?: number;
}): string => {
  const ttl = Math.min(
    Math.max(1_000, Number(input.ttlMs) || SEARCH_CURSOR_TTL_MS),
    SEARCH_CURSOR_MAX_TTL_MS
  );
  const now = Date.now();
  const payload: Omit<SearchCursorPayload, 'sig'> = {
    v: SEARCH_CURSOR_VERSION,
    p: hashViewerKey(input.viewerId),
    o: Math.max(0, Math.trunc(input.offset) || 0),
    s: (input.seen || []).map(String).slice(-200),
    qh: hashQueryBinding(input.normalizedQuery),
    dh: hashDomainsBinding(input.domains || []),
    fh: hashFiltersBinding(input.filters),
    sm: input.searchModelVersion || SEARCH_MODEL_VERSION,
    rm: input.rankingModelVersion || 'none',
    d: new Date(now).toISOString(),
    exp: Math.floor((now + ttl) / 1000),
    n: randomBytes(4).toString('base64url')
  };
  const sig = sign(payload);
  const full: SearchCursorPayload = { ...payload, sig };
  pruneIssued();
  issuedCursorSigs.set(`${payload.p}:${sig}`, now + Math.min(ttl, ISSUED_TTL_MS));
  return Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
};

export const decodeSearchCursor = (
  cursor: string | null | undefined,
  expect: {
    viewerId?: string | null;
    normalizedQuery: string;
    domains: string[];
    filters?: unknown;
    rankingModelVersion?: string;
    searchModelVersion?: string;
  }
): { ok: true; state: SearchCursorPayload } | { ok: false; error: string; code: SearchContractError['code'] } => {
  if (!cursor || !String(cursor).trim()) {
    return {
      ok: true,
      state: {
        v: SEARCH_CURSOR_VERSION,
        p: hashViewerKey(expect.viewerId),
        o: 0,
        s: [],
        qh: hashQueryBinding(expect.normalizedQuery),
        dh: hashDomainsBinding(expect.domains || []),
        fh: hashFiltersBinding(expect.filters),
        sm: expect.searchModelVersion || SEARCH_MODEL_VERSION,
        rm: expect.rankingModelVersion || 'none',
        d: new Date().toISOString(),
        exp: Math.floor((Date.now() + SEARCH_CURSOR_TTL_MS) / 1000)
      }
    };
  }

  try {
    const json = Buffer.from(String(cursor), 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as SearchCursorPayload;
    if (Number(parsed.v) !== SEARCH_CURSOR_VERSION) {
      return { ok: false, error: 'cursor_invalid', code: 'CURSOR_INVALID' };
    }
    const base: Omit<SearchCursorPayload, 'sig'> = {
      v: SEARCH_CURSOR_VERSION,
      p: String(parsed.p || ''),
      o: Math.max(0, Number(parsed.o) || 0),
      s: Array.isArray(parsed.s) ? parsed.s.map(String).slice(-200) : [],
      qh: String(parsed.qh || ''),
      dh: String(parsed.dh || ''),
      fh: String(parsed.fh || ''),
      sm: String(parsed.sm || ''),
      rm: String(parsed.rm || ''),
      d: String(parsed.d || ''),
      exp: Number(parsed.exp) || 0,
      n: parsed.n ? String(parsed.n) : ''
    };
    const expectSig = sign(base);
    if (!parsed.sig || parsed.sig !== expectSig) {
      return { ok: false, error: 'cursor_tampered', code: 'CURSOR_INVALID' };
    }
    if (base.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, error: 'cursor_expired', code: 'CURSOR_INVALID' };
    }
    if (base.p !== hashViewerKey(expect.viewerId)) {
      return { ok: false, error: 'cursor_viewer_mismatch', code: 'CURSOR_VIEWER_MISMATCH' };
    }
    if (base.qh !== hashQueryBinding(expect.normalizedQuery) || base.dh !== hashDomainsBinding(expect.domains || [])) {
      return { ok: false, error: 'cursor_binding_mismatch', code: 'CURSOR_INVALID' };
    }
    if (base.fh !== hashFiltersBinding(expect.filters)) {
      return { ok: false, error: 'cursor_filter_mismatch', code: 'CURSOR_INVALID' };
    }
    const sm = expect.searchModelVersion || SEARCH_MODEL_VERSION;
    if (base.sm && base.sm !== sm) {
      return { ok: false, error: 'cursor_model_mismatch', code: 'CURSOR_MODEL_MISMATCH' };
    }
    // ranking model soft check: allow lexical↔discovery transition with warning path only (strict optional)
    if (
      expect.rankingModelVersion &&
      base.rm &&
      base.rm !== expect.rankingModelVersion &&
      base.rm !== 'none' &&
      expect.rankingModelVersion !== 'none'
    ) {
      // Still accept for forward pagination stability across soft fallback switches
      // Hard mismatch only when search model version already checked
    }
    // Offset must be non-negative integer (already coerced)
    if (!Number.isFinite(base.o) || base.o < 0 || base.o > 100_000) {
      return { ok: false, error: 'cursor_offset_invalid', code: 'CURSOR_INVALID' };
    }
    return { ok: true, state: { ...base, sig: parsed.sig } };
  } catch {
    return { ok: false, error: 'cursor_invalid', code: 'CURSOR_INVALID' };
  }
};

export const resetSearchCursorStateForTests = () => {
  issuedCursorSigs.clear();
};

export const mintFallbackTrackingToken = (entityType: string, entityId: string): string => {
  const nonce = randomBytes(6).toString('base64url');
  const body = `${entityType}:${entityId}:${nonce}:${Date.now()}`;
  const sig = createHmac('sha256', cursorSecret()).update(body).digest('base64url').slice(0, 16);
  return Buffer.from(JSON.stringify({ t: 'search_fb', body, sig }), 'utf8').toString('base64url');
};
