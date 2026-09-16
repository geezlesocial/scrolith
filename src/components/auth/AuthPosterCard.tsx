import React from 'react';
import posterCard from '../../assets/scrolith-login-poster-card.png';

type AuthPosterCardProps = {
  mode: 'login' | 'signup';
};

const AuthPosterCard = ({ mode }: AuthPosterCardProps) => {
  const isSignup = mode === 'signup';

  return (
    <figure
      className="relative mx-auto my-8 w-full max-w-[31rem] overflow-hidden rounded-[1.6rem] border border-white/15 bg-slate-950/70 p-2 shadow-[0_22px_70px_rgba(2,8,23,0.42)] ring-1 ring-sky-300/10"
      aria-label={isSignup ? 'Scrolith community and professional growth' : 'Scrolith professional workspace'}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_18%,rgba(14,165,233,0.22),transparent_36%),radial-gradient(circle_at_18%_80%,rgba(37,99,235,0.18),transparent_34%)]" aria-hidden="true" />
      <img
        src={posterCard}
        alt="Scrolith connects people, work, payments, messaging, and community in one professional platform."
        className="relative block h-[17rem] w-full rounded-[1.15rem] object-contain object-center sm:h-[19rem]"
        loading="lazy"
        decoding="async"
      />
      <figcaption className="relative flex items-center justify-between gap-3 px-3 pb-2 pt-3 text-[0.63rem] font-semibold uppercase tracking-[0.2em] text-sky-100/80">
        <span>{isSignup ? 'Build · Connect · Grow' : 'Work · Connect · Grow'}</span>
        <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-slate-300/80">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" aria-hidden="true" />
          Scrolith ecosystem
        </span>
      </figcaption>
    </figure>
  );
};

export default AuthPosterCard;
