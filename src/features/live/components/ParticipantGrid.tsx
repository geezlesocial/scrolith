import React from 'react';
import type { LiveParticipant } from '../../../services/live';

type ParticipantGridProps = {
  participants: LiveParticipant[];
};

const ParticipantGrid: React.FC<ParticipantGridProps> = ({ participants }) => {
  const active = Array.isArray(participants)
    ? participants.filter((entry) => String(entry.status || '').toLowerCase() === 'joined')
    : [];

  if (!active.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-500">
        No active participants yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {active.map((participant) => (
        <div key={participant.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <img
              src={participant.user?.avatar || '/api/placeholder/40/40'}
              alt={participant.user?.name || 'Participant'}
              className="h-10 w-10 rounded-full object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {participant.user?.name || 'Scrolith user'}
              </p>
              <p className="truncate text-xs text-slate-500">
                {String(participant.role || 'viewer').toLowerCase()}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <span className={`rounded-full px-2 py-0.5 ${participant.micState ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {participant.micState ? 'Mic On' : 'Mic Off'}
            </span>
            <span className={`rounded-full px-2 py-0.5 ${participant.cameraState ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
              {participant.cameraState ? 'Cam On' : 'Cam Off'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ParticipantGrid;
