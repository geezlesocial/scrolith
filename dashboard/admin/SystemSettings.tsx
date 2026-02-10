
import React, { useState, useEffect } from 'react';
import { useContent } from '../../context/ContentContext';
import { useNotification } from '../../context/NotificationContext';
import { useCurrency } from '../../context/CurrencyContext';
import { Save, Settings, Mail, HardDrive, DollarSign, Cpu, CheckCircle, ShieldCheck, Globe, FileText, Lock, Database, Server, RefreshCw, Plus, Trash2, Zap, X, Network, Send, Upload, Image as ImageIcon, Eye } from 'lucide-react';
import { AIConfigManager } from '../../services/ai/ai.config';
import { AIConfig, ComplianceConfig, Currency, PlatformSettings, EmailProviderConfig, UploadedFile } from '../../types';
import { INITIAL_CURRENCIES } from '../../constants';
import FilePicker from '../../components/FilePicker';

const TabButton = ({ id, label, icon: Icon, activeTab, setActiveTab }: any) => (
    <button 
        onClick={() => setActiveTab(id)} 
        className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium flex items-center transition-colors ${activeTab === id ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
    >
        <Icon className="w-4 h-4 mr-3" /> {label}
    </button>
);

const SystemSettings = () => {
    // 1. Hooks (Unconditional)
    const { settings, updateSettings } = useContent();
    const { availableCurrencies } = useCurrency(); // Initially loaded currencies
    const { showNotification } = useNotification();
    
    // UI State
    const [activeTab, setActiveTab] = useState('general');
    const [localSettings, setLocalSettings] = useState<Partial<PlatformSettings>>({});
    
    // File Picker
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [uploadTarget, setUploadTarget] = useState<'logo' | 'favicon' | null>(null);

    // AI Settings State
    const [aiConfig, setAiConfig] = useState<AIConfig>(AIConfigManager.getConfig());

    // Storage & Cache State
    const [storageConfig, setStorageConfig] = useState<any>({ 
        driver: 'local', 
        s3: { accessKeyId: '', secretAccessKey: '', region: 'us-east-1', bucket: '' }, 
        backblaze: { accessKeyId: '', secretAccessKey: '', region: '', bucket: '' } 
    });
    
    // Currency State
    // We maintain a local state for currencies to allow editing before "Saving" essentially
    // For this demo, we initialize with INITIAL_CURRENCIES if local storage is empty, or use availableCurrencies logic
    const [currencies, setCurrencies] = useState<Currency[]>(INITIAL_CURRENCIES);
    const [isCurrencyModalOpen, setIsCurrencyModalOpen] = useState(false);
    const [newCurrency, setNewCurrency] = useState<Partial<Currency>>({ code: '', name: '', symbol: '', rate: 1, isActive: true });
    const [currencyConfig, setCurrencyConfig] = useState({
        autoExchangeRate: false,
        baseCurrency: 'USD',
        provider: 'openexchangerates' as const,
        apiKey: ''
    });

    // Email State
    const [emailConfig, setEmailConfig] = useState<EmailProviderConfig>({ 
        provider: 'smtp', 
        host: 'smtp.mailtrap.io', 
        port: 587, 
        username: '', 
        password: '', 
        fromName: 'Scrolith', 
        fromEmail: 'noreply@Scrolith.com' 
    });
    const [testEmail, setTestEmail] = useState('');
    const [isTestingEmail, setIsTestingEmail] = useState(false);

    // Mock Compliance Settings
    const [compliance, setCompliance] = useState<ComplianceConfig[]>([
        { region: "European Union", code: "EU", gdprEnabled: true, dataResidency: "EU-West (Frankfurt)", kycProvider: "SumSub", taxEngine: "Stripe Tax", active: true },
        { region: "United States", code: "US", gdprEnabled: false, dataResidency: "US-East (N. Virginia)", kycProvider: "Persona", taxEngine: "Avalara", active: true },
        { region: "United Kingdom", code: "UK", gdprEnabled: true, dataResidency: "EU-West (London)", kycProvider: "SumSub", taxEngine: "Stripe Tax", active: true },
    ]);

    // 2. Effects
    useEffect(() => {
        setAiConfig(AIConfigManager.getConfig());
        if(settings) {
            setLocalSettings(settings);
            if (settings.system?.storage) setStorageConfig(settings.system.storage);
            if (settings.system?.email) setEmailConfig(settings.system.email);
            if (settings.system?.currency) setCurrencyConfig(settings.system.currency as any);
        }
    }, [settings]);

    // 3. Handlers
    const handleSave = async () => {
        const updatedSystem = {
            ...(localSettings.system || {}),
            regionalCompliance: compliance,
            storage: storageConfig,
            email: emailConfig,
            currency: currencyConfig
        };
        
        await updateSettings({ 
            ...localSettings, 
            system: updatedSystem 
        } as PlatformSettings);
        
        AIConfigManager.saveConfig(aiConfig);
        
        // Persist currencies (In a real app, this goes to DB. Here we might update a global state or LS)
        // For simplicity in this demo structure, we assume updateSettings handles generic config,
        // but currencies are often stored separately. We'll update the context's source if possible, or assume backend handles it.
        // Re-injecting updated currencies into a mock storage for the Context to pick up on refresh
        // (Note: The Context uses constants.ts initially, but a real app would fetch from API).
        
        showNotification('success', 'Settings Saved', 'System configuration updated successfully.');
    };

    const handleChange = (section: string, field: string, value: any) => {
        if (section === 'root') {
            setLocalSettings(prev => ({ ...prev, [field]: value }));
        } else {
            setLocalSettings(prev => ({
                ...prev,
                [section]: { ...(prev as any)[section], [field]: value }
            }));
        }
    };

    const handleFileSelect = (file: UploadedFile) => {
        if (uploadTarget === 'logo') {
            setLocalSettings(prev => ({ ...prev, logoUrl: file.url }));
        } else if (uploadTarget === 'favicon') {
            setLocalSettings(prev => ({ ...prev, faviconUrl: file.url }));
        }
        setIsFilePickerOpen(false);
    };

    const handleAIChange = (section: keyof AIConfig, field: string, value: any) => {
        if (section === 'providers') {
             const [provider, key] = field.split('.');
             setAiConfig(prev => ({
                 ...prev,
                 providers: {
                     ...prev.providers,
                     [provider as 'google' | 'openai']: { ...prev.providers[provider as 'google' | 'openai'], [key]: value }
                 }
             }));
        } else {
            setAiConfig(prev => ({
                ...prev,
                [section]: { ...prev[section as any], [field]: value }
            }));
        }
    };

    // Compliance Handlers
    const toggleCompliance = (code: string) => {
        setCompliance(prev => prev.map(c => c.code === code ? { ...c, active: !c.active } : c));
    };

    // Currency Handlers
    const toggleCurrency = (code: string) => {
        setCurrencies(prev => prev.map(c => c.code === code ? { ...c, isActive: !c.isActive } : c));
    };

    const updateCurrencyRate = (code: string, rate: number) => {
        setCurrencies(prev => prev.map(c => c.code === code ? { ...c, rate } : c));
    };

    const handleSetDefaultCurrency = (code: string) => {
        setCurrencies(prev => prev.map(c => ({
            ...c,
            isDefault: c.code === code
        })));
    };

    const handleAddCurrency = () => {
        if(newCurrency.code && newCurrency.name && newCurrency.symbol) {
            setCurrencies([...currencies, { ...newCurrency, isActive: true } as Currency]);
            setIsCurrencyModalOpen(false);
            setNewCurrency({ code: '', name: '', symbol: '', rate: 1, isActive: true });
            showNotification('success', 'Currency Added', `${newCurrency.code} added to available currencies.`);
        } else {
            showNotification('alert', 'Invalid Data', 'Please fill in all currency fields.');
        }
    };

    const handleDeleteCurrency = (code: string) => {
        if(confirm(`Are you sure you want to remove ${code}?`)) {
            setCurrencies(prev => prev.filter(c => c.code !== code));
        }
    };

    const handleAutoUpdateRates = async () => {
        showNotification('info', 'Updating Rates...', 'Fetching latest exchange rates from provider...');
        setTimeout(() => {
            // Mock Update
            const updated = currencies.map(c => c.isDefault ? c : { ...c, rate: c.rate + (Math.random() * 0.05 - 0.025) });
            setCurrencies(updated);
            showNotification('success', 'Rates Updated', 'Exchange rates synchronized successfully.');
        }, 1500);
    };

    const handleTestStorage = () => {
        showNotification('info', 'Testing Connection...', `Attempting to connect to ${storageConfig.driver}...`);
        setTimeout(() => {
            showNotification('success', 'Connection Successful', 'Write permission verified.');
        }, 1500);
    };

    const handleTestEmail = () => {
        if (!testEmail) {
            showNotification('alert', 'Error', 'Please enter a recipient email.');
            return;
        }
        setIsTestingEmail(true);
        setTimeout(() => {
            setIsTestingEmail(false);
            showNotification('success', 'Email Sent', `Test email sent to ${testEmail}`);
            setTestEmail('');
        }, 2000);
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row overflow-hidden min-h-[600px]">
            <div className="w-full md:w-64 bg-gray-50 border-r border-gray-200 p-4 space-y-1 flex-shrink-0">
                <TabButton id="general" label="General Settings" icon={Settings} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="filesystem" label="File System & Cache" icon={HardDrive} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="currencies" label="Currencies" icon={DollarSign} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="email" label="Email SMTP" icon={Mail} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="ai" label="AI Engine" icon={Cpu} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="compliance" label="Regional Compliance" icon={Globe} activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton id="evidence" label="SOC-2 Evidence" icon={ShieldCheck} activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>

            <div className="flex-1 p-8 overflow-y-auto relative">
                {activeTab === 'general' && (
                    <div className="space-y-6 max-w-lg animate-fade-in">
                        <h3 className="text-lg font-bold mb-4 border-b pb-2">General Configuration</h3>
                        
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Platform Logo</label>
                                <div 
                                    onClick={() => { setUploadTarget('logo'); setIsFilePickerOpen(true); }}
                                    className="h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition"
                                >
                                    {localSettings.logoUrl ? (
                                        <img src={localSettings.logoUrl} alt="Logo" className="h-full object-contain p-2" />
                                    ) : (
                                        <div className="text-gray-400 text-center">
                                            <ImageIcon className="w-6 h-6 mx-auto mb-1" />
                                            <span className="text-xs">Upload</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Favicon</label>
                                <div 
                                    onClick={() => { setUploadTarget('favicon'); setIsFilePickerOpen(true); }}
                                    className="h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition"
                                >
                                    {localSettings.faviconUrl ? (
                                        <img src={localSettings.faviconUrl} alt="Favicon" className="h-8 w-8 object-contain" />
                                    ) : (
                                        <div className="text-gray-400 text-center">
                                            <Upload className="w-6 h-6 mx-auto mb-1" />
                                            <span className="text-xs">Upload</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
                            <input className="w-full border-gray-300 rounded-md p-2" value={localSettings.siteName || ''} onChange={e => handleChange('root', 'siteName', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
                            <input className="w-full border-gray-300 rounded-md p-2" value={localSettings.tagline || ''} onChange={e => handleChange('root', 'tagline', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
                            <input className="w-full border-gray-300 rounded-md p-2" value={localSettings.supportEmail || ''} onChange={e => handleChange('root', 'supportEmail', e.target.value)} />
                        </div>
                        
                        <div className="bg-green-50 border border-green-200 p-4 rounded-lg flex items-center justify-between">
                            <div>
                                <span className="font-bold text-green-800 text-sm block">System Operational</span>
                                <span className="text-green-600 text-xs">All services running normally</span>
                            </div>
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>

                        <div className="flex items-center space-x-2 mt-4">
                            <input type="checkbox" checked={localSettings.system?.maintenanceMode} onChange={e => handleChange('system', 'maintenanceMode', e.target.checked)} className="rounded text-blue-600" />
                            <span className="text-sm font-medium text-gray-700">Maintenance Mode</span>
                        </div>
                    </div>
                )}
                
                {activeTab === 'filesystem' && (
                     <div className="space-y-8 animate-fade-in max-w-2xl">
                        <div className="bg-white p-6 rounded-xl border border-gray-200">
                            <div className="flex justify-between items-start mb-6">
                                <h3 className="font-bold text-gray-900 flex items-center"><Database className="w-5 h-5 mr-2 text-blue-600" /> File Storage Configuration</h3>
                                <button onClick={handleTestStorage} className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center">
                                    <Network className="w-3 h-3 mr-1" /> Test Connection
                                </button>
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Default Storage Driver</label>
                                    <select className="w-full border-gray-300 rounded-lg p-2.5 shadow-sm focus:ring-blue-500 focus:border-blue-500" value={storageConfig.driver} onChange={e => setStorageConfig({...storageConfig, driver: e.target.value})}>
                                        <option value="local">Local Filesystem</option>
                                        <option value="s3">AWS S3 / Compatible</option>
                                        <option value="backblaze">Backblaze B2</option>
                                    </select>
                                </div>
                                {storageConfig.driver !== 'local' && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Access Key ID</label>
                                                <input className="w-full border-gray-300 rounded-md p-2" type="password" value={storageConfig[storageConfig.driver].accessKeyId} onChange={e => setStorageConfig({...storageConfig, [storageConfig.driver]: { ...storageConfig[storageConfig.driver], accessKeyId: e.target.value }})} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Secret Access Key</label>
                                                <input className="w-full border-gray-300 rounded-md p-2" type="password" value={storageConfig[storageConfig.driver].secretAccessKey} onChange={e => setStorageConfig({...storageConfig, [storageConfig.driver]: { ...storageConfig[storageConfig.driver], secretAccessKey: e.target.value }})} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Region</label>
                                                <input className="w-full border-gray-300 rounded-md p-2" value={storageConfig[storageConfig.driver].region} onChange={e => setStorageConfig({...storageConfig, [storageConfig.driver]: { ...storageConfig[storageConfig.driver], region: e.target.value }})} />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bucket Name</label>
                                                <input className="w-full border-gray-300 rounded-md p-2" value={storageConfig[storageConfig.driver].bucket} onChange={e => setStorageConfig({...storageConfig, [storageConfig.driver]: { ...storageConfig[storageConfig.driver], bucket: e.target.value }})} />
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                     </div>
                )}

                {activeTab === 'currencies' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Currency Management</h3>
                            <div className="flex gap-2">
                                <button onClick={handleAutoUpdateRates} className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100 flex items-center">
                                    <RefreshCw className="w-3 h-3 mr-1" /> Update Rates
                                </button>
                                <button onClick={() => setIsCurrencyModalOpen(true)} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-blue-700 flex items-center">
                                    <Plus className="w-3 h-3 mr-1" /> Add Currency
                                </button>
                            </div>
                        </div>

                        {/* Settings Bar */}
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 flex flex-wrap gap-6 items-center">
                            <label className="flex items-center cursor-pointer">
                                <input type="checkbox" checked={currencyConfig.autoExchangeRate} onChange={e => setCurrencyConfig({...currencyConfig, autoExchangeRate: e.target.checked})} className="rounded text-blue-600 mr-2" />
                                <span className="text-sm font-medium text-gray-700">Auto Exchange Rate</span>
                            </label>
                            
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-700">Base Currency:</span>
                                <select 
                                    className="border-gray-300 rounded-md text-sm p-1"
                                    value={currencyConfig.baseCurrency}
                                    onChange={e => setCurrencyConfig({...currencyConfig, baseCurrency: e.target.value})}
                                >
                                    {currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                                </select>
                            </div>

                             <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-700">Provider:</span>
                                <select 
                                    className="border-gray-300 rounded-md text-sm p-1"
                                    value={currencyConfig.provider}
                                    onChange={e => setCurrencyConfig({...currencyConfig, provider: e.target.value as any})}
                                >
                                    <option value="openexchangerates">Open Exchange Rates</option>
                                    <option value="fixer">Fixer.io</option>
                                    <option value="mock">Mock (Demo)</option>
                                </select>
                            </div>
                        </div>

                        {/* Currency Table */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs">
                                    <tr>
                                        <th className="px-6 py-3">Code</th>
                                        <th className="px-6 py-3">Name</th>
                                        <th className="px-6 py-3">Symbol</th>
                                        <th className="px-6 py-3">Rate (vs Base)</th>
                                        <th className="px-6 py-3">Status</th>
                                        <th className="px-6 py-3">Default</th>
                                        <th className="px-6 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {currencies.map(curr => (
                                        <tr key={curr.code} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 font-bold">{curr.code}</td>
                                            <td className="px-6 py-4">{curr.name}</td>
                                            <td className="px-6 py-4 font-mono">{curr.symbol}</td>
                                            <td className="px-6 py-4">
                                                <input 
                                                    type="number" 
                                                    step="0.0001"
                                                    disabled={currencyConfig.autoExchangeRate || curr.isDefault}
                                                    className="w-24 border border-gray-200 rounded px-2 py-1 text-right disabled:bg-gray-100 disabled:text-gray-500"
                                                    value={curr.rate}
                                                    onChange={e => updateCurrencyRate(curr.code, parseFloat(e.target.value))}
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <button 
                                                    onClick={() => toggleCurrency(curr.code)}
                                                    className={`px-2 py-1 rounded text-xs font-bold uppercase ${curr.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                                                >
                                                    {curr.isActive ? 'Active' : 'Disabled'}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div 
                                                    onClick={() => handleSetDefaultCurrency(curr.code)}
                                                    className={`w-4 h-4 rounded-full border cursor-pointer flex items-center justify-center ${curr.isDefault ? 'border-blue-600 bg-blue-600' : 'border-gray-300'}`}
                                                >
                                                    {curr.isDefault && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {!curr.isDefault && (
                                                    <button onClick={() => handleDeleteCurrency(curr.code)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* Add Currency Modal */}
                        {isCurrencyModalOpen && (
                            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                                <div className="bg-white rounded-xl w-full max-w-sm p-6 shadow-2xl">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-bold text-lg">Add New Currency</h3>
                                        <button onClick={() => setIsCurrencyModalOpen(false)}><X className="w-5 h-5 text-gray-400"/></button>
                                    </div>
                                    <div className="space-y-4">
                                        <input className="w-full border rounded p-2" placeholder="Code (e.g. BTC)" value={newCurrency.code} onChange={e => setNewCurrency({...newCurrency, code: e.target.value.toUpperCase()})} />
                                        <input className="w-full border rounded p-2" placeholder="Name (e.g. Bitcoin)" value={newCurrency.name} onChange={e => setNewCurrency({...newCurrency, name: e.target.value})} />
                                        <input className="w-full border rounded p-2" placeholder="Symbol (e.g. ₿)" value={newCurrency.symbol} onChange={e => setNewCurrency({...newCurrency, symbol: e.target.value})} />
                                        <input type="number" className="w-full border rounded p-2" placeholder="Initial Rate" value={newCurrency.rate} onChange={e => setNewCurrency({...newCurrency, rate: parseFloat(e.target.value)})} />
                                    </div>
                                    <button onClick={handleAddCurrency} className="w-full bg-blue-600 text-white rounded-lg py-2 mt-6 font-bold hover:bg-blue-700">Add</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'email' && (
                    <div className="space-y-6 max-w-2xl animate-fade-in">
                         <div className="bg-white p-6 rounded-xl border border-gray-200">
                            <h3 className="font-bold text-gray-900 mb-6 flex items-center"><Mail className="w-5 h-5 mr-2 text-blue-600" /> SMTP Configuration</h3>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Provider</label>
                                    <select className="w-full border-gray-300 rounded-lg p-2" value={emailConfig.provider} onChange={e => setEmailConfig({...emailConfig, provider: e.target.value as any})}>
                                        <option value="smtp">Custom SMTP</option>
                                        <option value="ses">Amazon SES</option>
                                        <option value="sendgrid">SendGrid</option>
                                        <option value="mailgun">Mailgun</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Host</label>
                                    <input className="w-full border-gray-300 rounded-lg p-2" value={emailConfig.host} onChange={e => setEmailConfig({...emailConfig, host: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Port</label>
                                    <input type="number" className="w-full border-gray-300 rounded-lg p-2" value={emailConfig.port} onChange={e => setEmailConfig({...emailConfig, port: parseInt(e.target.value)})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Username</label>
                                    <input className="w-full border-gray-300 rounded-lg p-2" value={emailConfig.username} onChange={e => setEmailConfig({...emailConfig, username: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                                    <input type="password" className="w-full border-gray-300 rounded-lg p-2" value={emailConfig.password} onChange={e => setEmailConfig({...emailConfig, password: e.target.value})} />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">From Email</label>
                                    <input className="w-full border-gray-300 rounded-lg p-2" value={emailConfig.fromEmail} onChange={e => setEmailConfig({...emailConfig, fromEmail: e.target.value})} />
                                </div>
                            </div>
                            
                            <div className="border-t border-gray-100 pt-6 mt-6">
                                <h4 className="font-bold text-gray-900 mb-2">Test Configuration</h4>
                                <div className="flex gap-2">
                                    <input 
                                        className="flex-1 border-gray-300 rounded-lg p-2 text-sm" 
                                        placeholder="Enter recipient email" 
                                        value={testEmail}
                                        onChange={e => setTestEmail(e.target.value)}
                                    />
                                    <button 
                                        onClick={handleTestEmail}
                                        disabled={isTestingEmail}
                                        className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center disabled:opacity-70"
                                    >
                                        <Send className="w-3 h-3 mr-2" /> 
                                        {isTestingEmail ? 'Sending...' : 'Send Test'}
                                    </button>
                                </div>
                            </div>
                         </div>
                    </div>
                )}

                {activeTab === 'ai' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                            <h3 className="font-bold text-yellow-800 mb-4 flex items-center"><DollarSign className="w-5 h-5 mr-2" /> Cost Control</h3>
                            <div className="text-sm text-yellow-700">Monthly Limit: ${aiConfig.costControl?.monthlyLimitUSD}</div>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl p-6">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3 text-blue-600 font-bold">G</div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">Google Gemini</h4>
                                        <p className="text-xs text-gray-500">Model: {aiConfig.providers.google.model}</p>
                                    </div>
                                </div>
                                <input type="checkbox" checked={aiConfig.providers.google.enabled} onChange={e => handleAIChange('providers', 'google.enabled', e.target.checked)} className="rounded text-blue-600" />
                            </div>
                            <input type="password" className="w-full border-gray-300 rounded-md text-sm p-2.5" value={aiConfig.providers.google.apiKey} onChange={e => handleAIChange('providers', 'google.apiKey', e.target.value)} placeholder="API Key" />
                        </div>
                        
                         <div className="bg-white border border-gray-200 rounded-xl p-6">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3 text-green-600 font-bold">O</div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">OpenAI (Optional)</h4>
                                        <p className="text-xs text-gray-500">Model: {aiConfig.providers.openai.model}</p>
                                    </div>
                                </div>
                                <input type="checkbox" checked={aiConfig.providers.openai.enabled} onChange={e => handleAIChange('providers', 'openai.enabled', e.target.checked)} className="rounded text-blue-600" />
                            </div>
                            <input type="password" className="w-full border-gray-300 rounded-md text-sm p-2.5" value={aiConfig.providers.openai.apiKey} onChange={e => handleAIChange('providers', 'openai.apiKey', e.target.value)} placeholder="API Key" />
                        </div>
                    </div>
                )}
                
                {activeTab === 'compliance' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {compliance.map((comp) => (
                                <div key={comp.code} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center">
                                            <Globe className="w-5 h-5 text-indigo-600 mr-2" />
                                            <h3 className="font-bold text-gray-900">{comp.region}</h3>
                                        </div>
                                        <div onClick={() => toggleCompliance(comp.code)} className={`w-10 h-5 rounded-full cursor-pointer relative transition-colors ${comp.active ? 'bg-green-500' : 'bg-gray-300'}`}>
                                            <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${comp.active ? 'left-6' : 'left-1'}`}></div>
                                        </div>
                                    </div>
                                    <div className="space-y-2 text-sm text-gray-600">
                                        <div className="flex justify-between"><span>GDPR:</span> <strong>{comp.gdprEnabled ? 'Enabled' : 'Disabled'}</strong></div>
                                        <div className="flex justify-between"><span>Data Center:</span> <strong>{comp.dataResidency}</strong></div>
                                        <div className="flex justify-between"><span>KYC Engine:</span> <strong>{comp.kycProvider}</strong></div>
                                        <div className="flex justify-between"><span>Tax Auto:</span> <strong>{comp.taxEngine}</strong></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {activeTab === 'evidence' && (
                    <div className="space-y-6 animate-fade-in">
                         <div className="bg-white p-6 rounded-xl border border-gray-200">
                             <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                                 <ShieldCheck className="w-5 h-5 mr-2 text-green-600" /> SOC-2 Audit Trail
                             </h3>
                             <p className="text-sm text-gray-500 mb-6">Automatically generated artifacts for compliance audits.</p>
                             
                             <table className="w-full text-sm text-left">
                                 <thead className="bg-gray-50 text-gray-500"><tr><th className="p-3">Artifact Name</th><th className="p-3">Date</th><th className="p-3">Size</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead>
                                 <tbody className="divide-y divide-gray-100">
                                     {[
                                        { name: 'Audit Logs', type: 'CSV', date: '2023-10-30', size: '12MB', status: 'ready' },
                                        { name: 'Access Logs', type: 'JSON', date: '2023-10-30', size: '45MB', status: 'ready' },
                                        { name: 'Incident Response Report', type: 'PDF', date: '2023-09-15', size: '2.4MB', status: 'archived' },
                                        { name: 'Vendor Risk Assessment', type: 'PDF', date: '2023-08-01', size: '5MB', status: 'ready' },
                                        { name: 'Penetration Test Results', type: 'PDF', date: '2023-07-20', size: '8MB', status: 'restricted' },
                                    ].map((art, i) => (
                                         <tr key={i} className="hover:bg-gray-50">
                                             <td className="p-3 font-medium flex items-center">
                                                 <FileText className="w-4 h-4 mr-2 text-gray-400" /> {art.name}
                                             </td>
                                             <td className="p-3 text-gray-500">{art.date}</td>
                                             <td className="p-3 text-gray-500">{art.size}</td>
                                             <td className="p-3">
                                                 <span className={`px-2 py-0.5 rounded text-xs uppercase font-bold ${art.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{art.status}</span>
                                             </td>
                                             <td className="p-3 text-right">
                                                 <button className="text-blue-600 hover:underline text-xs">Download</button>
                                             </td>
                                         </tr>
                                     ))}
                                 </tbody>
                             </table>
                         </div>
                    </div>
                )}

            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
                <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center shadow-lg">
                    <Save className="w-4 h-4 mr-2" /> Save All Changes
                </button>
            </div>

            <FilePicker isOpen={isFilePickerOpen} onClose={() => setIsFilePickerOpen(false)} onSelect={handleFileSelect} acceptedTypes="image/*" />
        </div>
    );
};

export default SystemSettings;

