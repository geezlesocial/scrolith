import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileSearch, Link2, Loader2, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react';
import { ResumeAnalysis, ResumeReviewService } from '../../services/resumeReview';

const splitList = (value: string) =>
  value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const ScoreBar: React.FC<{ label: string; value?: number }> = ({ label, value = 0 }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600">
      <span>{label}</span>
      <span>{Math.round(value)}%</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  </div>
);

const Report: React.FC<{ analysis: ResumeAnalysis | null }> = ({ analysis }) => {
  const result = analysis?.analysisResult || {};
  const breakdown = result.scoreBreakdown || {};

  if (!analysis) {
    return (
      <div className="rounded-[8px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Upload a resume or paste a Scrolith profile URL to generate an AI-assisted review.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[8px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" /> Human review required
            </p>
            <h2 className="mt-3 text-xl font-semibold text-slate-950">{analysis.jobTitle || 'Resume review'}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{result.summary || analysis.errorMessage || 'Review is processing.'}</p>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 gap-2">
            <div className="rounded-[8px] bg-blue-50 p-3 text-center">
              <p className="text-2xl font-semibold text-blue-700">{analysis.overallScore ?? result.overallScore ?? '-'}</p>
              <p className="text-xs text-blue-700">Overall</p>
            </div>
            <div className="rounded-[8px] bg-slate-950 p-3 text-center">
              <p className="text-2xl font-semibold text-white">{analysis.roleFitScore ?? result.roleFitScore ?? '-'}</p>
              <p className="text-xs text-slate-200">Role fit</p>
            </div>
          </div>
        </div>
        <p className="mt-4 rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          {result.complianceNotice || 'Scrolitha provides an AI-assisted review. Final hiring decisions must be made by a human reviewer.'}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-[8px] border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-950">Score breakdown</h3>
          <div className="mt-4 space-y-4">
            <ScoreBar label="Skills match" value={breakdown.skillsMatch} />
            <ScoreBar label="Experience match" value={breakdown.experienceMatch} />
            <ScoreBar label="Portfolio relevance" value={breakdown.portfolioMatch} />
            <ScoreBar label="Education relevance" value={breakdown.educationMatch} />
            <ScoreBar label="Communication quality" value={breakdown.communicationQuality} />
            <ScoreBar label="Role-specific evidence" value={breakdown.roleSpecificEvidence} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[8px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-950">Strengths</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
              {(result.strengths || []).map((item: string) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="rounded-[8px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-950">Gaps</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
              {(result.weaknesses || []).map((item: string) => <li key={item}>{item}</li>)}
            </ul>
          </div>
          <div className="rounded-[8px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-950">Missing requirements</h3>
            <div className="mt-3 space-y-3">
              {(result.missingRequirements || []).map((item: any) => (
                <div key={item.requirement} className="rounded-[8px] bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">{item.requirement}</p>
                  <p>{item.impact}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.suggestedQuestion}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[8px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-950">Interview questions</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
              {(result.suggestedInterviewQuestions || []).map((item: string) => <li key={item}>{item}</li>)}
            </ol>
          </div>
        </div>
      </div>

      {(result.redFlags || []).length > 0 && (
        <div className="rounded-[8px] border border-red-200 bg-red-50 p-5">
          <h3 className="flex items-center gap-2 font-semibold text-red-900"><AlertTriangle className="h-4 w-4" /> Review flags</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {result.redFlags.map((item: any) => (
              <div key={`${item.issue}-${item.evidence}`} className="rounded-[8px] bg-white p-3 text-sm text-red-900">
                <p className="font-semibold">{item.issue}</p>
                <p className="text-xs">{item.evidence}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ResumeReviewer: React.FC = () => {
  const [history, setHistory] = useState<ResumeAnalysis[]>([]);
  const [active, setActive] = useState<ResumeAnalysis | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [profileUrl, setProfileUrl] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [requiredSkills, setRequiredSkills] = useState('');
  const [preferredSkills, setPreferredSkills] = useState('');
  const [seniorityLevel, setSeniorityLevel] = useState('');
  const [evaluationInstructions, setEvaluationInstructions] = useState('Focus on production evidence, role-relevant skills, and interview follow-up questions.');
  const [mode, setMode] = useState<'upload' | 'profile'>('upload');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const payload = useMemo(() => ({
    jobTitle,
    jobDescription,
    requiredSkills: splitList(requiredSkills),
    preferredSkills: splitList(preferredSkills),
    seniorityLevel,
    evaluationInstructions
  }), [evaluationInstructions, jobDescription, jobTitle, preferredSkills, requiredSkills, seniorityLevel]);

  const loadHistory = async () => {
    const items = await ResumeReviewService.list();
    setHistory(items);
    if (!active && items[0]) setActive(items[0]);
  };

  useEffect(() => {
    loadHistory().catch((error) => setMessage(error?.response?.data?.error || error?.message || 'Unable to load resume reviews.'));
  }, []);

  const analyze = async () => {
    setLoading(true);
    setMessage('');
    try {
      if (mode === 'upload') {
        if (!file) {
          setMessage('Choose a resume/CV file first.');
          return;
        }
        const next = await ResumeReviewService.upload(file, payload);
        setActive(next);
      } else {
        const next = await ResumeReviewService.analyzeProfileUrl({ ...payload, profileUrl });
        setActive(next);
      }
      await loadHistory();
      setMessage('Scrolitha review completed.');
    } catch (error: any) {
      setMessage(error?.response?.data?.error || error?.message || 'Resume review failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[8px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-purple-700">
          <FileSearch className="h-3.5 w-3.5" /> Scrolitha hiring intelligence
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-950">Resume/CV Reviewer</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
          Analyze candidate resumes and public Scrolith profiles against role requirements. Scrolitha provides an assistive review; final hiring decisions must be made by a human reviewer.
        </p>
      </div>

      {message && <div className="rounded-[8px] border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">{message}</div>}

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-950">Candidate source</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button onClick={() => setMode('upload')} className={`inline-flex items-center justify-center gap-2 rounded-[8px] border px-3 py-2 text-sm font-semibold ${mode === 'upload' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700'}`}>
                <UploadCloud className="h-4 w-4" /> Upload
              </button>
              <button onClick={() => setMode('profile')} className={`inline-flex items-center justify-center gap-2 rounded-[8px] border px-3 py-2 text-sm font-semibold ${mode === 'profile' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700'}`}>
                <Link2 className="h-4 w-4" /> Profile URL
              </button>
            </div>
            {mode === 'upload' ? (
              <label className="mt-4 flex min-h-[130px] cursor-pointer flex-col items-center justify-center rounded-[8px] border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
                <UploadCloud className="h-7 w-7 text-slate-400" />
                <span className="mt-2 text-sm font-semibold text-slate-700">{file?.name || 'Choose PDF, DOCX, TXT, PNG, JPG, or WEBP'}</span>
                <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp" onChange={(event) => setFile(event.target.files?.[0] || null)} />
              </label>
            ) : (
              <input value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} placeholder="https://scrolith.com/profile/username" className="mt-4 w-full rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            )}
          </div>

          <div className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-950">Role criteria</h2>
            <div className="mt-4 grid gap-3">
              <input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Job title" className="rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />   
              <textarea value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Job description and responsibilities" className="min-h-[130px] rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              {jobDescription.trim().length > 0 && jobDescription.trim().length < 10 && (
                <p className="text-xs text-red-500">Role description must be at least 10 characters.</p>
              )}
              <input value={requiredSkills} onChange={(event) => setRequiredSkills(event.target.value)} placeholder="Required skills, comma separated" className="rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <input value={preferredSkills} onChange={(event) => setPreferredSkills(event.target.value)} placeholder="Preferred skills, comma separated" className="rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <input value={seniorityLevel} onChange={(event) => setSeniorityLevel(event.target.value)} placeholder="Seniority level" className="rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <textarea value={evaluationInstructions} onChange={(event) => setEvaluationInstructions(event.target.value)} placeholder="Evaluation notes" className="min-h-[90px] rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
            <button onClick={analyze} disabled={loading || (mode === 'upload' && !file) || (mode === 'profile' && !profileUrl.trim()) || jobDescription.trim().length < 10} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[8px] bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Analyze / Review
            </button>
          </div>

          <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
            Scrolitha's resume review is an AI-assisted evaluation based on the provided resume/profile and role criteria. It is not a final hiring decision. Employers are responsible for human review and compliance with applicable employment laws.
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Report analysis={active} />
          <aside className="space-y-3">
            <div className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-slate-950">Review history</h2>
              <div className="mt-3 space-y-2">
                {history.map((item) => (
                  <button key={item.id} onClick={() => setActive(item)} className={`w-full rounded-[8px] border p-3 text-left ${active?.id === item.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                    <span className="block text-sm font-semibold text-slate-900">{item.jobTitle || item.sourceFileName || 'Resume review'}</span>
                    <span className="text-xs text-slate-500">{item.status} · {item.overallScore ?? '-'} overall · {new Date(item.createdAt).toLocaleDateString()}</span>
                  </button>
                ))}
                {!history.length && <p className="text-sm text-slate-500">Completed reviews will appear here.</p>}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ResumeReviewer;
