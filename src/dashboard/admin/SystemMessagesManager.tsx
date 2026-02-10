import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Save, Mail, Bell, Smartphone } from 'lucide-react';
import { CMSService } from '../../services/cms';
import { SystemMessagesConfig, SystemMessageTemplate, SystemMessagesVariables } from '../../types';
import { useNotification } from '../../context/NotificationContext';

const channelMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  email: { label: 'Email', icon: Mail },
  notification: { label: 'In-App', icon: Bell },
  push: { label: 'Push', icon: Smartphone }
};

type ChannelKey = 'email' | 'notification' | 'push';

const SystemMessagesManager = ({ setView }: { setView: (view: any) => void }) => {
  const { showNotification } = useNotification();
  const [config, setConfig] = useState<SystemMessagesConfig | null>(null);
  const [variables, setVariables] = useState<SystemMessagesVariables>({});
  const [activeKey, setActiveKey] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const response = await CMSService.getSystemMessagesConfig();
      setConfig(response.config);
      setVariables(response.variables || {});
      const firstKey = response.config && Object.keys(response.config.templates)[0];
      setActiveKey((current) => current || firstKey || '');
    } catch (error) {
      showNotification('alert', 'Error', 'Failed to load system messages config.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const activeTemplate: SystemMessageTemplate | null = useMemo(() => {
    if (!config || !activeKey) return null;
    return config.templates[activeKey] || null;
  }, [config, activeKey]);

  const availableVariables = variables[activeKey] || [];

  const updateTemplate = (updates: Partial<SystemMessageTemplate>) => {
    if (!config || !activeTemplate) return;
    const nextTemplate: SystemMessageTemplate = {
      ...activeTemplate,
      ...updates,
      email: { ...activeTemplate.email, ...(updates.email || {}) },
      notification: { ...activeTemplate.notification, ...(updates.notification || {}) },
      push: { ...activeTemplate.push, ...(updates.push || {}) }
    };
    setConfig({
      ...config,
      templates: {
        ...config.templates,
        [activeKey]: nextTemplate
      }
    });
  };

  const updateChannelField = (channel: ChannelKey, field: string, value: string) => {
    if (!activeTemplate) return;
    updateTemplate({
      [channel]: { ...(activeTemplate as any)[channel], [field]: value }
    } as Partial<SystemMessageTemplate>);
  };

  const toggleChannel = (channel: ChannelKey, enabled: boolean) => {
    if (!activeTemplate) return;
    updateTemplate({
      [channel]: { ...(activeTemplate as any)[channel], enabled }
    } as Partial<SystemMessageTemplate>);
  };

  const appendVariable = (channel: ChannelKey, field: string, variable: string) => {
    if (!activeTemplate) return;
    const currentValue = String((activeTemplate as any)[channel]?.[field] || '');
    const suffix = currentValue && !currentValue.endsWith(' ') ? ' ' : '';
    updateChannelField(channel, field, `${currentValue}${suffix}{{${variable}}}`);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const saved = await CMSService.saveSystemMessagesConfig({ ...config, updated_at: new Date().toISOString() });
      setConfig(saved.config);
      setVariables(saved.variables || variables);
      showNotification('success', 'Saved', 'System messages updated.');
    } catch (error: any) {
      const message = error?.message || 'Failed to save system messages.';
      showNotification('alert', 'Error', message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="text-gray-500">Loading system messages...</div>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in space-y-6">
      <div className="flex justify-between items-center border-b pb-4">
        <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-900 flex items-center">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pages
        </button>
        <h2 className="text-xl font-bold">System Messages & Emails</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 shadow-sm disabled:opacity-60"
        >
          <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Message Types</h3>
          <div className="space-y-2">
            {Object.values(config.templates).map((template) => (
              <button
                key={template.key}
                onClick={() => setActiveKey(template.key)}
                className={`w-full text-left p-3 rounded-lg border flex items-center justify-between transition ${
                  activeKey === template.key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div>
                  <div className="text-sm font-semibold text-gray-900">{template.label}</div>
                  <div className="text-xs text-gray-500">{template.key}</div>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${template.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                  {template.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-6">
          {activeTemplate ? (
            <>
              <div className="flex flex-col gap-3 border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{activeTemplate.label}</h3>
                    <p className="text-xs text-gray-500">Template key: {activeTemplate.key}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={activeTemplate.enabled}
                      onChange={(e) => updateTemplate({ enabled: e.target.checked })}
                    />
                    Enable template
                  </label>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-2">Variables</p>
                  <div className="flex flex-wrap gap-2">
                    {availableVariables.map((variable) => (
                      <span key={variable} className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                        {`{{${variable}}}`}
                      </span>
                    ))}
                    {availableVariables.length === 0 && (
                      <span className="text-xs text-gray-400">No variables defined for this template.</span>
                    )}
                  </div>
                </div>
              </div>

              {(['email', 'notification', 'push'] as ChannelKey[]).map((channel) => {
                const ChannelIcon = channelMeta[channel].icon;
                const channelData = (activeTemplate as any)[channel] || {};
                return (
                  <div key={channel} className="border border-gray-200 rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ChannelIcon className="w-4 h-4 text-gray-500" />
                        <h4 className="font-semibold text-gray-900">{channelMeta[channel].label}</h4>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(channelData.enabled)}
                          onChange={(e) => toggleChannel(channel, e.target.checked)}
                        />
                        Enable {channelMeta[channel].label.toLowerCase()}
                      </label>
                    </div>

                    {channel === 'email' && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                          <input
                            className="w-full border-gray-300 rounded-lg p-2.5"
                            value={channelData.subject || ''}
                            onChange={(e) => updateChannelField(channel, 'subject', e.target.value)}
                          />
                          <div className="flex flex-wrap gap-2 mt-2">
                            {availableVariables.map((variable) => (
                              <button
                                type="button"
                                key={`${channel}-subject-${variable}`}
                                onClick={() => appendVariable(channel, 'subject', variable)}
                                className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50"
                              >
                                {`{{${variable}}}`}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">HTML Body</label>
                          <textarea
                            className="w-full border-gray-300 rounded-lg p-2.5 h-48 font-mono text-xs"
                            value={channelData.html || ''}
                            onChange={(e) => updateChannelField(channel, 'html', e.target.value)}
                          />
                          <div className="flex flex-wrap gap-2 mt-2">
                            {availableVariables.map((variable) => (
                              <button
                                type="button"
                                key={`${channel}-html-${variable}`}
                                onClick={() => appendVariable(channel, 'html', variable)}
                                className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50"
                              >
                                {`{{${variable}}}`}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Plain Text</label>
                          <textarea
                            className="w-full border-gray-300 rounded-lg p-2.5 h-32 font-mono text-xs"
                            value={channelData.text || ''}
                            onChange={(e) => updateChannelField(channel, 'text', e.target.value)}
                          />
                          <div className="flex flex-wrap gap-2 mt-2">
                            {availableVariables.map((variable) => (
                              <button
                                type="button"
                                key={`${channel}-text-${variable}`}
                                onClick={() => appendVariable(channel, 'text', variable)}
                                className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50"
                              >
                                {`{{${variable}}}`}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {channel !== 'email' && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                          <input
                            className="w-full border-gray-300 rounded-lg p-2.5"
                            value={channelData.title || ''}
                            onChange={(e) => updateChannelField(channel, 'title', e.target.value)}
                          />
                          <div className="flex flex-wrap gap-2 mt-2">
                            {availableVariables.map((variable) => (
                              <button
                                type="button"
                                key={`${channel}-title-${variable}`}
                                onClick={() => appendVariable(channel, 'title', variable)}
                                className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50"
                              >
                                {`{{${variable}}}`}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Message</label>
                          <textarea
                            className="w-full border-gray-300 rounded-lg p-2.5 h-28"
                            value={channelData.message || ''}
                            onChange={(e) => updateChannelField(channel, 'message', e.target.value)}
                          />
                          <div className="flex flex-wrap gap-2 mt-2">
                            {availableVariables.map((variable) => (
                              <button
                                type="button"
                                key={`${channel}-message-${variable}`}
                                onClick={() => appendVariable(channel, 'message', variable)}
                                className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50"
                              >
                                {`{{${variable}}}`}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <div className="text-gray-500">Select a template to edit.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemMessagesManager;
