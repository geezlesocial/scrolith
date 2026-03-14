import React from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";
import { useNotification } from "../../context/NotificationContext";
import { useUser } from "../../context/UserContext";
import type { GigCreationContent } from "../../types";
import { buildScrolithaPath } from "../../utils/scrolithaLaunch";

const AIGigCreationCTA = ({ content }: { content?: GigCreationContent }) => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const { user, isAuthenticated } = useUser();
  const isGuest = !isAuthenticated || !user || String(user.role || "").toLowerCase() === "guest";

  const badgeLabel =
    (content as any)?.badgeLabel || (content as any)?.badge_label || "Scrolitha Gig Assistant";
  const headline = (content as any)?.headline || "Create a Gig That Gets Hired";
  const subheadline =
    (content as any)?.subheadline ||
    "Let Scrolitha help you craft your service offering with stronger titles, clear deliverables, and practical pricing suggestions.";
  const buttonText = (content as any)?.buttonText || (content as any)?.button_text || "Create Gig with AI";
  const guestButtonText =
    (content as any)?.guestButtonText || (content as any)?.guest_button_text || "Login to Create Gig with AI";
  const helperText =
    (content as any)?.helperText ||
    (content as any)?.helper_text ||
    "Scrolitha will open in your gig builder and guide the title, scope, tags, and positioning.";
  const guestHelperText =
    (content as any)?.guestHelperText ||
    (content as any)?.guest_helper_text ||
    "Login or register to continue with Scrolitha gig creation.";
  const loginButtonText =
    (content as any)?.loginButtonText || (content as any)?.login_button_text || "Login";
  const registerButtonText =
    (content as any)?.registerButtonText || (content as any)?.register_button_text || "Register";
  const launchPrompt =
    (content as any)?.assistantPrompt || (content as any)?.assistant_prompt || "Create a gig draft";

  const routeToAuth = (mode: "login" | "signup") => {
    const redirect = encodeURIComponent(buildScrolithaPath("/create-gig", launchPrompt));
    navigate(`/auth/${mode}?redirect=${redirect}&source=scrolitha_gig_creation`);
  };

  const handlePrimaryClick = () => {
    if (isGuest) {
      showNotification(
        "warning",
        "Login Required",
        "Please login or register to continue with AI gig creation."
      );
      routeToAuth("login");
      return;
    }

    navigate(buildScrolithaPath("/create-gig", launchPrompt));
  };

  return (
    <div className="py-20 bg-gray-900 text-white text-center relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-30 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
        <div className="absolute top-0 -right-24 w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
      </div>

      <div className="max-w-3xl mx-auto px-4 relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full mb-8 backdrop-blur-sm border border-white/10">
          <Sparkles className="w-5 h-5 text-yellow-400" />
          <span className="text-sm font-semibold">{badgeLabel}</span>
        </div>

        <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">{headline}</h2>

        <p className="text-xl text-gray-300 mb-10 leading-relaxed max-w-2xl mx-auto">{subheadline}</p>

        <button
          onClick={handlePrimaryClick}
          className="inline-flex items-center px-10 py-5 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-xl transition shadow-lg shadow-blue-900/50 hover:scale-105 transform"
        >
          {isGuest ? guestButtonText : buttonText} <ArrowRight className="ml-3 w-6 h-6" />
        </button>

        <p className="mt-4 text-sm text-gray-300">{isGuest ? guestHelperText : helperText}</p>

        {isGuest && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => routeToAuth("login")}
              className="px-4 py-2 rounded-lg border border-white/30 bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors"
            >
              {loginButtonText}
            </button>
            <button
              onClick={() => routeToAuth("signup")}
              className="px-4 py-2 rounded-lg border border-white/30 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-100 transition-colors"
            >
              {registerButtonText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIGigCreationCTA;
