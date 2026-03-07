import React from 'react';
import { Mic, MicOff, Shield, Video, VideoOff } from 'lucide-react';
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
      <div className="rounded-[28px] border border-slate-200 bg-white/90 px-5 py-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Participants</p>
        <p className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
          No active participants yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Participants</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">Live room roster</h3>
          <p className="mt-1 text-sm text-slate-500">Track who is currently on air and whether their media is active.</p>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          {active.length} active
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {active.map((participant) => {
          const role = String(participant.role || 'viewer').toLowerCase();
          const isHost = role === 'host';
          return (
            <div
              key={participant.id}
              className="rounded-[24px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),_transparent_35%),linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(255,255,255,1))] p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <img
                  src={participant.user?.avatar || '/api/placeholder/40/40'}
                  alt={participant.user?.name || 'Participant'}
                  className="h-12 w-12 rounded-2xl object-cover ring-2 ring-white"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {participant.user?.name || 'Scrolith user'}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                        isHost ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {role}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {participant.user?.username ? `@${participant.user.username}` : 'Connected to this session'}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                    participant.micState ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {participant.micState ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                  {participant.micState ? 'Mic on' : 'Mic off'}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                    participant.cameraState ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {participant.cameraState ? <Video className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
                  {participant.cameraState ? 'Cam on' : 'Cam off'}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                  <Shield className="h-3.5 w-3.5 text-sky-600" />
                  Session status
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                  {String(participant.status || 'joined').toUpperCase()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ParticipantGrid;
