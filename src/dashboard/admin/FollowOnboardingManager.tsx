import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Plus, Save, Trash2 } from 'lucide-react';
import { CMSService } from '../../services/cms';
import type { FollowOnboardingContent } from '../../types';
import { DEFAULT_FOLLOW_ONBOARDING_CONTENT } from '../../utils/followOnboardingCms';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';

const FollowOnboardingManager: React.FC = () => {
  const [content, setContent] = useState<FollowOnboardingContent>(DEFAULT_FOLLOW_ONBOARDING_CONTENT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const { showNotification } = useNotification();
  const { socket } = useSocket();

  const load = useCallback(async () => {
    try {
      const current = await CMSService.getFollowOnboardingContent(true);
      setContent(current);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!socket) return;
    socket.on('cms:follow_onboarding_updated', load);
    return () => { socket.off('cms:follow_onboarding_updated', load); };
  }, [load, socket]);

  const updateHero = (key: keyof FollowOnboardingContent['hero'], value: string) => {
    setContent((current) => ({ ...current, hero: { ...current.hero, [key]: value } }));
  };

  const updateGuidance = (key: keyof FollowOnboardingContent['guidance'], value: string) => {
    setContent((current) => ({ ...current, guidance: { ...current.guidance, [key]: value } }));
  };

  const updateCard = (id: string, patch: Partial<FollowOnboardingContent['featureCards'][number]>) => {
    setContent((current) => ({
      ...current,
      featureCards: current.featureCards.map((card) => card.id === id ? { ...card, ...patch } : card)
    }));
  };

  const moveCard = (index: number, direction: -1 | 1) => {
    setContent((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.featureCards.length) return current;
      const featureCards = [...current.featureCards];
      [featureCards[index], featureCards[nextIndex]] = [featureCards[nextIndex], featureCards[index]];
      return { ...current, featureCards };
    });
  };

  const uploadImage = async (key: string, file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(file.type) || file.size > 15 * 1024 * 1024) {
      showNotification('alert', 'Invalid file', 'Choose a JPEG, PNG, WebP, AVIF, or GIF image up to 15 MB.');
      return;
    }
    setUploading(key);
    try {
      const media = await CMSService.uploadMedia(file);
      if (key === 'hero') updateHero('imageUrl', media.url);
      else updateCard(key, { imageUrl: media.url });
      showNotification('success', 'Image uploaded', 'The image is ready to save with this onboarding content.');
    } catch {
      showNotification('alert', 'Upload failed', 'The image could not be uploaded. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (loadError) {
      showNotification('alert', 'Cannot save', 'Reload the current published configuration before saving changes.');
      return;
    }
    setSaving(true);
    try {
      setContent(await CMSService.saveFollowOnboardingContent(content));
      showNotification('success', 'Saved', 'Follow-onboarding presentation content is updated.');
    } catch {
      showNotification('alert', 'Save failed', 'The content was not saved. Check the fields and try again.');
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';
  const labelClass = 'block text-sm font-medium text-slate-700';

  if (loading) return <div className="rounded-xl bg-white p-6" aria-busy="true">Loading onboarding content…</div>;

  return (
    <section className="space-y-5 rounded-xl bg-white p-4 shadow-sm sm:p-6" aria-labelledby="onboard-system-title">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 id="onboard-system-title" className="text-xl font-bold text-slate-900">Onboard System</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">Manage presentation copy, optional feature cards, and images. Required language/follow steps and completion rules remain controlled by the onboarding service.</p>
          {content.updatedAt ? <p className="mt-1 text-xs text-slate-500">Last published: {new Date(content.updatedAt).toLocaleString()}</p> : null}
        </div>
        <button type="button" onClick={save} disabled={saving || loadError} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Save size={16} aria-hidden />{saving ? 'Saving…' : 'Save changes'}
        </button>
      </header>
      {loadError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Could not load the current saved content. Saving is disabled to prevent overwriting it.</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <label className={labelClass}>Eyebrow<input className={fieldClass} maxLength={80} value={content.hero.eyebrow} onChange={(event) => updateHero('eyebrow', event.target.value)} /></label>
        <label className={labelClass}>Page heading<input className={fieldClass} maxLength={160} value={content.hero.title} onChange={(event) => updateHero('title', event.target.value)} /></label>
      </div>
      <label className={labelClass}>Introductory text<textarea className={fieldClass} rows={3} maxLength={1000} value={content.hero.description} onChange={(event) => updateHero('description', event.target.value)} /></label>
      <ImageField label="Hero image" value={content.hero.imageUrl} fieldKey="hero" uploading={uploading} onChange={(value) => updateHero('imageUrl', value)} onUpload={uploadImage} fieldClass={fieldClass} labelClass={labelClass} />

      <div className="space-y-3 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="font-semibold text-slate-900">Feature cards</h3><p className="text-xs text-slate-500">Up to six optional cards; disabling a card only hides its presentation.</p></div>
          <button type="button" disabled={content.featureCards.length >= 6} onClick={() => setContent((current) => ({ ...current, featureCards: [...current.featureCards, { id: `feature-${Date.now()}`, title: '', description: '', imageUrl: '', enabled: true }] }))} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-sm disabled:opacity-50"><Plus size={15} />Add card</button>
        </div>
        {content.featureCards.map((card, index) => (
          <article key={card.id} className="space-y-3 rounded-xl border border-slate-200 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold">Card {index + 1}</h4>
              <div className="flex items-center gap-3">
                <button type="button" aria-label={`Move card ${index + 1} up`} disabled={index === 0} onClick={() => moveCard(index, -1)} className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><ArrowUp size={16} /></button>
                <button type="button" aria-label={`Move card ${index + 1} down`} disabled={index === content.featureCards.length - 1} onClick={() => moveCard(index, 1)} className="rounded p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><ArrowDown size={16} /></button>
                <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={card.enabled} onChange={(event) => updateCard(card.id, { enabled: event.target.checked })} />Visible</label>
                <button type="button" aria-label={`Remove card ${index + 1}`} onClick={() => setContent((current) => ({ ...current, featureCards: current.featureCards.filter((_, cardIndex) => cardIndex !== index) }))} className="rounded p-2 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button>
              </div>
            </div>
            <label className={labelClass}>Title<input className={fieldClass} maxLength={100} value={card.title} onChange={(event) => updateCard(card.id, { title: event.target.value })} /></label>
            <label className={labelClass}>Description<textarea className={fieldClass} rows={2} maxLength={400} value={card.description} onChange={(event) => updateCard(card.id, { description: event.target.value })} /></label>
            <ImageField label="Card image" value={card.imageUrl} fieldKey={card.id} uploading={uploading} onChange={(value) => updateCard(card.id, { imageUrl: value })} onUpload={uploadImage} fieldClass={fieldClass} labelClass={labelClass} />
          </article>
        ))}
      </div>

      <div className="space-y-3 border-t border-slate-200 pt-4">
        <h3 className="font-semibold text-slate-900">“Why we ask this” guidance</h3>
        <label className={labelClass}>Heading<input className={fieldClass} maxLength={100} value={content.guidance.title} onChange={(event) => updateGuidance('title', event.target.value)} /></label>
        <label className={labelClass}>Language explanation<textarea className={fieldClass} rows={2} maxLength={300} value={content.guidance.language} onChange={(event) => updateGuidance('language', event.target.value)} /></label>
        <label className={labelClass}>Following explanation<textarea className={fieldClass} rows={2} maxLength={300} value={content.guidance.follows} onChange={(event) => updateGuidance('follows', event.target.value)} /></label>
        <label className={labelClass}>Privacy explanation<textarea className={fieldClass} rows={2} maxLength={300} value={content.guidance.privacy} onChange={(event) => updateGuidance('privacy', event.target.value)} /></label>
      </div>
    </section>
  );
};

const ImageField: React.FC<{
  label: string; value: string; fieldKey: string; uploading: string | null;
  onChange: (value: string) => void; onUpload: (key: string, file?: File) => Promise<void>;
  fieldClass: string; labelClass: string;
}> = ({ label, value, fieldKey, uploading, onChange, onUpload, fieldClass, labelClass }) => (
  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
    <label className={labelClass}>{label} URL<input className={fieldClass} maxLength={2048} value={value} onChange={(event) => onChange(event.target.value)} placeholder="/uploads/image.webp or https://…" /></label>
    <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
      <ImagePlus size={16} aria-hidden />{uploading === fieldKey ? 'Uploading…' : 'Upload image'}
      <input className="sr-only" type="file" accept="image/*" disabled={uploading !== null} onChange={(event) => { void onUpload(fieldKey, event.target.files?.[0]); event.currentTarget.value = ''; }} />
    </label>
  </div>
);

export default FollowOnboardingManager;
