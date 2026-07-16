import React from "react";
import { Link } from "react-router-dom";
import type { HeroContent } from "../../types";
import { Compass, Lock, Network, ShieldCheck, Sparkles, Star } from "lucide-react";

/** Scrolith-unique identity pillars — not LinkedIn/Facebook clones. */
const SCROLITH_PILLARS = [
  {
    label: "Why we exist",
    copy: "One graph for work, talent, commerce, and community — not five disconnected tools.",
    icon: Compass
  },
  {
    label: "What is different",
    copy: "AI-guided activation with Scrolitha, escrow-backed delivery, and a live professional network.",
    icon: Sparkles
  },
  {
    label: "Why join",
    copy: "Create once, get discovered, hire or get hired, and grow inside a trusted enterprise platform.",
    icon: Network
  },
  {
    label: "Why stay",
    copy: "Your reputation, wallet, conversations, and opportunities compound in one secure workspace.",
    icon: ShieldCheck
  }
] as const;

const HeroAISection = ({ content }: { content: HeroContent }) => {
  const bg = (content as any)?.backgroundImage || (content as any)?.background_image || "";
  const headline = (content as any)?.headline || (content as any)?.title || "";
  const subheadline = (content as any)?.subheadline || (content as any)?.subtitle || "";
  const primaryText = (content as any)?.primaryCtaText || (content as any)?.primary_cta_text || "Browse Talent";
  const primaryLink = (content as any)?.primaryCtaLink || (content as any)?.primary_cta_link || "/browse";
  const secondaryText = (content as any)?.secondaryCtaText || (content as any)?.secondary_cta_text || "Post a Job";
  const secondaryLink = (content as any)?.secondaryCtaLink || (content as any)?.secondary_cta_link || "/create-job";
  const showTrustBadges = Boolean((content as any)?.showTrustBadges ?? (content as any)?.show_trust_badges ?? true);

  return (
    <section aria-label="Hero" className="guest-hero relative overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0">
        {bg ? (
          <img
            src={bg}
            alt=""
            loading="eager"
            decoding="async"
            fetchPriority="high"
            className="h-full w-full object-cover opacity-25"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/92 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.14),transparent_42%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.12),transparent_40%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 md:py-24 lg:px-8 lg:py-28">
        <div className="max-w-3xl animate-fade-in-up motion-reduce:animate-none">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100/90">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            The professional work graph
          </p>
          <h1 className="mb-5 text-4xl font-extrabold leading-[1.08] tracking-tight md:text-5xl lg:text-6xl">
            {headline}
          </h1>
          <p className="mb-4 max-w-2xl text-lg leading-relaxed text-slate-300 md:text-xl">{subheadline}</p>
          <p className="mb-8 max-w-2xl text-sm leading-relaxed text-slate-400 md:text-base">
            Scrolith unifies network, marketplace, jobs, communities, and Scrolitha AI — so professionals start faster
            and enterprises operate with confidence.
          </p>

          <div className="mb-10 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Link
              to={primaryLink}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-emerald-600 px-8 py-3.5 text-center text-base font-bold text-white shadow-lg shadow-emerald-900/25 transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 md:text-lg"
            >
              {primaryText}
            </Link>
            <Link
              to={secondaryLink}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-white/15 bg-white px-8 py-3.5 text-center text-base font-bold text-slate-950 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:text-lg"
            >
              {secondaryText}
            </Link>
          </div>

          <ul className="mb-10 grid gap-3 sm:grid-cols-2" aria-label="Why Scrolith">
            {SCROLITH_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <li
                  key={pillar.label}
                  className="guest-hero-pillar rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-400/10 ring-1 ring-cyan-200/15">
                      <Icon className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/80">
                      {pillar.label}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-slate-300">{pillar.copy}</p>
                </li>
              );
            })}
          </ul>

          {showTrustBadges && (
            <ul className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-medium text-slate-300">
              <li className="flex items-center">
                <ShieldCheck className="mr-2 h-5 w-5 text-emerald-400" aria-hidden="true" />
                Admin Verified
              </li>
              <li className="flex items-center">
                <Lock className="mr-2 h-5 w-5 text-emerald-400" aria-hidden="true" />
                Secure Escrow
              </li>
              <li className="flex items-center">
                <Star className="mr-2 h-5 w-5 text-emerald-400" aria-hidden="true" />
                Top Rated Talent
              </li>
            </ul>
          )}
        </div>
      </div>
    </section>
  );
};

export default HeroAISection;
