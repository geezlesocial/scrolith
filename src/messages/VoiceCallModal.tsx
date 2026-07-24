import React from 'react';
import { Phone, PhoneOff, Mic, MicOff, UserPlus, Volume2, VolumeX } from 'lucide-react';
import ConferenceParticipantsPanel from './ConferenceParticipantsPanel';
import MobileDialog from '../components/mobile/MobileDialog';

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

type VoiceCallModalProps = {
  open: boolean;
  title?: string;
  statusLabel?: string;
  incoming?: boolean;
  canAddParticipant?: boolean;
  addBusy?: boolean;
  muted?: boolean;
  speakerOn?: boolean;
  participantUsers?: ParticipantUser[];
  participants?: CallParticipant[];
  meId?: string;
  remoteStreams?: Record<string, MediaStream>;
  onClose?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onEnd?: () => void;
  onToggleMute?: () => void;
  onToggleSpeaker?: () => void;
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

const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  open,
  title = 'Voice call',
  statusLabel,
  incoming,
  canAddParticipant,
  addBusy,
  muted,
  speakerOn = true,
  participantUsers = [],
  participants = [],
  meId,
  remoteStreams = {},
  onClose,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleSpeaker,
  onAddParticipant,
  myJoinRequestStatus = null,
  pendingJoinRequests = [],
  onRequestJoin,
  onCancelJoinRequest,
  onApproveJoinRequest,
  onRejectJoinRequest,
  canModerateJoinRequests = false
}) => {
  if (!open) return null;

  const pendingForMe =
    myJoinRequestStatus === 'pending' ||
    myJoinRequestStatus === 'required' ||
    myJoinRequestStatus === 'approved';
  const openJoinRequests = pendingJoinRequests.filter((entry) => entry.status === 'pending');

  return (
    <MobileDialog
      open={open}
      onClose={onClose || (() => undefined)}
      size="md"
      zIndexClassName="z-[140]"
      title={title}
      description={statusLabel}
      footer={
        <div className="flex flex-wrap items-center justify-center gap-3">
          {incoming ? (
            <>
              <button
                type="button"
                onClick={onReject}
                className="inline-flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-full bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
              >
                <PhoneOff className="h-4 w-4" /> Reject
              </button>
              <button
                type="button"
                onClick={onAccept}
                className="inline-flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <Phone className="h-4 w-4" /> Accept
              </button>
              {onRequestJoin ? (
                <button
                  type="button"
                  onClick={onRequestJoin}
                  className="inline-flex h-11 min-w-[120px] items-center justify-center gap-2 rounded-full border border-indigo-300 bg-indigo-50 px-4 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Request to join
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onToggleSpeaker}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {speakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                {speakerOn ? 'Speaker' : 'Earpiece'}
              </button>
              <button
                type="button"
                onClick={onToggleMute}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {muted ? 'Unmute' : 'Mute'}
              </button>
              {canAddParticipant ? (
                <button
                  type="button"
                  onClick={() => undefined}
                  className="inline-flex h-11 cursor-default items-center justify-center gap-2 rounded-full border border-gray-300 px-4 text-sm font-semibold text-gray-400"
                  title="Use Add in participants panel"
                >
                  <UserPlus className="h-4 w-4" /> Add
                </button>
              ) : null}
              <button
                type="button"
                onClick={onEnd}
                className="inline-flex h-11 min-w-[96px] items-center justify-center gap-2 rounded-full bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700"
              >
                <PhoneOff className="h-4 w-4" /> End
              </button>
            </>
          )}
        </div>
      }
    >
        {myJoinRequestStatus === 'pending' || myJoinRequestStatus === 'required' ? (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {myJoinRequestStatus === 'required'
              ? 'This call requires approval before you can join.'
              : 'Join request pending approval…'}
            {onCancelJoinRequest && myJoinRequestStatus === 'pending' ? (
              <button
                type="button"
                onClick={onCancelJoinRequest}
                className="ml-2 font-semibold text-amber-800 underline"
              >
                Cancel
              </button>
            ) : null}
          </div>
        ) : null}
        {myJoinRequestStatus === 'approved' ? (
          <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Approved — tap Accept to join the call.
          </div>
        ) : null}
        {myJoinRequestStatus === 'rejected' ? (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            Your join request was rejected.
          </div>
        ) : null}

        {canModerateJoinRequests && openJoinRequests.length > 0 ? (
          <div className="mb-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Join requests
            </p>
            {openJoinRequests.map((entry) => {
              const name =
                participantUsers.find((user) => user.id === entry.requesterId)?.name ||
                entry.requesterId;
              return (
                <div
                  key={entry.requestId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 text-sm"
                >
                  <span className="font-medium text-slate-800">{name}</span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onApproveJoinRequest?.(entry.requestId)}
                      className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectJoinRequest?.(entry.requestId)}
                      className="rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white"
                    >
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

        {Object.entries(remoteStreams).map(([userId, stream]) => (
          <audio
            key={userId}
            autoPlay
            playsInline
            muted={!speakerOn}
            ref={(node) => {
              if (!node) return;
              if (node.srcObject !== stream) node.srcObject = stream;
              node.volume = speakerOn ? 1 : 0;
            }}
          />
        ))}
    </MobileDialog>
  );
};

export default VoiceCallModal;
