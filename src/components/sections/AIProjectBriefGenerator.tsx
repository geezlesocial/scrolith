import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { AIService } from "../../services/ai/ai.service";
import { useNotification } from "../../context/NotificationContext";
import { useUser } from "../../context/UserContext";
import type { ProjectBriefContent } from "../../types";

const AIProjectBriefGenerator = ({ content }: { content?: ProjectBriefContent }) => {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const { user, isAuthenticated } = useUser();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const isGuest = !isAuthenticated || !user || String(user.role || "").toLowerCase() === "guest";
  const promptValue = prompt.trim();

  const badgeLabel =
    (content as any)?.badgeLabel || (content as any)?.badge_label || "Scrolitha AI Project Assistant";
  const title = (content as any)?.title || "Not sure where to start?";
  const subtitle =
    (content as any)?.subtitle ||
    "Describe your project in simple words. Scrolitha drafts a professional brief, proposes budget guidance, and prepares you to hire the right talent.";
  const inputPlaceholder =
    (content as any)?.inputPlaceholder ||
    (content as any)?.input_placeholder ||
    "e.g. I need a modern logo for my coffee shop...";
  const buttonText = (content as any)?.buttonText || (content as any)?.button_text || "Build Brief";
  const guestButtonText =
    (content as any)?.guestButtonText || (content as any)?.guest_button_text || "Login to Build Brief";
  const helperText =
    (content as any)?.helperText ||
    (content as any)?.helper_text ||
    "Takes ~5 seconds. Scrolitha will draft your project brief instantly.";
  const guestHelperText =
    (content as any)?.guestHelperText ||
    (content as any)?.guest_helper_text ||
    "Login or register to generate your brief and continue to posting.";
  const loginButtonText =
    (content as any)?.loginButtonText || (content as any)?.login_button_text || "Login";
  const registerButtonText =
    (content as any)?.registerButtonText || (content as any)?.register_button_text || "Register";

  const routeToAuth = (mode: "login" | "signup") => {
    if (promptValue) {
      sessionStorage.setItem("scrolitha_pending_project_prompt", promptValue);
    }
    const redirect = encodeURIComponent("/create-job?mode=ai_draft");
    navigate(`/auth/${mode}?redirect=${redirect}&source=scrolitha_project_brief`);
  };

  const handleGenerate = async () => {
    if (!promptValue) return;

    if (isGuest) {
      showNotification(
        "warning",
        "Login Required",
        "Please login or register to generate a Scrolitha project brief."
      );
      routeToAuth("login");
      return;
    }

    setIsGenerating(true);
    try {
      const brief = await AIService.generateProjectBrief({ prompt: promptValue });

      sessionStorage.setItem("ai_job_brief", JSON.stringify(brief));
      showNotification("success", "Brief Generated", "Redirecting to job creation...");
      navigate("/create-job?mode=ai_draft");
    } catch (error) {
      console.error("Brief generation failed:", error);
      showNotification("alert", "Error", "Could not generate brief. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-900 to-purple-900 py-20 text-white relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-overlay filter blur-3xl opacity-20 -mr-20 -mt-20"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-overlay filter blur-3xl opacity-20 -ml-20 -mb-20"></div>

      <div className="max-w-4xl mx-auto px-4 relative z-10 text-center">
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-sm font-bold mb-6">
          <Sparkles className="w-4 h-4 mr-2 text-yellow-300" />
          {badgeLabel}
        </div>

        <h2 className="text-3xl md:text-5xl font-extrabold mb-6 tracking-tight leading-tight">{title}</h2>

        <p className="text-lg md:text-xl text-indigo-100 mb-10 max-w-2xl mx-auto leading-relaxed">{subtitle}</p>

        <div className="bg-white p-2 rounded-2xl shadow-2xl flex flex-col md:flex-row gap-3 max-w-2xl mx-auto transition-transform hover:scale-[1.01]">
          <input
            type="text"
            placeholder={inputPlaceholder}
            className="flex-1 px-6 py-4 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          />
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !promptValue}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed shadow-lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generating...
              </>
            ) : (
              <>
                {isGuest ? guestButtonText : buttonText}
                <ArrowRight className="w-5 h-5 ml-2" />
              </>
            )}
          </button>
        </div>

        <p className="text-sm text-indigo-300 mt-4">{isGuest ? guestHelperText : helperText}</p>

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
              className="px-4 py-2 rounded-lg border border-white/30 bg-white text-indigo-700 text-sm font-semibold hover:bg-indigo-100 transition-colors"
            >
              {registerButtonText}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIProjectBriefGenerator;
