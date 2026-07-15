import type { SearchCandidate, SearchDomain } from '../contracts/types';
import { SEARCH_CANDIDATE_HARD_CAP } from '../contracts/constants';

export const candidateKey = (entityType: string, entityId: string) =>
  `${String(entityType).toLowerCase()}:${String(entityId)}`;

/**
 * Deduplicate by entityType:entityId. Prefer higher lexicalScore; stable tie-break by id.
 * Caps array size.
 */
export const dedupeCandidates = (
  candidates: SearchCandidate[],
  hardCap = SEARCH_CANDIDATE_HARD_CAP
): SearchCandidate[] => {
  const map = new Map<string, SearchCandidate>();
  for (const c of candidates) {
    if (!c?.entityId || !c?.entityType) continue;
    const key = candidateKey(c.entityType, c.entityId);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, c);
      continue;
    }
    const ps = Number(prev.lexicalScore) || 0;
    const cs = Number(c.lexicalScore) || 0;
    if (cs > ps) map.set(key, c);
    else if (cs === ps && String(c.entityId) < String(prev.entityId)) map.set(key, c);
  }
  const list = Array.from(map.values());
  list.sort((a, b) => {
    const sa = Number(a.lexicalScore) || 0;
    const sb = Number(b.lexicalScore) || 0;
    if (sb !== sa) return sb - sa;
    const ta = String(a.entityType).localeCompare(String(b.entityType));
    if (ta !== 0) return ta;
    return String(a.entityId).localeCompare(String(b.entityId));
  });
  return list.slice(0, Math.max(1, hardCap));
};

/** Collapse company/page duplicate same id keeping requested domain preference */
export const collapsePageCompanyDupes = (
  candidates: SearchCandidate[],
  requested: SearchDomain[]
): SearchCandidate[] => {
  const wantCompany = requested.includes('company');
  const wantPage = requested.includes('page');
  if (!wantCompany || !wantPage) return candidates;

  const byId = new Map<string, SearchCandidate[]>();
  for (const c of candidates) {
    if (c.entityType !== 'page' && c.entityType !== 'company') continue;
    const list = byId.get(c.entityId) || [];
    list.push(c);
    byId.set(c.entityId, list);
  }
  if (!byId.size) return candidates;

  const drop = new Set<string>();
  for (const [, list] of byId) {
    if (list.length < 2) continue;
    // Prefer company when both present
    const keep = list.find((x) => x.entityType === 'company') || list[0];
    for (const x of list) {
      if (x.entityType !== keep.entityType) drop.add(candidateKey(x.entityType, x.entityId));
    }
  }
  if (!drop.size) return candidates;
  return candidates.filter((c) => !drop.has(candidateKey(c.entityType, c.entityId)));
};
