import React, { useMemo, useState } from 'react';

type Participant = {
  userId: string;
  status?: string;
  user?: {
    id?: string;
    name?: string;
    avatar?: string;
  };
};

type UserOption = {
  id: string;
  name: string;
  avatar?: string;
};

type ConferenceParticipantsPanelProps = {
  participants: Participant[];
  meId?: string;
  candidateUsers?: UserOption[];
  canAddParticipant?: boolean;
  addBusy?: boolean;
  onAddParticipant?: (userId: string) => void;
};

const normalizeStatus = (value: string | undefined) => String(value || '').trim().toLowerCase() || 'invited';
const looksLikeOpaqueId = (value: string, userId?: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (userId && normalized === String(userId || '').trim()) return true;
  return /^[a-z0-9_-]{18,}$/i.test(normalized);
};

const statusLabel = (value: string | undefined) => {
  const status = normalizeStatus(value);
  if (status === 'joined') return 'Joined';
  if (status === 'left') return 'Left';
  if (status === 'rejected') return 'Rejected';
  if (status === 'missed') return 'Missed';
  return 'Invited';
};

const statusColor = (value: string | undefined) => {
  const status = normalizeStatus(value);
  if (status === 'joined') return 'bg-emerald-100 text-emerald-700';
  if (status === 'left') return 'bg-slate-100 text-slate-600';
  if (status === 'rejected') return 'bg-rose-100 text-rose-700';
  if (status === 'missed') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
};

const ConferenceParticipantsPanel: React.FC<ConferenceParticipantsPanelProps> = ({
  participants,
  meId,
  candidateUsers = [],
  canAddParticipant,
  addBusy,
  onAddParticipant
}) => {
  const [selectedUserId, setSelectedUserId] = useState('');

  const existingIds = useMemo(
    () => new Set((participants || []).map((entry) => String(entry?.userId || '').trim()).filter(Boolean)),
    [participants]
  );

  const availableUsers = useMemo(
    () => (candidateUsers || []).filter((entry) => !existingIds.has(String(entry.id || '').trim())),
    [candidateUsers, existingIds]
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Conference Participants</h4>
      <div className="space-y-2">
        {(participants || []).map((entry) => {
          const userId = String(entry?.userId || '');
          const rawName = String(entry?.user?.name || '').trim();
          const me = Boolean(meId && userId && userId === meId);
          const name = rawName && !looksLikeOpaqueId(rawName, userId) ? rawName : me ? 'You' : 'Participant';
          return (
            <div key={userId} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-sm">
              <div className="flex items-center gap-2">
                {entry?.user?.avatar ? (
                  <img src={entry.user.avatar} alt={name} className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600">
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="font-medium text-gray-800">
                  {name}
                  {me && name !== 'You' ? ' (You)' : ''}
                </span>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor(entry?.status)}`}>
                {statusLabel(entry?.status)}
              </span>
            </div>
          );
        })}
      </div>

      {canAddParticipant && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Add participant...</option>
            {availableUsers.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedUserId || addBusy}
            onClick={() => {
              if (!selectedUserId || !onAddParticipant) return;
              onAddParticipant(selectedUserId);
              setSelectedUserId('');
            }}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {addBusy ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ConferenceParticipantsPanel;
