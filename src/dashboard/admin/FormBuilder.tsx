import React, { useEffect, useMemo, useState } from 'react';
import { Save, RefreshCw, Settings2, ChevronUp, ChevronDown, FileJson } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

const DEFAULT_CONFIG = {
  gig: {
    layout: { titleCreate: 'Create New Gig', titleEdit: 'Edit Gig', sectionGap: 24, cardPadding: 32 },
    steps: [
      { id: 'overview', label: 'Overview', enabled: true },
      { id: 'pricing', label: 'Scope & Pricing', enabled: true },
      { id: 'description', label: 'Description', enabled: true },
      { id: 'requirements', label: 'Requirements', enabled: true },
      { id: 'gallery', label: 'Gallery', enabled: true },
      { id: 'publish', label: 'Publish', enabled: true }
    ],
    labels: {
      titleLabel: 'Gig Title',
      categoryLabel: 'Category',
      subcategoryLabel: 'Subcategory',
      pricingTitle: 'Scope & Pricing',
      extrasTitle: 'Gig Extras',
      faqTitle: 'FAQs',
      descriptionLabel: 'Gig Description',
      requirementsTitle: 'Requirements',
      galleryTitle: 'Gallery'
    },
    controls: {
      showAI: true,
      showPackages: true,
      showPackageFeatures: true,
      showExtras: true,
      showFAQs: true,
      showRequirements: true,
      showGalleryImages: true,
      showGalleryVideos: true,
      showGalleryDocs: true
    }
  },
  job: {
    layout: { titleCreate: 'Create Job Post', titleEdit: 'Edit Job Post', sectionGap: 24, cardPadding: 32 },
    steps: [
      { id: 'overview', label: 'Job Overview', enabled: true },
      { id: 'budget', label: 'Budget & Timeline', enabled: true },
      { id: 'description', label: 'Description', enabled: true },
      { id: 'attachments', label: 'Attachments', enabled: true },
      { id: 'plan', label: 'Plan', enabled: true },
      { id: 'review', label: 'Review', enabled: true }
    ],
    labels: {
      titleLabel: 'Job Title',
      categoryLabel: 'Category',
      subcategoryLabel: 'Subcategory',
      budgetTitle: 'Budget & Timeline',
      descriptionLabel: 'Job Description',
      attachmentsTitle: 'Attachments',
      planTitle: 'Plan Selection'
    },
    controls: {
      showBudgetAdvice: true,
      showAttachments: true,
      showPlanStep: true
    }
  }
};

const isPlainObject = (v: any) => v && typeof v === 'object' && !Array.isArray(v);

const deepMergeReplaceArrays = (existing: any, incoming: any): any => {
  if (incoming === undefined) return existing;
  if (Array.isArray(incoming)) return incoming;
  if (!isPlainObject(incoming)) return incoming;
  const out: any = { ...(isPlainObject(existing) ? existing : {}) };
  for (const key of Object.keys(incoming)) {
    out[key] = deepMergeReplaceArrays(existing ? existing[key] : undefined, incoming[key]);
  }
  return out;
};

const CONTROL_LABELS: Record<string, string> = {
  showAI: 'AI Assistant',
  showPackages: 'Packages Table',
  showPackageFeatures: 'Package Features',
  showExtras: 'Gig Extras',
  showFAQs: 'FAQs',
  showRequirements: 'Requirements',
  showGalleryImages: 'Gallery Images',
  showGalleryVideos: 'Gallery Videos',
  showGalleryDocs: 'Gallery Documents',
  showBudgetAdvice: 'Budget Advice',
  showAttachments: 'Attachments',
  showPlanStep: 'Plan Step'
};

const FormBuilder: React.FC = () => {
  const { showNotification } = useNotification();
  const [activeForm, setActiveForm] = useState<'gig' | 'job'>('gig');
  const [config, setConfig] = useState<any>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rawJson, setRawJson] = useState('');
  const [activeStepId, setActiveStepId] = useState<string>('');

  const activeConfig = useMemo(() => config?.[activeForm] || {}, [config, activeForm]);
  const stepOptions = Array.isArray(activeConfig?.steps) ? activeConfig.steps : [];

  useEffect(() => {
    const firstStepId = stepOptions[0]?.id || '';
    if (!activeStepId || !stepOptions.find((s: any) => s.id === activeStepId)) {
      setActiveStepId(firstStepId);
    }
  }, [activeForm, stepOptions.length]);

  const syncJson = (nextConfig: any) => {
    try {
      setRawJson(JSON.stringify(nextConfig, null, 2));
    } catch {
      // ignore
    }
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await AdminService.getFormConfig();
      const merged = deepMergeReplaceArrays(DEFAULT_CONFIG, data || {});
      setConfig(merged);
      syncJson(merged);
    } catch (error: any) {
      setConfig(DEFAULT_CONFIG);
      syncJson(DEFAULT_CONFIG);
      showNotification('error', 'Load Failed', error?.message || 'Unable to load form configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateActiveConfig = (patch: any) => {
    setConfig((prev: any) => {
      const next = {
        ...prev,
        [activeForm]: deepMergeReplaceArrays(prev?.[activeForm] || {}, patch)
      };
      syncJson(next);
      return next;
    });
  };

  const updateLayoutField = (field: string, value: any) => {
    updateActiveConfig({ layout: { [field]: value } });
  };

  const updateLabelField = (field: string, value: any) => {
    updateActiveConfig({ labels: { [field]: value } });
  };

  const updateControlField = (field: string, value: boolean) => {
    updateActiveConfig({ controls: { [field]: value } });
  };

  const updateCustomBlocks = (stepId: string, blocks: any[]) => {
    setConfig((prev: any) => {
      const current = prev?.[activeForm] || {};
      const customBlocks = { ...(current.customBlocks || {}) };
      customBlocks[stepId] = blocks;
      const next = { ...prev, [activeForm]: { ...current, customBlocks } };
      syncJson(next);
      return next;
    });
  };

  const updateCustomFields = (stepId: string, fields: any[]) => {
    setConfig((prev: any) => {
      const current = prev?.[activeForm] || {};
      const customFields = { ...(current.customFields || {}) };
      customFields[stepId] = fields;
      const next = { ...prev, [activeForm]: { ...current, customFields } };
      syncJson(next);
      return next;
    });
  };

  const addBlock = () => {
    if (!activeStepId) return;
    const blocks = Array.isArray(activeConfig?.customBlocks?.[activeStepId])
      ? [...activeConfig.customBlocks[activeStepId]]
      : [];
    blocks.push({ id: `block-${Date.now()}`, type: 'text', content: '' });
    updateCustomBlocks(activeStepId, blocks);
  };

  const updateBlockField = (idx: number, field: string, value: any) => {
    if (!activeStepId) return;
    const blocks = Array.isArray(activeConfig?.customBlocks?.[activeStepId])
      ? [...activeConfig.customBlocks[activeStepId]]
      : [];
    if (!blocks[idx]) return;
    blocks[idx] = { ...blocks[idx], [field]: value };
    updateCustomBlocks(activeStepId, blocks);
  };

  const removeBlock = (idx: number) => {
    if (!activeStepId) return;
    const blocks = Array.isArray(activeConfig?.customBlocks?.[activeStepId])
      ? [...activeConfig.customBlocks[activeStepId]]
      : [];
    updateCustomBlocks(activeStepId, blocks.filter((_: any, i: number) => i !== idx));
  };

  const moveBlock = (idx: number, direction: -1 | 1) => {
    if (!activeStepId) return;
    const blocks = Array.isArray(activeConfig?.customBlocks?.[activeStepId])
      ? [...activeConfig.customBlocks[activeStepId]]
      : [];
    const target = idx + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const temp = next[idx];
    next[idx] = next[target];
    next[target] = temp;
    updateCustomBlocks(activeStepId, next);
  };

  const addField = () => {
    if (!activeStepId) return;
    const fields = Array.isArray(activeConfig?.customFields?.[activeStepId])
      ? [...activeConfig.customFields[activeStepId]]
      : [];
    fields.push({ id: `field-${Date.now()}`, key: '', label: '', type: 'text', required: false });
    updateCustomFields(activeStepId, fields);
  };

  const updateField = (idx: number, field: string, value: any) => {
    if (!activeStepId) return;
    const fields = Array.isArray(activeConfig?.customFields?.[activeStepId])
      ? [...activeConfig.customFields[activeStepId]]
      : [];
    if (!fields[idx]) return;
    fields[idx] = { ...fields[idx], [field]: value };
    updateCustomFields(activeStepId, fields);
  };

  const removeField = (idx: number) => {
    if (!activeStepId) return;
    const fields = Array.isArray(activeConfig?.customFields?.[activeStepId])
      ? [...activeConfig.customFields[activeStepId]]
      : [];
    updateCustomFields(activeStepId, fields.filter((_: any, i: number) => i !== idx));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const steps = Array.isArray(activeConfig.steps) ? [...activeConfig.steps] : [];
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const updated = [...steps];
    const temp = updated[index];
    updated[index] = updated[target];
    updated[target] = temp;
    updateActiveConfig({ steps: updated });
  };

  const updateStepField = (index: number, field: string, value: any) => {
    const steps = Array.isArray(activeConfig.steps) ? [...activeConfig.steps] : [];
    if (!steps[index]) return;
    steps[index] = { ...steps[index], [field]: value };
    updateActiveConfig({ steps });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...config, updatedAt: new Date().toISOString() };
      await AdminService.saveFormConfig(payload);
      showNotification('success', 'Saved', 'Form configuration updated.');
    } catch (error: any) {
      showNotification('error', 'Save Failed', error?.message || 'Unable to save form configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyJson = () => {
    try {
      const parsed = JSON.parse(rawJson || '{}');
      const merged = deepMergeReplaceArrays(DEFAULT_CONFIG, parsed);
      setConfig(merged);
      syncJson(merged);
      showNotification('success', 'JSON Applied', 'Configuration updated from JSON.');
    } catch (error: any) {
      showNotification('error', 'Invalid JSON', error?.message || 'Please provide valid JSON.');
    }
  };

  const labelKeys = Object.keys(activeConfig?.labels || {});
  const controlKeys = Object.keys(activeConfig?.controls || {});
  const currentBlocks = Array.isArray(activeConfig?.customBlocks?.[activeStepId]) ? activeConfig.customBlocks[activeStepId] : [];
  const currentFields = Array.isArray(activeConfig?.customFields?.[activeStepId]) ? activeConfig.customFields[activeStepId] : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Form Builder</h2>
          <p className="text-sm text-gray-500">Customize the Create Gig and Create Job forms without affecting other platform settings.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadConfig}
            className="px-4 py-2 rounded-xl border bg-white text-sm font-semibold hover:bg-gray-50 inline-flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reload
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 inline-flex items-center disabled:opacity-60"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveForm('gig')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold border ${activeForm === 'gig' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}
        >
          Create Gig Form
        </button>
        <button
          onClick={() => setActiveForm('job')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold border ${activeForm === 'job' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}
        >
          Create Job Form
        </button>
      </div>

      {loading ? (
        <div className="bg-white border rounded-2xl p-6 text-center text-gray-500">Loading configuration...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <div className="bg-white border rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <Settings2 className="w-4 h-4" />
                Layout & Spacing
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500">Title (Create)</label>
                  <input
                    className="w-full border rounded-lg p-2"
                    value={activeConfig?.layout?.titleCreate || ''}
                    onChange={(e) => updateLayoutField('titleCreate', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">Title (Edit)</label>
                  <input
                    className="w-full border rounded-lg p-2"
                    value={activeConfig?.layout?.titleEdit || ''}
                    onChange={(e) => updateLayoutField('titleEdit', e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">Section Gap (px)</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg p-2"
                    value={activeConfig?.layout?.sectionGap ?? 24}
                    onChange={(e) => updateLayoutField('sectionGap', Number(e.target.value || 0))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">Card Padding (px)</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg p-2"
                    value={activeConfig?.layout?.cardPadding ?? 32}
                    onChange={(e) => updateLayoutField('cardPadding', Number(e.target.value || 0))}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <Settings2 className="w-4 h-4" />
                Step Labels & Ordering
              </div>
              <div className="space-y-3">
                {(activeConfig?.steps || []).map((step: any, idx: number) => (
                  <div key={step.id || idx} className="border rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-gray-500">Step Label</label>
                      <input
                        className="w-full border rounded-lg p-2"
                        value={step.label || ''}
                        onChange={(e) => updateStepField(idx, 'label', e.target.value)}
                      />
                      <div className="text-[11px] text-gray-400 mt-1">ID: {step.id}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={step.enabled !== false}
                          onChange={(e) => updateStepField(idx, 'enabled', e.target.checked)}
                        />
                        Enabled
                      </label>
                      <button
                        onClick={() => moveStep(idx, -1)}
                        className="p-2 border rounded-lg hover:bg-gray-50"
                        title="Move up"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => moveStep(idx, 1)}
                        className="p-2 border rounded-lg hover:bg-gray-50"
                        title="Move down"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <Settings2 className="w-4 h-4" />
                Labels & Headings
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {labelKeys.map((key) => (
                  <div key={key}>
                    <label className="text-xs font-semibold text-gray-500">{key}</label>
                    <input
                      className="w-full border rounded-lg p-2"
                      value={activeConfig?.labels?.[key] || ''}
                      onChange={(e) => updateLabelField(key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <Settings2 className="w-4 h-4" />
                Feature Toggles
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {controlKeys.map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={activeConfig?.controls?.[key] !== false}
                      onChange={(e) => updateControlField(key, e.target.checked)}
                    />
                    {CONTROL_LABELS[key] || key}
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-white border rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <Settings2 className="w-4 h-4" />
                Custom Blocks & Fields
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold text-gray-500">Step</label>
                <select
                  className="border rounded-lg p-2 text-sm bg-white"
                  value={activeStepId}
                  onChange={(e) => setActiveStepId(e.target.value)}
                >
                  {stepOptions.map((step: any) => (
                    <option key={step.id} value={step.id}>{step.label || step.id}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800">Custom Blocks</h4>
                  <button
                    onClick={addBlock}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Add Block
                  </button>
                </div>
                {currentBlocks.length === 0 && (
                  <div className="text-xs text-gray-500">No custom blocks for this step.</div>
                )}
                {currentBlocks.map((block: any, idx: number) => (
                  <div key={block.id || idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="border rounded-lg p-2 text-xs bg-white"
                        value={block.type || 'text'}
                        onChange={(e) => updateBlockField(idx, 'type', e.target.value)}
                      >
                        <option value="text">Text</option>
                        <option value="heading">Heading</option>
                        <option value="note">Note</option>
                        <option value="divider">Divider</option>
                        <option value="spacer">Spacer</option>
                        <option value="html">HTML</option>
                      </select>
                      {block.type === 'note' && (
                        <select
                          className="border rounded-lg p-2 text-xs bg-white"
                          value={block.tone || 'info'}
                          onChange={(e) => updateBlockField(idx, 'tone', e.target.value)}
                        >
                          <option value="info">Info</option>
                          <option value="success">Success</option>
                          <option value="warning">Warning</option>
                          <option value="danger">Danger</option>
                        </select>
                      )}
                      {block.type === 'spacer' && (
                        <input
                          type="number"
                          className="border rounded-lg p-2 text-xs w-24"
                          value={block.height ?? 16}
                          onChange={(e) => updateBlockField(idx, 'height', Number(e.target.value || 0))}
                          placeholder="Height"
                        />
                      )}
                      <button
                        onClick={() => moveBlock(idx, -1)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                        title="Move up"
                      >
                        Up
                      </button>
                      <button
                        onClick={() => moveBlock(idx, 1)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                        title="Move down"
                      >
                        Down
                      </button>
                      <button
                        onClick={() => removeBlock(idx)}
                        className="text-xs text-red-600 hover:underline ml-auto"
                      >
                        Remove
                      </button>
                    </div>
                    {block.type !== 'divider' && block.type !== 'spacer' && (
                      <textarea
                        className="w-full border rounded-lg p-2 text-xs"
                        rows={block.type === 'heading' ? 2 : 4}
                        value={block.content || ''}
                        onChange={(e) => updateBlockField(idx, 'content', e.target.value)}
                        placeholder="Block content"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-800">Custom Fields</h4>
                  <button
                    onClick={addField}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Add Field
                  </button>
                </div>
                {currentFields.length === 0 && (
                  <div className="text-xs text-gray-500">No custom fields for this step.</div>
                )}
                {currentFields.map((field: any, idx: number) => (
                  <div key={field.id || idx} className="border rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        className="border rounded-lg p-2 text-xs"
                        value={field.key || ''}
                        placeholder="Field key"
                        onChange={(e) => updateField(idx, 'key', e.target.value)}
                      />
                      <input
                        className="border rounded-lg p-2 text-xs"
                        value={field.label || ''}
                        placeholder="Label"
                        onChange={(e) => updateField(idx, 'label', e.target.value)}
                      />
                      <select
                        className="border rounded-lg p-2 text-xs bg-white"
                        value={field.type || 'text'}
                        onChange={(e) => updateField(idx, 'type', e.target.value)}
                      >
                        <option value="text">Text</option>
                        <option value="textarea">Textarea</option>
                        <option value="number">Number</option>
                        <option value="select">Select</option>
                        <option value="checkbox">Checkbox</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        className="border rounded-lg p-2 text-xs"
                        value={field.placeholder || ''}
                        placeholder="Placeholder"
                        onChange={(e) => updateField(idx, 'placeholder', e.target.value)}
                      />
                      {field.type === 'select' && (
                        <input
                          className="border rounded-lg p-2 text-xs"
                          value={Array.isArray(field.options) ? field.options.map((o: any) => o?.label ?? o?.value ?? o).join(', ') : ''}
                          placeholder="Options (comma separated)"
                          onChange={(e) => {
                            const options = e.target.value
                              .split(',')
                              .map((opt) => opt.trim())
                              .filter(Boolean);
                            updateField(idx, 'options', options);
                          }}
                        />
                      )}
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={field.required === true}
                          onChange={(e) => updateField(idx, 'required', e.target.checked)}
                        />
                        Required
                      </label>
                    </div>
                    <button
                      onClick={() => removeField(idx)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove Field
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white border rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <FileJson className="w-4 h-4" />
                Advanced JSON
              </div>
              <textarea
                className="w-full min-h-[300px] border rounded-lg p-3 text-xs font-mono"
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
              />
              <button
                onClick={handleApplyJson}
                className="w-full px-4 py-2 rounded-xl border text-sm font-semibold hover:bg-gray-50"
              >
                Apply JSON
              </button>
            </div>
            <div className="bg-gray-50 border border-dashed rounded-2xl p-4 text-xs text-gray-500">
              Use the JSON editor to add additional keys or custom fields. The Create Gig/Job forms will ignore unknown keys.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormBuilder;
