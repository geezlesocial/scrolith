/**
 * Perfect negotiation (glare handling) — W3C pattern.
 *
 * - Deterministic polite/impolite from stable user ids (greater string is polite).
 * - Equal ids: both treat as polite (safer than both impolite, which deadlocks).
 * - Missing remote id: self is polite; missing self: impolite.
 * - ignoreOffer applies ONLY to a colliding remote *offer* and its ICE candidates.
 * - Answers to the local offer are ALWAYS processed (never gated on ignoreOffer).
 * - isSettingRemoteAnswerPending blocks treating concurrent offers as "stable".
 */

export type NegotiationRole = 'polite' | 'impolite';

export type PeerNegotiationFlags = {
  makingOffer: boolean;
  /** True only while the last remote *offer* was ignored due to impolite glare. */
  ignoreOffer: boolean;
  /** True between setRemoteDescription(answer) start and completion. */
  isSettingRemoteAnswerPending: boolean;
};

export const createPeerNegotiationFlags = (): PeerNegotiationFlags => ({
  makingOffer: false,
  ignoreOffer: false,
  isSettingRemoteAnswerPending: false
});

export const resolveNegotiationRole = (
  selfUserId?: string | null,
  remoteUserId?: string | null
): NegotiationRole => {
  const self = String(selfUserId || '').trim();
  const remote = String(remoteUserId || '').trim();
  if (!self && !remote) return 'polite';
  if (!self) return 'impolite';
  if (!remote) return 'polite';
  // Equal identities must not both ignore (both impolite). Prefer both polite.
  if (self === remote) return 'polite';
  return self > remote ? 'polite' : 'impolite';
};

export type DescriptionDecision =
  | { action: 'accept' }
  | { action: 'ignore' }
  | { action: 'rollback_and_accept' };

/**
 * Decide how to handle an incoming SDP description (offer or answer).
 * Answers are never ignored due to offer-collision flags.
 */
export const decideIncomingDescription = (params: {
  descriptionType: string;
  signalingState: string;
  makingOffer: boolean;
  isPolite: boolean;
  isSettingRemoteAnswerPending?: boolean;
}): DescriptionDecision => {
  const type = String(params.descriptionType || '')
    .trim()
    .toLowerCase();

  // R-01: answers to our outstanding local offer must always be applied.
  if (type === 'answer' || type === 'pranswer') {
    return { action: 'accept' };
  }

  if (type !== 'offer') {
    return { action: 'ignore' };
  }

  const state = String(params.signalingState || 'stable')
    .trim()
    .toLowerCase();
  const readyForOffer =
    !params.makingOffer &&
    state === 'stable' &&
    !params.isSettingRemoteAnswerPending;

  if (readyForOffer) {
    return { action: 'accept' };
  }

  // Offer collision (glare).
  if (!params.isPolite) {
    return { action: 'ignore' };
  }
  return { action: 'rollback_and_accept' };
};

/** @deprecated use decideIncomingDescription — kept for call sites during migration */
export const decideIncomingOffer = (params: {
  signalingState: string;
  makingOffer: boolean;
  isPolite: boolean;
  isSettingRemoteAnswerPending?: boolean;
}): DescriptionDecision =>
  decideIncomingDescription({
    descriptionType: 'offer',
    signalingState: params.signalingState,
    makingOffer: params.makingOffer,
    isPolite: params.isPolite,
    isSettingRemoteAnswerPending: params.isSettingRemoteAnswerPending
  });

export const canRollbackLocalDescription = (pc: {
  signalingState?: string;
} | null): boolean => {
  if (!pc) return false;
  const state = String(pc.signalingState || '')
    .trim()
    .toLowerCase();
  return state === 'have-local-offer' || state === 'have-local-pranswer';
};

/**
 * ICE candidates for an ignored remote offer must be dropped.
 * Candidates for a pending/valid description may be queued until remote description exists.
 */
export const shouldDropIceCandidate = (flags: PeerNegotiationFlags): boolean =>
  Boolean(flags.ignoreOffer);

/**
 * Pure simulation used by regression tests — mirrors FE wiring without RTCPeerConnection.
 */
export type SimulatedPeer = {
  id: string;
  role: NegotiationRole;
  flags: PeerNegotiationFlags;
  signalingState: 'stable' | 'have-local-offer' | 'have-remote-offer' | 'have-local-pranswer' | 'have-remote-pranswer';
  localDescription: { type: string; sdp: string } | null;
  remoteDescription: { type: string; sdp: string } | null;
  queuedIce: string[];
  appliedIce: string[];
  droppedIce: string[];
};

export const simulateApplyRemoteDescription = (
  peer: SimulatedPeer,
  description: { type: string; sdp: string }
): { applied: boolean; decision: DescriptionDecision } => {
  const decision = decideIncomingDescription({
    descriptionType: description.type,
    signalingState: peer.signalingState,
    makingOffer: peer.flags.makingOffer,
    isPolite: peer.role === 'polite',
    isSettingRemoteAnswerPending: peer.flags.isSettingRemoteAnswerPending
  });

  if (decision.action === 'ignore') {
    peer.flags.ignoreOffer = true;
    return { applied: false, decision };
  }

  if (decision.action === 'rollback_and_accept' && peer.signalingState === 'have-local-offer') {
    peer.localDescription = null;
    peer.signalingState = 'stable';
  }

  const type = String(description.type).toLowerCase();
  if (type === 'answer' || type === 'pranswer') {
    peer.flags.isSettingRemoteAnswerPending = true;
    peer.remoteDescription = description;
    peer.signalingState = 'stable';
    peer.flags.isSettingRemoteAnswerPending = false;
    // After applying answer, clear offer-ignore so subsequent offers work.
    peer.flags.ignoreOffer = false;
    peer.flags.makingOffer = false;
    // Flush queued ICE that was held for this description.
    peer.appliedIce.push(...peer.queuedIce);
    peer.queuedIce = [];
    return { applied: true, decision };
  }

  // offer accepted
  peer.flags.ignoreOffer = false;
  peer.remoteDescription = description;
  peer.signalingState = 'have-remote-offer';
  // Create answer
  peer.localDescription = { type: 'answer', sdp: `answer-from-${peer.id}` };
  peer.signalingState = 'stable';
  peer.appliedIce.push(...peer.queuedIce);
  peer.queuedIce = [];
  return { applied: true, decision };
};

export const simulateCreateOffer = (peer: SimulatedPeer): { type: 'offer'; sdp: string } => {
  peer.flags.makingOffer = true;
  const offer = { type: 'offer' as const, sdp: `offer-from-${peer.id}` };
  peer.localDescription = offer;
  peer.signalingState = 'have-local-offer';
  peer.flags.makingOffer = false;
  return offer;
};

export const simulateReceiveIce = (peer: SimulatedPeer, candidate: string) => {
  if (shouldDropIceCandidate(peer.flags)) {
    peer.droppedIce.push(candidate);
    return;
  }
  if (!peer.remoteDescription) {
    peer.queuedIce.push(candidate);
    return;
  }
  peer.appliedIce.push(candidate);
};
