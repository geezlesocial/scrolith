import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  MoreHorizontal,
  Phone,
  PhoneOff,
  UserPlus,
  UserRound,
  Video,
  VideoOff,
  Volume2,
  VolumeX
} from 'lucide-react';
import ConferenceParticipantsPanel from './ConferenceParticipantsPanel';
import type { CallQualityState } from './callQuality';

type ParticipantUser = {
  id: string;
  name?: string;
  avatar?: string;
};

type CallParticipant = {
  userId: string;
  status?: string;
  user?: ParticipantUser;
};

type RemoteMediaState = {
  microphone: boolean;
  camera: boolean;
};

type VoiceCallModalProps = {
  open: boolean;
  title?: string;
  statusLabel?: string;
  incoming?: boolean;
  canAddParticipant?: boolean;
  addBusy?: boolean;
  muted?: boolean;
  speakerOn?: boolean;
  cameraOff?: boolean;
  mediaMode?: 'audio' | 'video' | string;
  localStream?: MediaStream | null;
  participantUsers?: ParticipantUser[];
  participants?: CallParticipant[];
  meId?: string;
  remoteStreams?: Record<string, MediaStream>;
  remoteMediaStates?: Record<string, RemoteMediaState>;
  accepting?: boolean;
  ending?: boolean;
  reconnecting?: boolean;
  qualityState?: CallQualityState;
  qualityNotice?: string | null;
  onClose?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onEnd?: () => void;
  onToggleMute?: () => void;
  onToggleSpeaker?: () => void;
  onToggleCamera?: () => void;
  onSwitchToVideo?: () => void;
  onAddParticipant?: (userId: string) => void;
  myJoinRequestStatus?: string | null;
  pendingJoinRequests?: Array<{
    requestId: string;
    requesterId: string;
    status: string;
  }>;
  onRequestJoin?: () => void;
  onCancelJoinRequest?: () => void;
  onApproveJoinRequest?: (requestId: string) => void;
  onRejectJoinRequest?: (requestId: string) => void;
  canModerateJoinRequests?: boolean;
};

const AttachStreamVideo: React.FC<{
  stream: MediaStream | null | undefined;
  muted?: boolean;
  className?: string;
  mirror?: boolean;
}> = ({ stream, muted = true, className, mirror }) => {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = Boolean(muted);
    if (stream) {
      el.srcObject = stream;
      void el.play().catch(() => undefined);
    } else {
      el.srcObject = null;
    }
  }, [muted, stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`${className || ''} ${mirror ? 'scale-x-[-1]' : ''}`}
    />
  );
};

const remoteAudioSinkRegistry = new Map<string, Set<HTMLAudioElement>>();

const RemoteAudio: React.FC<{ stream: MediaStream; speakerOn: boolean }> = ({ stream, speakerOn }) => {
  const ref = useRef<HTMLAudioElement | null>(null);
  const sinkKey = stream.getAudioTracks().map((track) => track.id).sort().join('|');
  useEffect(() => {
    const el = ref.current;
    if (!el || !sinkKey) return;
    const sinks = remoteAudioSinkRegistry.get(sinkKey) || new Set<HTMLAudioElement>();
    const isPrimarySink = sinks.size === 0;
    sinks.add(el);
    remoteAudioSinkRegistry.set(sinkKey, sinks);
    el.srcObject = stream;
    el.autoplay = true;
    el.playsInline = true;
    el.disableRemotePlayback = true;
    el.muted = !isPrimarySink || !speakerOn;
    el.volume = speakerOn ? 0.82 : 0;
    if (isPrimarySink) void el.play().catch(() => undefined);
    return () => {
      el.pause();
      el.srcObject = null;
      sinks.delete(el);
      if (!sinks.size) {
        remoteAudioSinkRegistry.delete(sinkKey);
        return;
      }
      const nextPrimary = sinks.values().next().value as HTMLAudioElement | undefined;
      sinks.forEach((sink) => {
        sink.muted = sink !== nextPrimary || !speakerOn;
        sink.volume = speakerOn ? 0.82 : 0;
      });
      if (nextPrimary && speakerOn) void nextPrimary.play().catch(() => undefined);
    };
  }, [sinkKey, stream, speakerOn]);
  return <audio ref={ref} autoPlay playsInline className="hidden" aria-hidden data-call-audio-sink="true" data-track-ids={sinkKey} />;
};

const RemoteStreamAudioSinks: React.FC<{
  remoteStreams: Record<string, MediaStream>;
  speakerOn?: boolean;
}> = ({ remoteStreams, speakerOn = true }) => (
  <>
    {Object.entries(remoteStreams || {})
      .filter(([, stream]) => Boolean(stream))
      .map(([userId, stream]) => (
        <RemoteAudio key={userId} stream={stream} speakerOn={speakerOn} />
      ))}
  </>
);

const getInitials = (name?: string) =>
  String(name || 'Participant')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'SC';

const ControlButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  danger?: boolean;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
  disabled?: boolean;
}> = ({ label, icon, onClick, active, danger, tone = 'neutral', disabled }) => {
  const resolvedTone = danger ? 'danger' : tone;
  const toneClass =
    resolvedTone === 'success'
      ? 'bg-emerald-500 text-white shadow-emerald-950/40 hover:bg-emerald-400'
      : resolvedTone === 'danger'
        ? 'bg-rose-600 text-white shadow-rose-950/40 hover:bg-rose-500'
        : resolvedTone === 'warning'
          ? 'bg-amber-400 text-slate-950 shadow-amber-950/30 hover:bg-amber-300'
          : resolvedTone === 'primary'
            ? 'bg-blue-600 text-white shadow-blue-950/40 hover:bg-blue-500'
            : active
              ? 'bg-cyan-500 text-slate-950 shadow-cyan-950/30 hover:bg-cyan-400'
              : 'bg-slate-800 text-white shadow-slate-950/40 hover:bg-slate-700';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={[
        'group flex min-w-[3.75rem] shrink-0 flex-col items-center gap-1.5 text-center text-[10px] font-semibold text-white transition sm:min-w-[4.75rem] sm:gap-2 sm:text-xs',
        disabled ? 'cursor-not-allowed opacity-45' : ''
      ].join(' ')}
    >
      <span
        className={[
          'flex h-12 w-12 items-center justify-center rounded-full shadow-lg ring-1 ring-white/10 transition sm:h-16 sm:w-16',
          toneClass
        ].join(' ')}
      >
        {icon}
      </span>
      <span className="max-w-[4.75rem] leading-tight text-white/85 group-hover:text-white sm:max-w-[5.75rem]">{label}</span>
    </button>
  );
};

const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  open,
  title = 'Call',
  statusLabel,
  incoming,
  canAddParticipant,
  addBusy,
  muted,
  speakerOn = true,
  cameraOff = false,
  mediaMode = 'audio',
  localStream = null,
  participantUsers = [],
  participants = [],
  meId,
  remoteStreams = {},
  remoteMediaStates = {},
  accepting = false,
  ending = false,
  reconnecting = false,
  qualityState = 'GOOD',
  qualityNotice = null,
  onClose,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleSpeaker,
  onToggleCamera,
  onSwitchToVideo,
  onAddParticipant,
  myJoinRequestStatus = null,
  pendingJoinRequests = [],
  onRequestJoin,
  onCancelJoinRequest,
  onApproveJoinRequest,
  onRejectJoinRequest,
  canModerateJoinRequests = false
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const isVideo = String(mediaMode || '').toLowerCase() === 'video';
  const remoteEntries = Object.entries(remoteStreams || {}).filter(([, stream]) => Boolean(stream));
  const primaryParticipant = useMemo(() => {
    const nonSelf = participants.find((entry) => entry.userId && entry.userId !== meId);
    const user = nonSelf?.user || participantUsers.find((entry) => entry.id === nonSelf?.userId);
    return user || participantUsers.find((entry) => entry.id !== meId) || null;
  }, [meId, participantUsers, participants]);
  const displayName = primaryParticipant?.name || title;
  const displayAvatar = primaryParticipant?.avatar;
  const normalizedStatus = String(statusLabel || '').toLowerCase();
  const isConnecting =
    normalizedStatus.includes('connecting') ||
    normalizedStatus.includes('calling') ||
    normalizedStatus.includes('ringing') ||
    Boolean(incoming);
  const joinedCount = participants.filter((entry) => String(entry.status || '').toLowerCase() === 'joined').length;
  const openJoinRequests = pendingJoinRequests.filter((entry) => entry.status === 'pending');
  const callStatusText = statusLabel || (incoming ? 'Incoming call' : isVideo ? 'Video call' : 'Voice call');

  useEffect(() => {
    if (!open) setShowDetails(false);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 isolate z-[9998] overflow-hidden bg-slate-950 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={callStatusText}
      data-scroll-skip-swipe="true"
    >
      <RemoteStreamAudioSinks remoteStreams={remoteStreams} speakerOn={speakerOn} />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:28px_28px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.24),transparent_38%),linear-gradient(180deg,rgba(15,23,42,0.82),#020617)]" />
      {qualityNotice ? (
        <div
          className="pointer-events-none absolute left-1/2 top-[5.5rem] z-10 -translate-x-1/2 rounded-full border border-amber-200/25 bg-slate-950/75 px-3 py-1.5 text-center text-xs font-semibold text-amber-100 shadow-lg backdrop-blur sm:top-24"
          role="status"
          aria-live="polite"
          data-testid="call-quality-notice"
        >
          {qualityNotice}
        </div>
      ) : null}

      {isVideo && remoteEntries[0] ? (
        <AttachStreamVideo
          stream={remoteEntries[0][1]}
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
      {isVideo && !remoteEntries.length && localStream && !cameraOff ? (
        <AttachStreamVideo
          stream={localStream}
          muted
          mirror
          className="absolute inset-0 h-full w-full object-cover opacity-70"
        />
      ) : null}
      {isVideo ? <div className="absolute inset-0 bg-slate-950/35" /> : null}

      <div
        className="relative flex h-full flex-col"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))'
        }}
      >
        <header className="flex shrink-0 items-center justify-between gap-4 px-1 py-2 sm:px-4">
          <button
            type="button"
            onClick={onClose || onEnd}
            aria-label="Minimize call screen"
            title="Minimize"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg ring-1 ring-white/10 transition hover:bg-slate-700"
          >
            <Minimize2 className="h-5 w-5" />
          </button>
          <div className="min-w-0 text-center">
            <h2 className="truncate text-xl font-bold sm:text-2xl">{displayName}</h2>
            <div className="mt-1 flex items-center justify-center gap-2 text-sm text-white/72 sm:text-base">
              {isConnecting ? <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /> : null}
              <span className="truncate">{callStatusText}</span>
            </div>
            {qualityState !== 'GOOD' && !qualityNotice ? (
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-white/60" data-testid="call-quality-state">
                {qualityState}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            aria-label="Call details"
            title="More call tools"
            className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg ring-1 ring-white/10 transition hover:bg-slate-700"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </header>

        <main className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 py-5 sm:px-8">
          {!isVideo || (!remoteEntries.length && (!localStream || cameraOff)) ? (
            <div className="relative flex flex-col items-center">
              {isConnecting ? (
                <>
                  <span className="absolute h-44 w-44 animate-ping rounded-full bg-blue-500/15 sm:h-64 sm:w-64" />
                  <span className="absolute h-56 w-56 rounded-full border border-white/10 sm:h-72 sm:w-72" />
                </>
              ) : null}
              <div className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-4 ring-white/10 sm:h-64 sm:w-64">
                {displayAvatar ? (
                  <img src={displayAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-5xl font-bold text-white/85 sm:text-7xl">
                    {getInitials(displayName)}
                  </span>
                )}
              </div>
              <div className="mt-6 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-white/80">
                {joinedCount > 0 ? `${joinedCount} joined` : isConnecting ? 'Waiting for answer' : 'Media connected'}
              </div>
            </div>
          ) : null}

          {isVideo && remoteEntries.length > 1 ? (
            <div className="grid w-full max-w-5xl grid-cols-1 gap-3 sm:grid-cols-2">
              {remoteEntries.slice(0, 4).map(([userId, stream]) => (
                <div key={userId} className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-white/10">
                  <AttachStreamVideo stream={stream} muted className="h-full w-full object-cover" />
                   <span className="absolute bottom-3 left-3 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold">
                     {participantUsers.find((user) => user.id === userId)?.name || 'Participant'}
                   </span>
                   {remoteMediaStates[userId] && (!remoteMediaStates[userId].microphone || !remoteMediaStates[userId].camera) ? (
                     <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">
                       {!remoteMediaStates[userId].microphone ? <MicOff className="h-3 w-3" /> : null}
                       {!remoteMediaStates[userId].camera ? <VideoOff className="h-3 w-3" /> : null}
                     </span>
                   ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {isVideo && localStream && remoteEntries.length ? (
            <div className="absolute bottom-28 right-4 aspect-[9/14] w-24 overflow-hidden rounded-2xl bg-slate-900 shadow-2xl ring-1 ring-white/20 sm:bottom-32 sm:right-8 sm:w-36">
              {cameraOff ? (
                <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white/60">
                  <VideoOff className="h-7 w-7" />
                </div>
              ) : (
                <AttachStreamVideo stream={localStream} muted mirror className="h-full w-full object-cover" />
              )}
              <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold">
                You
              </span>
            </div>
          ) : null}
        </main>

        {showDetails ? (
          <aside className="absolute bottom-28 left-4 right-4 max-h-[42vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-2xl backdrop-blur sm:bottom-32 sm:left-auto sm:right-8 sm:w-[28rem]">
            {myJoinRequestStatus === 'pending' || myJoinRequestStatus === 'required' ? (
              <div className="mb-3 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                {myJoinRequestStatus === 'required'
                  ? 'This call requires approval before you can join.'
                  : 'Join request pending approval.'}
                {onCancelJoinRequest && myJoinRequestStatus === 'pending' ? (
                  <button type="button" onClick={onCancelJoinRequest} className="ml-2 font-semibold underline">
                    Cancel
                  </button>
                ) : null}
              </div>
            ) : null}
            {canModerateJoinRequests && openJoinRequests.length > 0 ? (
              <div className="mb-3 space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Join requests</p>
                {openJoinRequests.map((entry) => {
                  const name = participantUsers.find((user) => user.id === entry.requesterId)?.name || entry.requesterId;
                  return (
                    <div key={entry.requestId} className="flex items-center justify-between gap-2 rounded-lg bg-white/10 px-2 py-2 text-sm">
                      <span className="truncate font-medium">{name}</span>
                      <span className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => onApproveJoinRequest?.(entry.requestId)} className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold">
                          Approve
                        </button>
                        <button type="button" onClick={() => onRejectJoinRequest?.(entry.requestId)} className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold">
                          Reject
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
            <ConferenceParticipantsPanel
              participants={participants}
              meId={meId}
              candidateUsers={participantUsers}
              canAddParticipant={canAddParticipant}
              addBusy={addBusy}
              onAddParticipant={onAddParticipant}
            />
          </aside>
        ) : null}

        <footer className="shrink-0 pb-2">
          {incoming ? (
            <div className="flex items-center justify-center gap-4 rounded-[2rem] bg-black/35 px-4 py-4 shadow-2xl backdrop-blur">
               <ControlButton label="Reject" icon={<PhoneOff className="h-7 w-7" />} onClick={onReject} danger disabled={ending} />
               <ControlButton label={accepting ? 'Answering...' : 'Answer'} icon={<Phone className="h-7 w-7" />} onClick={onAccept} tone="success" disabled={accepting || ending} />
              {onRequestJoin ? (
                <ControlButton label="Request join" icon={<UserPlus className="h-6 w-6" />} onClick={onRequestJoin} tone="primary" />
              ) : null}
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl items-center justify-center gap-2 rounded-[2rem] bg-black/35 px-3 py-4 shadow-2xl backdrop-blur sm:gap-5 sm:px-4">
              <ControlButton
                label={speakerOn ? 'Speaker on' : 'Speaker off'}
                icon={speakerOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
                onClick={onToggleSpeaker}
                tone={speakerOn ? 'primary' : 'neutral'}
                active={speakerOn}
                disabled={accepting || ending || reconnecting}
              />
              <ControlButton
                label={muted ? 'Unmute' : 'Mute'}
                icon={muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                onClick={onToggleMute}
                tone={muted ? 'warning' : 'success'}
                active={!muted}
                disabled={accepting || ending || reconnecting}
              />
              {isVideo ? (
                <ControlButton
                  label={cameraOff ? 'Camera on' : 'Camera off'}
                  icon={cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
                  onClick={onToggleCamera}
                  tone={cameraOff ? 'warning' : 'primary'}
                  active={!cameraOff}
                  disabled={accepting || ending || reconnecting}
                />
              ) : (
                <ControlButton
                  label="Video call"
                  icon={<Video className="h-6 w-6" />}
                  onClick={onSwitchToVideo}
                  tone="primary"
                  disabled={accepting || ending || reconnecting}
                />
              )}
              {canAddParticipant ? (
                <ControlButton
                  label="Add user"
                  icon={<UserPlus className="h-6 w-6" />}
                  onClick={() => setShowDetails(true)}
                  tone="neutral"
                  disabled={addBusy}
                />
              ) : (
                <ControlButton
                  label="Participants"
                  icon={<UserRound className="h-6 w-6" />}
                  onClick={() => setShowDetails((prev) => !prev)}
                />
              )}
              <ControlButton label={ending ? 'Ending...' : 'End'} icon={<PhoneOff className="h-7 w-7" />} onClick={onEnd} danger disabled={ending} />
            </div>
          )}
        </footer>
      </div>

      {isVideo && remoteEntries.length === 1 ? (
        <div className="pointer-events-none absolute left-4 top-20 hidden items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 text-xs font-semibold text-white/80 sm:flex">
          <Maximize2 className="h-3.5 w-3.5" />
          Secure video connected
        </div>
      ) : null}
    </div>
  );
};

export default VoiceCallModal;
