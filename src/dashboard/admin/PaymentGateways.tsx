
import React, { useState, useEffect, useMemo } from 'react';
import { PaymentGateway, UploadedFile } from '../../types';
import { PaymentService } from '../../services/payment';
import { useNotification } from '../../context/NotificationContext';
import FilePickerModal from '../shared/FilePickerModal';
import { X, Save } from 'lucide-react';

const normalizeGateway = (gw: any) => ({
    ...gw,
    id: gw?.id,
    name: gw?.name || gw?.id,
    logo: gw?.logo,
    mode: gw?.mode || 'test',
    isEnabled: Boolean(gw?.isEnabled ?? gw?.is_enabled),
    config: gw?.config || {},
    supportedCurrencies: Array.isArray(gw?.supportedCurrencies)
        ? gw.supportedCurrencies
        : Array.isArray(gw?.supported_currencies)
            ? gw.supported_currencies
            : []
});

const GatewaysTab = () => {
    const [gateways, setGateways] = useState<PaymentGateway[]>([]);
    const { showNotification } = useNotification();
    const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
    const [configDraft, setConfigDraft] = useState<Record<string, any>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);

    useEffect(() => {
        PaymentService.getGateways()
            .then((data) => setGateways((data || []).map(normalizeGateway)))
            .catch(() => {
                showNotification('error', 'Load Failed', 'Unable to load payment gateways.');
                setGateways([]);
            });
    }, []);

    const toggleGateway = async (gw: PaymentGateway) => {
        const r = gw as unknown as Record<string, any>;
        const enabled = !(r.isEnabled ?? r.is_enabled ?? false);
        const updated: PaymentGateway = {
            ...gw,
            isEnabled: enabled,
            is_enabled: enabled,
            supportedCurrencies: r.supportedCurrencies ?? r.supported_currencies ?? [],
            supported_currencies: r.supportedCurrencies ?? r.supported_currencies ?? [],
            config: gw.config || {}
        } as PaymentGateway;
        try {
            await PaymentService.updateGateway(updated);
            setGateways(prev => prev.map(g => g.id === gw.id ? updated : g));
            showNotification('success', 'Gateway Updated', `${r.name ?? gw.name} is now ${updated.isEnabled ? 'Active' : 'Disabled'}`);
        } catch (e: any) {
            showNotification('error', 'Update Failed', e?.message || 'Unable to update gateway.');
        }
    };

    const openConfigure = (gw: PaymentGateway) => {
        setSelectedGateway(gw);
        const baseDraft = { ...(gw.config || {}), logo: gw.logo || gw.config?.logo } as Record<string, any>;
        if (gw.id === 'stripe' && !baseDraft.environment) {
            baseDraft.environment = gw.mode === 'live' ? 'live' : 'sandbox';
        }
        setConfigDraft(baseDraft);
    };

    const closeConfigure = () => {
        setSelectedGateway(null);
        setConfigDraft({});
    };

    const handleSaveConfig = async () => {
        if (!selectedGateway) return;
        setIsSaving(true);
        try {
            const payload: PaymentGateway = {
                ...selectedGateway,
                isEnabled: (selectedGateway as any).isEnabled ?? (selectedGateway as any).is_enabled ?? false,
                config: {
                    ...(selectedGateway.config || {}),
                    ...configDraft
                }
            } as PaymentGateway;

            await PaymentService.updateGateway(payload);
            showNotification('success', 'Saved', `${selectedGateway.name} settings updated.`);
            const fresh = await PaymentService.getGateways();
            setGateways((fresh || []).map(normalizeGateway));
            closeConfigure();
        } catch (e: any) {
            showNotification('error', 'Save Failed', e?.message || 'Unable to save gateway settings.');
        } finally {
            setIsSaving(false);
        }
    };

    const fieldConfig: Record<string, { key: string; label: string; type?: string; placeholder?: string; options?: string[]; help?: string; secret?: boolean; asBoolean?: boolean }[]> = {
        stripe: [
            { key: 'publishableKey', label: 'Publishable Key', placeholder: 'pk_live_...' },
            { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'sk_live_...', secret: true },
            { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', placeholder: 'whsec_...', secret: true },
            { key: 'environment', label: 'Environment', type: 'select', options: ['sandbox', 'live'] },
            { key: 'connectEnabled', label: 'Enable Stripe Connect Payouts', type: 'select', options: ['true', 'false'], asBoolean: true },
            { key: 'connectType', label: 'Connect Account Type', type: 'select', options: ['express', 'standard'] }
        ],
        paypal: [
            { key: 'clientId', label: 'Client ID', placeholder: 'PayPal Client ID' },
            { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'PayPal Secret', secret: true },
            { key: 'environment', label: 'Environment', type: 'select', options: ['sandbox', 'live'] }
        ],
        paystack: [{ key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'sk_live_...', secret: true }],
        flutterwave: [{ key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'FLWSECK_...', secret: true }],
        paymongo: [{ key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'sk_live_...', secret: true }],
        xendit: [
            { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'xnd_development_...', secret: true },
            { key: 'callbackToken', label: 'Callback Token', type: 'password', placeholder: 'Callback token', secret: true }
        ],
        monnify: [
            { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'API Key', secret: true },
            { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'Secret Key', secret: true },
            { key: 'contractCode', label: 'Contract Code', placeholder: 'Contract code' }
        ],
        opay: [
            { key: 'merchantId', label: 'Merchant ID', placeholder: 'Merchant ID' },
            { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'Secret Key', secret: true },
            { key: 'environment', label: 'Environment', type: 'select', options: ['sandbox', 'live'] }
        ],
        dragonpay: [
            { key: 'merchantId', label: 'Merchant ID', placeholder: 'Merchant ID' },
            { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'Secret Key', secret: true }
        ],
        payoneer: [
            { key: 'clientId', label: 'Client ID', placeholder: 'Client ID' },
            { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Client Secret', secret: true },
            { key: 'programId', label: 'Program ID', placeholder: 'Program ID' },
            { key: 'apiBaseUrl', label: 'API Base URL', placeholder: 'https://api.sandbox.payoneer.com' },
            { key: 'authToken', label: 'Auth Token', type: 'password', placeholder: 'Bearer token', secret: true },
            { key: 'notificationSecret', label: 'Notification Secret', type: 'password', placeholder: 'Notification secret', secret: true },
            { key: 'createSessionPath', label: 'Create Session Path', placeholder: '/checkout/hosted/session' }
        ]
    };

    const resolveFieldValue = (key: string) => configDraft[key] ?? '';
    const updateField = (key: string, value: any) => setConfigDraft(prev => ({ ...prev, [key]: value }));

    const hasSecretSaved = (key: string) => {
        const camel = `has${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        return Boolean(configDraft[`has_${key}`] ?? configDraft[camel]);
    };

    const normalizedGateways = useMemo(() => gateways.map(normalizeGateway), [gateways]);

    const modeSummary = useMemo(() => {
        const enabledGateways = normalizedGateways.filter((g) => Boolean(g.isEnabled));
        const enabledCount = enabledGateways.length;
        const liveCount = enabledGateways.filter((g) => g.mode === 'live').length;
        const testCount = enabledGateways.filter((g) => g.mode !== 'live').length;

        if (!enabledCount) {
            return {
                title: 'No Active Gateways',
                description: 'Enable at least one payment gateway to process live transactions.',
                toneClass: 'border-slate-200 bg-slate-50 text-slate-700',
                enabledCount,
                liveCount,
                testCount
            };
        }

        if (testCount === 0) {
            return {
                title: 'Live Mode Enabled',
                description: 'All active payment gateways are currently running in live mode.',
                toneClass: 'border-emerald-200 bg-emerald-50 text-emerald-800',
                enabledCount,
                liveCount,
                testCount
            };
        }

        return {
            title: 'Live Mode Not Fully Enabled',
            description: `${testCount} active gateway${testCount > 1 ? 's are' : ' is'} still in test mode.`,
            toneClass: 'border-amber-200 bg-amber-50 text-amber-800',
            enabledCount,
            liveCount,
            testCount
        };
    }, [normalizedGateways]);

    return (
        <div className="space-y-4">
            <div className={`rounded-xl border px-4 py-3 ${modeSummary.toneClass}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide">Gateway Runtime Mode (Read-only)</p>
                        <p className="text-sm font-semibold">{modeSummary.title}</p>
                        <p className="text-xs mt-1">{modeSummary.description}</p>
                    </div>
                    <div className="text-right text-xs font-medium">
                        <p>Active: {modeSummary.enabledCount}</p>
                        <p>{modeSummary.liveCount} live • {modeSummary.testCount} test</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {normalizedGateways.map((gw) => {
                return (
                <div key={gw.id} className={`bg-white rounded-xl shadow-sm border p-6 ${gw.isEnabled ? 'border-green-200 ring-1 ring-green-100' : 'border-gray-200'}`}>
                    <div className="flex justify-between items-start mb-4">
                    {gw.logo ? (
                        <img src={gw.logo} alt={gw.name} className="h-8 object-contain" />
                    ) : (
                        <div className="h-8 w-20 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400">
                            No Logo
                        </div>
                    )}
                        <button onClick={() => toggleGateway(gw)} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${gw.isEnabled ? 'bg-green-600' : 'bg-gray-200'}`}>
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${gw.isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1">{gw.name}</h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {gw.supportedCurrencies.map(c => <span key={c} className="text-xs bg-gray-100 px-2 py-1 rounded">{c}</span>)}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center text-sm">
                        {gw.mode === 'live' ? (
                            <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">LIVE</span>
                        ) : (
                            <span />
                        )}
                        <button onClick={() => openConfigure(gw)} className="text-blue-600 hover:text-blue-800 font-medium">Configure</button>
                    </div>
                </div>
            );
            })}
            </div>

            {selectedGateway && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between p-5 border-b">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Configure {selectedGateway.name}</h3>
                                <p className="text-xs text-gray-500">Update API keys, logo, and environment.</p>
                            </div>
                            <button onClick={closeConfigure} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-5">
                            <div className="flex items-center gap-4">
                                <div className="w-24 h-16 border rounded-lg flex items-center justify-center overflow-hidden bg-gray-50">
                                    {configDraft.logo || selectedGateway.logo ? (
                                        <img src={configDraft.logo || selectedGateway.logo} alt="Gateway logo" className="h-10 object-contain" />
                                    ) : (
                                        <span className="text-xs text-gray-400">No logo</span>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => setIsFilePickerOpen(true)}
                                        className="px-3 py-2 text-xs font-bold border rounded-lg text-gray-600 hover:bg-gray-50"
                                    >
                                        Upload Logo
                                    </button>
                                    <p className="text-[11px] text-gray-500">Select a logo from Uploaded Files.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(fieldConfig[selectedGateway.id] || []).map((field) => {
                                    const value = resolveFieldValue(field.key);
                                    const isSelect = field.type === 'select';
                                    const secretSaved = field.secret && hasSecretSaved(field.key);
                                    return (
                                        <div key={field.key}>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                                                {field.label}
                                            </label>
                                            {isSelect ? (
                                                (() => {
                                                    const selectValue =
                                                        value === true ? 'true' : value === false ? 'false' : String(value || field.options?.[0] || '');
                                                    return (
                                                <select
                                                    className="w-full border rounded-lg p-2.5"
                                                    value={selectValue}
                                                    onChange={(e) => {
                                                        const nextValue = field.asBoolean ? e.target.value === 'true' : e.target.value;
                                                        updateField(field.key, nextValue as any);
                                                    }}
                                                >
                                                    {(field.options || []).map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                                    );
                                                })()
                                            ) : (
                                                <input
                                                    type={field.type || 'text'}
                                                    className="w-full border rounded-lg p-2.5"
                                                    placeholder={secretSaved ? 'Saved (enter to replace)' : field.placeholder}
                                                    value={value}
                                                    onChange={(e) => updateField(field.key, e.target.value)}
                                                />
                                            )}
                                            {secretSaved && (
                                                <p className="text-[11px] text-gray-400 mt-1">Saved in vault. Leave blank to keep.</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-5 border-t bg-gray-50">
                            <button onClick={closeConfigure} className="px-4 py-2 text-sm font-bold border rounded-lg text-gray-600 hover:bg-white">Cancel</button>
                            <button
                                onClick={handleSaveConfig}
                                disabled={isSaving}
                                className="px-4 py-2 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-70 inline-flex items-center"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                {isSaving ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <FilePickerModal
                open={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelect={(file: UploadedFile) => {
                    setConfigDraft(prev => ({ ...prev, logo: file.url || '' }));
                    setIsFilePickerOpen(false);
                }}
                filterType="image"
                acceptedTypes={['image']}
                title="Select Gateway Logo"
                role="admin"
                visibility="public"
            />
        </div>
    );
};

export default GatewaysTab;
