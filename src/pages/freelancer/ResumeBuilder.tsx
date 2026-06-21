import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Image, Loader2, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react';
import { ResumeDocument, ResumeProfileSource, ResumeService } from '../../services/resume';
import { downloadToDevice } from '../../utils/deviceDownload';
import { getBackendOrigin } from '../../utils/apiBase';

const templates = [
  { id: 'professional', label: 'Professional', note: 'Balanced business resume' },
  { id: 'modern', label: 'Modern', note: 'Clean profile-led layout' },
  { id: 'executive', label: 'Executive', note: 'Senior, concise, impact-first' },
  { id: 'creative', label: 'Creative', note: 'Visual portfolio emphasis' },
  { id: 'ats_simple', label: 'ATS Simple', note: 'Plain text-friendly, no photo' }
];

const splitLines = (value: string) =>
  value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const joinSkills = (items?: string[]) => (Array.isArray(items) ? items.join(', ') : '');

const toAbsoluteResumeUrl = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;

  const backendOrigin = getBackendOrigin();
  if (backendOrigin) {
    return raw.startsWith('/') ? `${backendOrigin}${raw}` : `${backendOrigin}/${raw}`;
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    try {
      return new URL(raw, window.location.origin).toString();
    } catch {
      return raw;
    }
  }

  return raw;
};

const SectionList: React.FC<{ title: string; items?: string[] }> = ({ title, items = [] }) => {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
            {item}
          </span>
        ))}
      </div>
    </section>
  );
};

const ResumePreview: React.FC<{ source: ResumeProfileSource | null; resume: ResumeDocument | null }> = ({ source, resume }) => {
  const output = resume?.aiOutput || {};
  return (
    <div className="min-h-[640px] rounded-[8px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">{source?.name || 'Your Name'}</h2>
          <p className="mt-1 text-sm font-medium text-blue-700">{output.headline || resume?.targetRole || source?.title || 'Professional Headline'}</p>
          <p className="mt-2 text-xs text-slate-500">{source?.location}</p>
        </div>
        {resume?.includePhoto && resume.template !== 'ats_simple' && source?.profilePhotoUrl && (
          <img src={source.profilePhotoUrl} alt="" className="h-20 w-20 rounded-full border border-slate-200 object-cover" />
        )}
      </div>

      <div className="mt-5 space-y-6 text-sm leading-6 text-slate-700">
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Professional Summary</h4>
          <p className="mt-2">{output.professionalSummary || source?.bio || 'Generate a resume to preview the AI-polished summary.'}</p>
        </section>

        <SectionList title="Core Skills" items={output.coreSkills || source?.skills || []} />
        <SectionList title="Technical Skills" items={output.technicalSkills || []} />

        {(output.workExperience || []).length > 0 && (
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Experience</h4>
            {output.workExperience.map((item: any, index: number) => (
              <div key={`${item.title}-${index}`} className="rounded-[8px] border border-slate-100 bg-slate-50 p-3">
                <p className="font-semibold text-slate-900">{item.title}</p>
                <p className="text-xs text-slate-500">{[item.company, item.location, item.startDate, item.endDate].filter(Boolean).join(' | ')}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {(item.highlights || []).map((line: string) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            ))}
          </section>
        )}

        {(output.projects || []).length > 0 && (
          <section className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Projects</h4>
            {output.projects.map((item: any, index: number) => (
              <div key={`${item.name}-${index}`}>
                <p className="font-semibold text-slate-900">{item.name}</p>
                <p>{item.description}</p>
                {item.technologies?.length > 0 && <p className="text-xs text-slate-500">Tools: {item.technologies.join(', ')}</p>}
              </div>
            ))}
          </section>
        )}

        {output.warnings?.length > 0 && (
          <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {output.warnings.join(' ')}
          </div>
        )}
      </div>
    </div>
  );
};

const ResumeBuilder: React.FC = () => {
  const [source, setSource] = useState<ResumeProfileSource | null>(null);
  const [resumes, setResumes] = useState<ResumeDocument[]>([]);
  const [active, setActive] = useState<ResumeDocument | null>(null);
  const [targetRole, setTargetRole] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [template, setTemplate] = useState('professional');
  const [includePhoto, setIncludePhoto] = useState(false);
  const [summary, setSummary] = useState('');
  const [achievements, setAchievements] = useState('');
  const [instructions, setInstructions] = useState('Make it ATS-friendly, concise, and focused on measurable client outcomes.');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const importedSkills = useMemo(() => joinSkills(source?.skills), [source?.skills]);

  const load = async () => {
    const [profileSource, history] = await Promise.all([ResumeService.getProfileSource(), ResumeService.list()]);
    setSource(profileSource);
    setResumes(history);
    setIncludePhoto(Boolean(profileSource.profilePhotoUrl));
    if (history[0]) setActive(history[0]);
  };

  useEffect(() => {
    load().catch((error) => setMessage(error?.response?.data?.error || error?.message || 'Unable to load resume builder.'));
  }, []);

  const generatePayload = () => ({
    targetRole,
    targetIndustry,
    template,
    includePhoto,
    extraDetails: {
      summary,
      achievements: splitLines(achievements),
      skills: splitLines(importedSkills)
    },
    instructions
  });

  const generate = async () => {
    setSaving(true);
    setMessage('');
    try {
      const next = await ResumeService.generate(generatePayload());
      setActive(next);
      setResumes((items) => [next, ...items.filter((item) => item.id !== next.id)]);
      setMessage('Resume generated with Scrolitha.');
    } catch (error: any) {
      setMessage(error?.response?.data?.error || error?.message || 'Resume generation failed.');
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async () => {
    if (!active) return;
    setSaving(true);
    setMessage('');
    try {
      const next = await ResumeService.regenerate(active.id, { instructions, editableData: generatePayload().extraDetails });
      setActive(next);
      setResumes((items) => items.map((item) => (item.id === next.id ? next : item)));
      setMessage('Resume regenerated.');
    } catch (error: any) {
      setMessage(error?.response?.data?.error || error?.message || 'Regeneration failed.');
    } finally {
      setSaving(false);
    }
  };

  const saveEdits = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const next = await ResumeService.update(active.id, {
        targetRole,
        targetIndustry,
        template,
        includePhoto,
        editableData: generatePayload().extraDetails
      });
      setActive(next);
      setMessage('Resume draft saved.');
    } catch (error: any) {
      setMessage(error?.response?.data?.error || error?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const result = await ResumeService.renderPdf(active.id);
      const downloadUrl = toAbsoluteResumeUrl(result.resume?.pdfUrl || active.pdfUrl || `/api/freelancer/resumes/${active.id}/download`);
      const saved = await downloadToDevice({
        url: downloadUrl,
        fileName: result.fileName || `scrolith-resume-${new Date().toISOString().slice(0, 10)}.pdf`,
        mimeType: 'application/pdf',
        preferDownloadsRoot: true
      });
      const savedLocation = saved.uri || saved.path || 'device storage';
      setMessage(`PDF generated and saved to ${savedLocation}.`);
      await load();
    } catch (error: any) {
      setMessage(error?.response?.data?.error || error?.message || 'PDF download failed.');
    } finally {
      setSaving(false);
    }
  };

  const removeResume = async (id: string) => {
    setSaving(true);
    try {
      await ResumeService.remove(id);
      const remaining = resumes.filter((item) => item.id !== id);
      setResumes(remaining);
      setActive(remaining[0] || null);
      setMessage('Resume deleted.');
    } catch (error: any) {
      setMessage(error?.response?.data?.error || error?.message || 'Delete failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[8px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
              <FileText className="h-3.5 w-3.5" /> Scrolitha Resume AI
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-950">Resume/CV Builder</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Generate, edit, preview, and download a professional resume from your Scrolith freelancer profile.
            </p>
          </div>
          <button
            onClick={load}
            className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            <RefreshCw className="h-4 w-4" /> Import profile
          </button>
        </div>
      </div>

      {message && <div className="rounded-[8px] border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">{message}</div>}

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-950">Profile source</h2>
            <p className="mt-1 text-sm text-slate-500">{source?.name || 'Loading profile'} · {source?.title || 'No title yet'}</p>
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={source?.bio || 'Add a resume summary or leave blank for Scrolitha to draft one.'}
              className="mt-4 min-h-[110px] w-full rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Profile skills</label>
            <input
              value={importedSkills}
              readOnly
              className="mt-1 w-full rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
            />
          </div>

          <div className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-950">Target and details</h2>
            <div className="mt-4 grid gap-3">
              <input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="Target role, e.g. Senior Frontend Developer" className="rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <input value={targetIndustry} onChange={(event) => setTargetIndustry(event.target.value)} placeholder="Target industry, e.g. SaaS" className="rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <textarea value={achievements} onChange={(event) => setAchievements(event.target.value)} placeholder="Extra achievements, one per line" className="min-h-[90px] rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Instructions for Scrolitha" className="min-h-[90px] rounded-[8px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
            </div>
          </div>

          <div className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-semibold text-slate-950">Template</h2>
            <div className="mt-3 grid gap-2">
              {templates.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTemplate(item.id)}
                  className={`rounded-[8px] border px-3 py-2 text-left ${template === item.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}
                >
                  <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                  <span className="text-xs text-slate-500">{item.note}</span>
                </button>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-2 rounded-[8px] border border-slate-200 p-3 text-sm text-slate-700">
              <input type="checkbox" checked={includePhoto && template !== 'ats_simple'} disabled={template === 'ats_simple'} onChange={(event) => setIncludePhoto(event.target.checked)} />
              <Image className="h-4 w-4" /> Include profile photo
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={generate} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate
            </button>
            <button onClick={regenerate} disabled={!active || saving} className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">
              <RefreshCw className="h-4 w-4" /> Regenerate
            </button>
            <button onClick={saveEdits} disabled={!active || saving} className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">
              <Save className="h-4 w-4" /> Save draft
            </button>
            <button onClick={downloadPdf} disabled={!active || saving} className="inline-flex items-center justify-center gap-2 rounded-[8px] bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              <Download className="h-4 w-4" /> PDF
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <ResumePreview source={source} resume={active} />
          <aside className="space-y-3">
            <div className="rounded-[8px] border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="font-semibold text-slate-950">Version history</h2>
              <div className="mt-3 space-y-2">
                {resumes.map((item) => (
                  <button key={item.id} onClick={() => setActive(item)} className={`w-full rounded-[8px] border p-3 text-left ${active?.id === item.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                    <span className="block text-sm font-semibold text-slate-900">{item.title}</span>
                    <span className="text-xs text-slate-500">{item.status} · {new Date(item.updatedAt).toLocaleDateString()}</span>
                  </button>
                ))}
                {!resumes.length && <p className="text-sm text-slate-500">Generated resumes will appear here.</p>}
              </div>
            </div>
            {active && (
              <button onClick={() => removeResume(active.id)} disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded-[8px] border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
                <Trash2 className="h-4 w-4" /> Delete resume
              </button>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ResumeBuilder;
