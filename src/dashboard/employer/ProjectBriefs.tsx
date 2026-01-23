import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, Save, FileText, ArrowRight } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { BriefsService } from '../../services/briefs';
import { ProjectBrief } from '../../types';
import { useNavigate } from 'react-router-dom';

type GeneratedBrief = {
  title: string;
  category: string;
  budgetRange: string;
  timeline: string;
  description: string;
  requiredSkills: string[];
  screeningQuestions: string[];
};

const ProjectBriefs = () => {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState<GeneratedBrief | null>(null);
  const [briefs, setBriefs] = useState<ProjectBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const loadBriefs = async () => {
    setLoading(true);
    try {
      const data = await BriefsService.listBriefs();
      setBriefs(data);
    } catch (error) {
      setBriefs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBriefs();
  }, []);

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      showNotification('alert', 'Prompt Required', 'Describe your project to generate a brief.');
      return;
    }
    setGenerating(true);
    try {
      const brief = await BriefsService.generateBrief(trimmed);
      setGenerated(brief);
    } catch (error) {
      showNotification('alert', 'Error', 'Failed to generate brief.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!generated) return;
    setSaving(true);
    try {
      await BriefsService.saveBrief({
        prompt,
        title: generated.title,
        category: generated.category,
        budget_range: generated.budgetRange,
        timeline: generated.timeline,
        description: generated.description,
        required_skills: generated.requiredSkills,
        screening_questions: generated.screeningQuestions
      } as any);
      showNotification('success', 'Brief Saved', 'Your brief is now available in the list.');
      setPrompt('');
      setGenerated(null);
      loadBriefs();
    } catch (error) {
      showNotification('alert', 'Error', 'Failed to save brief.');
    } finally {
      setSaving(false);
    }
  };

  const handleUseBrief = async (brief: ProjectBrief) => {
    try {
      const result = await BriefsService.useBrief(brief.id);
      const payload = result.jobDraft || {
        title: brief.title,
        description: brief.description,
        tags: brief.required_skills,
        budget: brief.budget_range,
        timeline: brief.timeline
      };
      sessionStorage.setItem('ai_job_brief', JSON.stringify(payload));
      showNotification('success', 'Brief Loaded', 'We pre-filled your job draft.');
      navigate('/create-job?mode=ai_draft');
    } catch (error) {
      showNotification('alert', 'Error', 'Failed to load brief into job draft.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Create Brief (AI)</h2>
            <p className="text-sm text-gray-500">Describe your project and get a structured brief.</p>
          </div>
        </div>

        <div className="space-y-4">
          <textarea
            className="w-full border border-gray-200 rounded-xl p-4 h-36 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Example: I need a new e-commerce website with product search, filters, and Stripe checkout."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60"
            >
              {generating ? (
                <span className="inline-flex items-center">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating
                </span>
              ) : (
                'Generate Brief'
              )}
            </button>
            {generated && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-60"
              >
                {saving ? (
                  <span className="inline-flex items-center">
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving
                  </span>
                ) : (
                  <span className="inline-flex items-center">
                    <Save className="w-4 h-4 mr-2" /> Save Brief
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {generated && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">Generated Brief</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <div className="text-xs text-gray-400">Title</div>
              <div className="font-semibold text-gray-900">{generated.title}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Category</div>
              <div className="font-semibold text-gray-900">{generated.category}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Budget</div>
              <div className="font-semibold text-gray-900">{generated.budgetRange}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400">Timeline</div>
              <div className="font-semibold text-gray-900">{generated.timeline}</div>
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-400">Description</div>
            <p className="text-sm text-gray-700 whitespace-pre-line">{generated.description}</p>
          </div>
          {generated.requiredSkills.length > 0 && (
            <div>
              <div className="text-xs text-gray-400">Required Skills</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {generated.requiredSkills.map((skill) => (
                  <span key={skill} className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Saved Briefs</h3>
          <button
            type="button"
            onClick={loadBriefs}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Refresh
          </button>
        </div>
        {loading ? (
          <div className="text-center text-gray-400 py-6">Loading briefs...</div>
        ) : briefs.length === 0 ? (
          <div className="text-center text-gray-400 py-6">No briefs saved yet.</div>
        ) : (
          <div className="space-y-3">
            {briefs.map((brief) => (
              <div key={brief.id} className="border border-gray-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <div className="font-semibold text-gray-900">{brief.title}</div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{brief.category} • {brief.timeline}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUseBrief(brief)}
                  className="inline-flex items-center px-3 py-2 text-xs font-semibold text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
                >
                  Use to Create Job <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectBriefs;
