const ACTIVE_VOICE_PARTICIPANT_STATUSES = new Set(['INVITED', 'JOINED']);
const SIGNAL_TYPES = new Set(['offer', 'answer', 'pranswer', 'candidate']);
const MAX_SIGNAL_BYTES = 64 * 1024;
const MAX_SDP_BYTES = 32 * 1024;
const MAX_CANDIDATE_BYTES = 8 * 1024;

const cleanId = (value: unknown) => String(value || '').trim();

export const activeConversationParticipantIds = (participants: unknown, excludeUserId?: string) => {
  const excluded = cleanId(excludeUserId);
  if (!Array.isArray(participants)) return [] as string[];
  return Array.from(new Set(
    participants
      .filter((entry: any) => !entry?.deletedAt)
      .map((entry: any) => cleanId(entry?.userId))
      .filter((id: string) => Boolean(id) && id !== excluded)
  ));
};

export const activeVoiceParticipantIds = (participants: unknown) => {
  if (!Array.isArray(participants)) return [] as string[];
  return Array.from(new Set(
    participants
      .filter((entry: any) => ACTIVE_VOICE_PARTICIPANT_STATUSES.has(String(entry?.status || '').toUpperCase()))
      .map((entry: any) => cleanId(entry?.userId))
      .filter(Boolean)
  ));
};

export const isActiveVoiceParticipant = (participant: any) =>
  ACTIVE_VOICE_PARTICIPANT_STATUSES.has(String(participant?.status || '').toUpperCase());

export const validateCallSignal = (input: unknown): Record<string, unknown> | null => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const signal = input as Record<string, unknown>;
  const type = String(signal.type || '').trim().toLowerCase();
  if (!SIGNAL_TYPES.has(type)) return null;
  const normalized: Record<string, unknown> = { type };
  if (typeof signal.sdp === 'string') {
    if (Buffer.byteLength(signal.sdp, 'utf8') > MAX_SDP_BYTES) return null;
    normalized.sdp = signal.sdp;
  }
  if (typeof signal.candidate === 'string') {
    if (Buffer.byteLength(signal.candidate, 'utf8') > MAX_CANDIDATE_BYTES) return null;
    normalized.candidate = signal.candidate;
  }
  if (typeof signal.sdpMid === 'string' && signal.sdpMid.length <= 256) normalized.sdpMid = signal.sdpMid;
  if (typeof signal.sdpMLineIndex === 'number' && Number.isInteger(signal.sdpMLineIndex)) normalized.sdpMLineIndex = signal.sdpMLineIndex;
  if (typeof signal.usernameFragment === 'string' && signal.usernameFragment.length <= 256) normalized.usernameFragment = signal.usernameFragment;
  if (typeof signal.iceRestart === 'boolean') normalized.iceRestart = signal.iceRestart;
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > MAX_SIGNAL_BYTES) return null;
  return normalized;
};
