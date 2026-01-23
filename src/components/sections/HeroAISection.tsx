import React from "react";
import { Link } from "react-router-dom";
import type { HeroContent } from "../../types";
import { ShieldCheck, Lock, Star } from "lucide-react";

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
    <div className="relative bg-gray-900 text-white overflow-hidden">
      <div className="absolute inset-0">
        {bg ? (
          <img src={bg} alt="Hero" className="w-full h-full object-cover opacity-20" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-gray-900 via-gray-900/90 to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/90 to-transparent" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
        <div className="max-w-3xl animate-fade-in-up">
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">{headline}</h1>
          <p className="text-xl text-gray-300 mb-8 leading-relaxed">{subheadline}</p>

          <div className="flex flex-col sm:flex-row gap-4 mb-12">
            <Link
              to={primaryLink}
              className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-lg text-center transition shadow-lg shadow-green-900/20"
            >
              {primaryText}
            </Link>
            <Link
              to={secondaryLink}
              className="px-8 py-4 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-lg text-lg text-center transition"
            >
              {secondaryText}
            </Link>
          </div>

          {showTrustBadges && (
            <div className="flex flex-wrap gap-8 text-sm text-gray-300 font-medium">
              <div className="flex items-center">
                <ShieldCheck className="w-5 h-5 mr-2 text-green-400" /> Admin Verified
              </div>
              <div className="flex items-center">
                <Lock className="w-5 h-5 mr-2 text-green-400" /> Secure Escrow
              </div>
              <div className="flex items-center">
                <Star className="w-5 h-5 mr-2 text-green-400" /> Top Rated Talent
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HeroAISection;
