import React, { useState, useEffect } from 'react';
import { useContent } from '../../context/ContentContext';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';
import { useCurrency } from '../../context/CurrencyContext';
import { Save, Settings, Mail, HardDrive, DollarSign, Cpu, CheckCircle, ShieldCheck, Globe, FileText, Lock, Database, Server, RefreshCw, Plus, Trash2, Zap, X, Network, Send, Upload, Image as ImageIcon, Eye, Loader2 } from 'lucide-react';
import { AIConfigManager } from '../../services/ai/ai.config';
import { AIConfig, ComplianceConfig, Currency, PlatformSettings, EmailProviderConfig, UploadedFile, UserRole } from '../../types';
import { INITIAL_CURRENCIES } from '../../constants';
import FilePickerModal from '../shared/FilePickerModal';
import { CMSService } from '../../services/cms';

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
    const { availableCurrencies } = useCurrency();
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
        fromName: 'Geezle', 
        fromEmail: 'noreply@geezle.com' 
    });
    const [testEmail, setTestEmail] = useState('');
    const [isTestingEmail, setIsTestingEmail] = useState(false);

    // Mock Compliance Settings
    const [compliance, setCompliance] = useState<ComplianceConfig[]>([
        { region: "European Union", code: "EU", gdprEnabled: true, dataResidency: "EU-West (Frankfurt)", kycProvider: "SumSub", taxEngine: "Stripe Tax", active: true },
        { region: "United States", code: "US", gdprEnabled: false, dataResidency: "US-East (N. Virginia)", kycProvider: "Persona", taxEngine: "Avalara", active: true },
        { region: "United Kingdom", code: "UK", gdprEnabled: true, dataResidency: "EU-West (London)", kycProvider: "SumSub", taxEngine: "Stripe Tax", active: true },
    ]);

    // Loading states
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // 2. Effects
    useEffect(() => {
        loadSystemSettings();
    }, []);

    const loadSystemSettings = async () => {
        try {
            setIsLoading(true);
            // Try to load from backend
            try {
                const systemSettings = await AdminService.getSystemSettings();
                if (systemSettings) {
                    setLocalSettings(systemSettings);
                    
                    // Set nested configurations
                    if (systemSettings.system?.storage) {
                        setStorageConfig(systemSettings.system.storage);
                    }
                    if (systemSettings.system?.email) {
                        setEmailConfig(systemSettings.system.email);
                    }
                    if (systemSettings.system?.currency) {
                        setCurrencyConfig(systemSettings.system.currency as any);
                    }
                }
            } catch (error) {
                console.warn('Failed to load system settings from API, using local state:', error);
                // Fallback to context settings
                if (settings) {
                    setLocalSettings(settings);
                }
            }
            
            // Load AI config
            setAiConfig(AIConfigManager.getConfig());
            
        } catch (error) {
            console.error('Error loading system settings:', error);
            showNotification('error', 'Load Failed', 'Failed to load system settings');
        } finally {
            setIsLoading(false);
        }
    };

    // 3. Handlers
    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Avoid overwriting secrets with empty values: only include secrets when provided
            const safeEmail = { ...(emailConfig || {}) } as any;
            if (!safeEmail.password) delete safeEmail.password;

            const safeStorage: any = { ...(storageConfig || {}) };
            if (safeStorage.driver && safeStorage.driver !== 'local') {
                const creds = { ...(safeStorage[safeStorage.driver] || {}) };
                if (!creds.secretAccessKey) delete creds.secretAccessKey;
                if (!creds.accessKeyId) delete creds.accessKeyId;
                safeStorage[safeStorage.driver] = creds;
            }

            const updatedSystem = {
                ...(localSettings.system || {}),
                maintenanceMode: localSettings.system?.maintenanceMode || false,
                registrationsEnabled: localSettings.system?.registrationsEnabled !== false,
                kycEnforced: localSettings.system?.kycEnforced || false,
                admin2FA: localSettings.system?.admin2FA || false,
                regionalCompliance: compliance,
                storage: safeStorage,
                email: safeEmail,
                currency: currencyConfig,
                currencies: currencies,
                aiConfig: aiConfig
            };

            const updatedSettings = {
                ...localSettings,
                system: updatedSystem
            } as PlatformSettings;

            // Save AI config locally
            AIConfigManager.saveConfig(aiConfig);

            // Persist via ContentContext (which calls AdminService appropriately)
            try {
                await updateSettings(updatedSettings);
                showNotification('success', 'Settings Saved', 'System configuration saved successfully.');
            } catch (err) {
                console.warn('Failed to save to API, falling back to localStorage:', err);
                try {
                    localStorage.setItem('system_settings', JSON.stringify(updatedSettings));
                    showNotification('success', 'Settings Saved', 'System configuration saved locally.');
                } catch (lsErr) {
                    console.error('Failed to persist settings to localStorage', lsErr);
                    showNotification('error', 'Save Failed', 'Failed to save settings to backend and local storage.');
                }
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            showNotification('error', 'Save Failed', 'Failed to save settings. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (section: string, field: string, value: any) => {
        if (section === 'root') {
            setLocalSettings(prev => ({ ...prev, [field]: value }));
        } else if (section === 'system') {
            setLocalSettings(prev => ({
                ...prev,
                system: { ...(prev.system || {}), [field]: value }
            }));
        } else {
            setLocalSettings(prev => ({
                ...prev,
                [section]: { ...(prev as any)[section] || {}, [field]: value }
            }));
        }
    };

    const handleFileSelect = (file: UploadedFile) => {
        if (uploadTarget === 'logo') {
            setLocalSettings(prev => ({ 
                ...prev, 
                logoUrl: file.url,
                logoFileId: file.id 
            }));
        } else if (uploadTarget === 'favicon') {
            setLocalSettings(prev => ({ 
                ...prev, 
                faviconUrl: file.url,
                faviconFileId: file.id 
            }));
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
                    [provider as 'google' | 'openai']: { 
                        ...prev.providers[provider as 'google' | 'openai'] || {}, 
                        [key]: value 
                    }
                }
            }));
        } else if (section === 'costControl') {
            setAiConfig(prev => ({
                ...prev,
                costControl: { 
                    ...prev.costControl || {}, 
                    [field]: value 
                }
            }));
        } else {
            setAiConfig(prev => ({
                ...prev,
                [section]: { ...prev[section as any] || {}, [field]: value }
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
        if (rate <= 0) {
            showNotification('alert', 'Invalid Rate', 'Exchange rate must be greater than 0.');
            return;
        }
        setCurrencies(prev => prev.map(c => c.code === code ? { ...c, rate: parseFloat(rate.toFixed(4)) || 1 } : c));
    };

    const handleSetDefaultCurrency = (code: string) => {
        setCurrencies(prev => prev.map(c => ({
            ...c,
            isDefault: c.code === code
        })));
        setCurrencyConfig(prev => ({ ...prev, baseCurrency: code }));
    };

    const handleAddCurrency = () => {
        if (!newCurrency.code?.trim()) {
            showNotification('alert', 'Invalid Code', 'Please enter a currency code.');
            return;
        }
        
        if (!newCurrency.name?.trim()) {
            showNotification('alert', 'Invalid Name', 'Please enter a currency name.');
            return;
        }
        
        if (!newCurrency.symbol?.trim()) {
            showNotification('alert', 'Invalid Symbol', 'Please enter a currency symbol.');
            return;
        }
        
        // Check for duplicates
        if (currencies.some(c => c.code === newCurrency.code.toUpperCase())) {
            showNotification('alert', 'Duplicate Currency', `${newCurrency.code} already exists.`);
            return;
        }
        
        const currencyToAdd: Currency = {
            id: `currency-${Date.now()}`,
            code: newCurrency.code.toUpperCase().trim(),
            name: newCurrency.name.trim(),
            symbol: newCurrency.symbol.trim(),
            rate: newCurrency.rate || 1,
            isActive: true,
            isDefault: currencies.length === 0 // Set as default if first currency
        };
        
        setCurrencies(prev => [...prev, currencyToAdd]);
        setIsCurrencyModalOpen(false);
        setNewCurrency({ code: '', name: '', symbol: '', rate: 1, isActive: true });
        showNotification('success', 'Currency Added', `${currencyToAdd.code} added to available currencies.`);
    };

    const handleDeleteCurrency = (code: string) => {
        // Prevent deletion of default currency
        const currencyToDelete = currencies.find(c => c.code === code);
        if (!currencyToDelete) return;
        
        if (currencyToDelete.isDefault) {
            showNotification('alert', 'Cannot Delete', 'Cannot delete the default currency.');
            return;
        }
        
        if (window.confirm(`Are you sure you want to remove ${code}? This action cannot be undone.`)) {
            setCurrencies(prev => prev.filter(c => c.code !== code));
            showNotification('info', 'Currency Removed', `${code} has been removed.`);
        }
    };

    const handleAutoUpdateRates = async () => {
        showNotification('info', 'Updating Rates...', 'Fetching latest exchange rates from provider...');
        
        try {
            // In a real app, this would call an API
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Mock update - ensure rates don't go negative
            const updated = currencies.map(c => {
                if (c.isDefault) return c;
                const randomAdjustment = (Math.random() * 0.05 - 0.025);
                const newRate = Math.max(0.0001, c.rate + randomAdjustment);
                return { ...c, rate: parseFloat(newRate.toFixed(4)) };
            });
            
            setCurrencies(updated);
            showNotification('success', 'Rates Updated', 'Exchange rates synchronized successfully.');
        } catch (error) {
            showNotification('error', 'Update Failed', 'Failed to update exchange rates.');
        }
    };

    const handleTestStorage = async () => {
        showNotification('info', 'Testing Connection...', `Attempting to connect to ${storageConfig.driver}...`);
        
        try {
            // In a real app, this would test the storage connection
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            if (storageConfig.driver === 'local') {
                showNotification('success', 'Connection Successful', 'Local storage is accessible.');
            } else {
                const config = storageConfig[storageConfig.driver];
                if (!config?.accessKeyId || !config?.secretAccessKey || !config?.bucket) {
                    showNotification('alert', 'Configuration Incomplete', 'Please fill all required fields.');
                    return;
                }
                showNotification('success', 'Connection Successful', `Connected to ${storageConfig.driver} successfully.`);
            }
        } catch (error) {
            showNotification('error', 'Connection Failed', 'Unable to connect to storage provider.');
        }
    };

    const handleTestEmail = async () => {
        // Validate email
        if (!testEmail || !testEmail.includes?.('@') || !testEmail.includes?.('.')) {
            showNotification('alert', 'Invalid Email', 'Please enter a valid recipient email address.');
            return;
        }
        
        // Validate SMTP configuration
        if (!emailConfig.host?.trim() || !emailConfig.port) {
            showNotification('alert', 'Configuration Incomplete', 'Please configure email host and port first.');
            return;
        }
        
        if (emailConfig.provider === 'smtp' && (!emailConfig.username?.trim() || !emailConfig.password?.trim())) {
            showNotification('alert', 'Configuration Incomplete', 'Please enter SMTP username and password.');
            return;
        }
        
        setIsTestingEmail(true);
        
        try {
            // In a real app, this would send a test email
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            setIsTestingEmail(false);
            showNotification('success', 'Email Sent', `Test email sent to ${testEmail}. Please check your inbox.`);
            setTestEmail('');
        } catch (error) {
            setIsTestingEmail(false);
            showNotification('error', 'Send Failed', 'Failed to send test email. Check your configuration.');
        }
    };

    // AI Routing Configuration
    const aiRoutingOptions = [
        { id: 'support_chat', label: 'Support Chat' },
        { id: 'seo_tags', label: 'SEO Tags' },
        { id: 'semantic_search', label: 'Semantic Search' },
        { id: 'content_moderation', label: 'Content Moderation' }
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" />
                    <p className="text-gray-500">Loading system configuration...</p>
                </div>
            </div>
        );
    }

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
                            <input 
                                className="w-full border-gray-300 rounded-md p-2" 
                                value={localSettings.siteName || ''} 
                                onChange={e => handleChange('root', 'siteName', e.target.value)} 
                                placeholder="Enter site name"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tagline</label>
                            <input 
                                className="w-full border-gray-300 rounded-md p-2" 
                                value={localSettings.tagline || ''} 
                                onChange={e => handleChange('root', 'tagline', e.target.value)}
                                placeholder="Enter tagline"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                            <input 
                                className="w-full border-gray-300 rounded-md p-2" 
                                value={localSettings.adminEmail || ''} 
                                onChange={e => handleChange('root', 'adminEmail', e.target.value)}
                                placeholder="admin@example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Support Email</label>
                            <input 
                                className="w-full border-gray-300 rounded-md p-2" 
                                value={localSettings.supportEmail || ''} 
                                onChange={e => handleChange('root', 'supportEmail', e.target.value)}
                                placeholder="support@example.com"
                            />
                        </div>
                        
                        <div className="space-y-4 pt-4 border-t border-gray-200">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-medium text-gray-700">Maintenance Mode</span>
                                    <p className="text-xs text-gray-500">Temporarily disable access for non-admins</p>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={localSettings.system?.maintenanceMode || false} 
                                    onChange={e => handleChange('system', 'maintenanceMode', e.target.checked)} 
                                    className="rounded text-blue-600" 
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-medium text-gray-700">Allow Registrations</span>
                                    <p className="text-xs text-gray-500">Allow new users to sign up</p>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={localSettings.system?.registrationsEnabled !== false} 
                                    onChange={e => handleChange('system', 'registrationsEnabled', e.target.checked)} 
                                    className="rounded text-blue-600" 
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-medium text-gray-700">Enforce KYC</span>
                                    <p className="text-xs text-gray-500">Require identity verification</p>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={localSettings.system?.kycEnforced || false} 
                                    onChange={e => handleChange('system', 'kycEnforced', e.target.checked)} 
                                    className="rounded text-blue-600" 
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-sm font-medium text-gray-700">Admin 2FA</span>
                                    <p className="text-xs text-gray-500">Require 2FA for admin access</p>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={localSettings.system?.admin2FA || false} 
                                    onChange={e => handleChange('system', 'admin2FA', e.target.checked)} 
                                    className="rounded text-blue-600" 
                                />
                            </div>
                        </div>

                        <div className="bg-green-50 border border-green-200 p-4 rounded-lg flex items-center justify-between">
                            <div>
                                <span className="font-bold text-green-800 text-sm block">System Operational</span>
                                <span className="text-green-600 text-xs">All services running normally</span>
                            </div>
                            <CheckCircle className="w-5 h-5 text-green-600" />
                        </div>
                    </div>
                )}
                
                {activeTab === 'filesystem' && (
                     <div className="space-y-8 animate-fade-in max-w-2xl">
                        <div className="bg-white p-6 rounded-xl border border-gray-200">
                            <div className="flex justify-between items-start mb-6">
                                <h3 className="font-bold text-gray-900 flex items-center">
                                    <Database className="w-5 h-5 mr-2 text-blue-600" /> File Storage Configuration
                                </h3>
                                <button 
                                    onClick={handleTestStorage} 
                                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center"
                                >
                                    <Network className="w-3 h-3 mr-1" /> Test Connection
                                </button>
                            </div>
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Default Storage Driver</label>
                                    <select 
                                        className="w-full border-gray-300 rounded-lg p-2.5 shadow-sm focus:ring-blue-500 focus:border-blue-500" 
                                        value={storageConfig.driver || 'local'} 
                                        onChange={e => setStorageConfig({...storageConfig, driver: e.target.value})}
                                    >
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
                                                <input 
                                                    className="w-full border-gray-300 rounded-md p-2" 
                                                    type="password" 
                                                    value={storageConfig[storageConfig.driver]?.accessKeyId || ''} 
                                                    onChange={e => setStorageConfig({
                                                        ...storageConfig, 
                                                        [storageConfig.driver]: { 
                                                            ...storageConfig[storageConfig.driver] || {}, 
                                                            accessKeyId: e.target.value 
                                                        }
                                                    })} 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Secret Access Key</label>
                                                <input 
                                                    className="w-full border-gray-300 rounded-md p-2" 
                                                    type="password" 
                                                    value={storageConfig[storageConfig.driver]?.secretAccessKey || ''} 
                                                    onChange={e => setStorageConfig({
                                                        ...storageConfig, 
                                                        [storageConfig.driver]: { 
                                                            ...storageConfig[storageConfig.driver] || {}, 
                                                            secretAccessKey: e.target.value 
                                                        }
                                                    })} 
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Region</label>
                                                <input 
                                                    className="w-full border-gray-300 rounded-md p-2" 
                                                    value={storageConfig[storageConfig.driver]?.region || ''} 
                                                    onChange={e => setStorageConfig({
                                                        ...storageConfig, 
                                                        [storageConfig.driver]: { 
                                                            ...storageConfig[storageConfig.driver] || {}, 
                                                            region: e.target.value 
                                                        }
                                                    })} 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Bucket Name</label>
                                                <input 
                                                    className="w-full border-gray-300 rounded-md p-2" 
                                                    value={storageConfig[storageConfig.driver]?.bucket || ''} 
                                                    onChange={e => setStorageConfig({
                                                        ...storageConfig, 
                                                        [storageConfig.driver]: { 
                                                            ...storageConfig[storageConfig.driver] || {}, 
                                                            bucket: e.target.value 
                                                        }
                                                    })} 
                                                />
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
                                <button 
                                    onClick={handleAutoUpdateRates} 
                                    className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-100 flex items-center"
                                >
                                    <RefreshCw className="w-3 h-3 mr-1" /> Update Rates
                                </button>
                                <button 
                                    onClick={() => setIsCurrencyModalOpen(true)} 
                                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-blue-700 flex items-center"
                                >
                                    <Plus className="w-3 h-3 mr-1" /> Add Currency
                                </button>
                            </div>
                        </div>

                        {/* Settings Bar */}
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6 flex flex-wrap gap-6 items-center">
                            <label className="flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={currencyConfig.autoExchangeRate} 
                                    onChange={e => setCurrencyConfig({...currencyConfig, autoExchangeRate: e.target.checked})} 
                                    className="rounded text-blue-600 mr-2" 
                                />
                                <span className="text-sm font-medium text-gray-700">Auto Exchange Rate</span>
                            </label>
                            
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-700">Base Currency:</span>
                                <select 
                                    className="border-gray-300 rounded-md text-sm p-1"
                                    value={currencyConfig.baseCurrency}
                                    onChange={e => {
                                        setCurrencyConfig({...currencyConfig, baseCurrency: e.target.value});
                                        handleSetDefaultCurrency(e.target.value);
                                    }}
                                >
                                    {Array.isArray(currencies) && currencies.map(c => (
                                        <option key={`base-currency-${c.code}`} value={c.code}>{c.code}</option>
                                    ))}
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
                            
                            {currencyConfig.provider !== 'mock' && (
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">API Key</label>
                                    <input 
                                        type="password"
                                        className="w-full border-gray-300 rounded-md p-1.5 text-sm"
                                        value={currencyConfig.apiKey}
                                        onChange={e => setCurrencyConfig({...currencyConfig, apiKey: e.target.value})}
                                        placeholder="Enter API key"
                                    />
                                </div>
                            )}
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
                                    {Array.isArray(currencies) && currencies.map((curr, index) => (
                                        <tr key={`currency-${curr.code || index}`} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 font-bold">{curr.code}</td>
                                            <td className="px-6 py-4">{curr.name}</td>
                                            <td className="px-6 py-4 font-mono">{curr.symbol}</td>
                                            <td className="px-6 py-4">
                                                <input 
                                                    type="number" 
                                                    step="0.0001"
                                                    min="0.0001"
                                                    disabled={currencyConfig.autoExchangeRate || curr.isDefault}
                                                    className="w-24 border border-gray-200 rounded px-2 py-1 text-right disabled:bg-gray-100 disabled:text-gray-500"
                                                    value={curr.rate || 0}
                                                    onChange={e => updateCurrencyRate(curr.code, parseFloat(e.target.value) || 0)}
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
                                                    <button 
                                                        onClick={() => handleDeleteCurrency(curr.code)} 
                                                        className="text-red-400 hover:text-red-600 p-1"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
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
                                        <button onClick={() => setIsCurrencyModalOpen(false)}>
                                            <X className="w-5 h-5 text-gray-400"/>
                                        </button>
                                    </div>
                                    <div className="space-y-4">
                                        <input 
                                            className="w-full border rounded p-2" 
                                            placeholder="Code (e.g. BTC)" 
                                            value={newCurrency.code} 
                                            onChange={e => setNewCurrency({...newCurrency, code: e.target.value.toUpperCase()})} 
                                        />
                                        <input 
                                            className="w-full border rounded p-2" 
                                            placeholder="Name (e.g. Bitcoin)" 
                                            value={newCurrency.name} 
                                            onChange={e => setNewCurrency({...newCurrency, name: e.target.value})} 
                                        />
                                        <input 
                                            className="w-full border rounded p-2" 
                                            placeholder="Symbol (e.g. ₿)" 
                                            value={newCurrency.symbol} 
                                            onChange={e => setNewCurrency({...newCurrency, symbol: e.target.value})} 
                                        />
                                        <input 
                                            type="number" 
                                            className="w-full border rounded p-2" 
                                            placeholder="Initial Rate" 
                                            value={newCurrency.rate || 1}
                                            onChange={e => setNewCurrency({...newCurrency, rate: parseFloat(e.target.value) || 1})} 
                                            min="0.0001"
                                            step="0.0001"
                                        />
                                    </div>
                                    <button 
                                        onClick={handleAddCurrency} 
                                        className="w-full bg-blue-600 text-white rounded-lg py-2 mt-6 font-bold hover:bg-blue-700"
                                    >
                                        Add Currency
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'email' && (
                    <div className="space-y-6 max-w-2xl animate-fade-in">
                         <div className="bg-white p-6 rounded-xl border border-gray-200">
                            <h3 className="font-bold text-gray-900 mb-6 flex items-center">
                                <Mail className="w-5 h-5 mr-2 text-blue-600" /> Email Configuration
                            </h3>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Provider</label>
                                    <select 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.provider} 
                                        onChange={e => setEmailConfig({...emailConfig, provider: e.target.value as any})}
                                    >
                                        <option value="smtp">Custom SMTP</option>
                                        <option value="ses">Amazon SES</option>
                                        <option value="sendgrid">SendGrid</option>
                                        <option value="mailgun">Mailgun</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Host</label>
                                    <input 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.host || ''} 
                                        onChange={e => setEmailConfig({...emailConfig, host: e.target.value})} 
                                        placeholder="smtp.example.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Port</label>
                                    <input 
                                        type="number" 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.port || 587} 
                                        onChange={e => setEmailConfig({...emailConfig, port: parseInt(e.target.value) || 587})} 
                                        min="1"
                                        max="65535"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Username</label>
                                    <input 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.username || ''} 
                                        onChange={e => setEmailConfig({...emailConfig, username: e.target.value})} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                                    <input 
                                        type="password" 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.password || ''} 
                                        onChange={e => setEmailConfig({...emailConfig, password: e.target.value})} 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">From Name</label>
                                    <input 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.fromName || ''} 
                                        onChange={e => setEmailConfig({...emailConfig, fromName: e.target.value})} 
                                        placeholder="Geezle"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">From Email</label>
                                    <input 
                                        className="w-full border-gray-300 rounded-lg p-2" 
                                        value={emailConfig.fromEmail || ''} 
                                        onChange={e => setEmailConfig({...emailConfig, fromEmail: e.target.value})} 
                                        placeholder="noreply@geezle.com"
                                        type="email"
                                    />
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
                                        type="email"
                                    />
                                    <button 
                                        onClick={handleTestEmail}
                                        disabled={isTestingEmail}
                                        className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isTestingEmail ? (
                                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                        ) : (
                                            <Send className="w-3 h-3 mr-2" />
                                        )}
                                        {isTestingEmail ? 'Sending...' : 'Send Test'}
                                    </button>
                                </div>
                            </div>
                         </div>
                    </div>
                )}

                {activeTab === 'ai' && (
                    <div className="space-y-8 animate-fade-in max-w-2xl">
                        {/* Cost Control */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                            <h3 className="font-bold text-yellow-800 mb-4 flex items-center">
                                <DollarSign className="w-5 h-5 mr-2" /> AI Cost Control
                            </h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-yellow-700">Enable Cost Control</span>
                                    <input 
                                        type="checkbox" 
                                        checked={aiConfig.costControl?.enabled || false} 
                                        onChange={e => handleAIChange('costControl', 'enabled', e.target.checked)} 
                                        className="rounded text-blue-600" 
                                    />
                                </div>
                                {aiConfig.costControl?.enabled && (
                                    <div>
                                        <label className="block text-xs font-bold text-yellow-700 uppercase mb-1">Monthly Limit (USD)</label>
                                        <input 
                                            type="number" 
                                            className="w-full border-yellow-200 bg-yellow-100 rounded-lg p-2" 
                                            value={aiConfig.costControl?.monthlyLimitUSD || 100} 
                                            onChange={e => handleAIChange('costControl', 'monthlyLimitUSD', parseFloat(e.target.value) || 100)} 
                                            min="1"
                                            step="10"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Google Gemini */}
                        <div className="bg-white border border-gray-200 rounded-xl p-6">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3 text-blue-600 font-bold">G</div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">Google Gemini</h4>
                                        <p className="text-xs text-gray-500">
                                            Model: {aiConfig.providers?.google?.model || 'gemini-pro'}
                                        </p>
                                    </div>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={aiConfig.providers?.google?.enabled || false} 
                                    onChange={e => handleAIChange('providers', 'google.enabled', e.target.checked)} 
                                    className="rounded text-blue-600" 
                                />
                            </div>
                            <input 
                                type="password" 
                                className="w-full border-gray-300 rounded-md text-sm p-2.5" 
                                value={aiConfig.providers?.google?.apiKey || ''} 
                                onChange={e => handleAIChange('providers', 'google.apiKey', e.target.value)} 
                                placeholder="Enter Gemini API Key" 
                            />
                            {aiConfig.providers?.google?.enabled && (
                                <select 
                                    className="w-full border-gray-300 rounded-md text-sm p-2.5 mt-2"
                                    value={aiConfig.providers?.google?.model || 'gemini-pro'}
                                    onChange={e => handleAIChange('providers', 'google.model', e.target.value)}
                                >
                                    <option value="gemini-pro">Gemini Pro</option>
                                    <option value="gemini-pro-vision">Gemini Pro Vision</option>
                                    <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                </select>
                            )}
                        </div>
                        
                        {/* OpenAI */}
                        <div className="bg-white border border-gray-200 rounded-xl p-6">
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center">
                                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3 text-green-600 font-bold">O</div>
                                    <div>
                                        <h4 className="font-bold text-gray-900">OpenAI</h4>
                                        <p className="text-xs text-gray-500">
                                            Model: {aiConfig.providers?.openai?.model || 'gpt-4'}
                                        </p>
                                    </div>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={aiConfig.providers?.openai?.enabled || false} 
                                    onChange={e => handleAIChange('providers', 'openai.enabled', e.target.checked)} 
                                    className="rounded text-blue-600" 
                                />
                            </div>
                            <input 
                                type="password" 
                                className="w-full border-gray-300 rounded-md text-sm p-2.5" 
                                value={aiConfig.providers?.openai?.apiKey || ''} 
                                onChange={e => handleAIChange('providers', 'openai.apiKey', e.target.value)} 
                                placeholder="Enter OpenAI API Key" 
                            />
                            {aiConfig.providers?.openai?.enabled && (
                                <select 
                                    className="w-full border-gray-300 rounded-md text-sm p-2.5 mt-2"
                                    value={aiConfig.providers?.openai?.model || 'gpt-4'}
                                    onChange={e => handleAIChange('providers', 'openai.model', e.target.value)}
                                >
                                    <option value="gpt-4">GPT-4</option>
                                    <option value="gpt-4-turbo">GPT-4 Turbo</option>
                                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                </select>
                            )}
                        </div>

                        {/* AI Routing */}
                        <div className="bg-white border border-gray-200 rounded-xl p-6">
                            <h4 className="font-bold text-gray-900 mb-4">AI Routing Configuration</h4>
                            <div className="space-y-3">
                                {aiRoutingOptions.map((option) => (
                                    <div key={option.id} className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-gray-700">{option.label}</span>
                                        <select 
                                            className="border-gray-300 rounded-md text-sm p-1"
                                            value={aiConfig.routing?.[option.id as keyof typeof aiConfig.routing] || 'google'}
                                            onChange={e => handleAIChange('routing', option.id, e.target.value)}
                                        >
                                            <option value="google">Google</option>
                                            <option value="openai">OpenAI</option>
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* AI Safety Settings */}
                        <div className="bg-white border border-gray-200 rounded-xl p-6">
                            <h4 className="font-bold text-gray-900 mb-4">Safety & Performance</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Max Tokens</label>
                                    <input 
                                        type="number" 
                                        className="w-full border-gray-300 rounded-md p-2" 
                                        value={aiConfig.safety?.maxTokens || 2048} 
                                        onChange={e => handleAIChange('safety', 'maxTokens', parseInt(e.target.value) || 2048)} 
                                        min="100"
                                        max="8192"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Temperature</label>
                                    <input 
                                        type="number" 
                                        step="0.1"
                                        className="w-full border-gray-300 rounded-md p-2" 
                                        value={aiConfig.safety?.temperature || 0.7} 
                                        onChange={e => handleAIChange('safety', 'temperature', parseFloat(e.target.value) || 0.7)} 
                                        min="0"
                                        max="2"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {activeTab === 'compliance' && (
                    <div className="space-y-6 animate-fade-in max-w-4xl">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Regional Compliance Settings</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {Array.isArray(compliance) && compliance.map((comp) => (
                                <div key={`compliance-${comp.code}`} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm relative">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center">
                                            <Globe className="w-5 h-5 text-indigo-600 mr-2" />
                                            <h3 className="font-bold text-gray-900">{comp.region}</h3>
                                        </div>
                                        <div 
                                            onClick={() => toggleCompliance(comp.code)} 
                                            className={`w-10 h-5 rounded-full cursor-pointer relative transition-colors ${comp.active ? 'bg-green-500' : 'bg-gray-300'}`}
                                        >
                                            <div className={`w-3 h-3 bg-white rounded-full absolute top-1 transition-all ${comp.active ? 'left-6' : 'left-1'}`}></div>
                                        </div>
                                    </div>
                                    <div className="space-y-2 text-sm text-gray-600">
                                        <div className="flex justify-between">
                                            <span>GDPR:</span> 
                                            <strong className={comp.gdprEnabled ? 'text-green-600' : 'text-red-500'}>
                                                {comp.gdprEnabled ? 'Enabled' : 'Disabled'}
                                            </strong>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Data Center:</span> 
                                            <strong>{comp.dataResidency}</strong>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>KYC Engine:</span> 
                                            <strong>{comp.kycProvider}</strong>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>Tax Auto:</span> 
                                            <strong>{comp.taxEngine}</strong>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {activeTab === 'evidence' && (
                    <div className="space-y-6 animate-fade-in max-w-4xl">
                         <div className="bg-white p-6 rounded-xl border border-gray-200">
                             <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                                 <ShieldCheck className="w-5 h-5 mr-2 text-green-600" /> SOC-2 Compliance Evidence
                             </h3>
                             <p className="text-sm text-gray-500 mb-6">Automatically generated artifacts for compliance audits.</p>
                             
                             <table className="w-full text-sm text-left">
                                 <thead className="bg-gray-50 text-gray-500">
                                     <tr>
                                         <th className="p-3">Artifact Name</th>
                                         <th className="p-3">Date</th>
                                         <th className="p-3">Size</th>
                                         <th className="p-3">Status</th>
                                         <th className="p-3 text-right">Action</th>
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y divide-gray-100">
                                     {[
                                        { id: 'audit-logs', name: 'Audit Logs', type: 'CSV', date: '2023-10-30', size: '12MB', status: 'ready' },
                                        { id: 'access-logs', name: 'Access Logs', type: 'JSON', date: '2023-10-30', size: '45MB', status: 'ready' },
                                        { id: 'incident-report', name: 'Incident Response Report', type: 'PDF', date: '2023-09-15', size: '2.4MB', status: 'archived' },
                                        { id: 'vendor-risk', name: 'Vendor Risk Assessment', type: 'PDF', date: '2023-08-01', size: '5MB', status: 'ready' },
                                        { id: 'pen-test', name: 'Penetration Test Results', type: 'PDF', date: '2023-07-20', size: '8MB', status: 'restricted' },
                                    ].map((art) => (
                                         <tr key={`artifact-${art.id}`} className="hover:bg-gray-50">
                                             <td className="p-3 font-medium flex items-center">
                                                 <FileText className="w-4 h-4 mr-2 text-gray-400" /> {art.name}
                                             </td>
                                             <td className="p-3 text-gray-500">{art.date}</td>
                                             <td className="p-3 text-gray-500">{art.size}</td>
                                             <td className="p-3">
                                                 <span className={`px-2 py-0.5 rounded text-xs uppercase font-bold ${art.status === 'ready' ? 'bg-green-100 text-green-700' : art.status === 'archived' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                                     {art.status}
                                                 </span>
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
                <button 
                    onClick={handleSave} 
                    disabled={isSaving}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 flex items-center shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {isSaving ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <Save className="w-4 h-4 mr-2" />
                    )}
                    {isSaving ? 'Saving...' : 'Save All Changes'}
                </button>
            </div>

            <FilePickerModal
                isOpen={isFilePickerOpen}
                onClose={() => setIsFilePickerOpen(false)}
                onSelect={handleFileSelect}
                acceptedTypes="image/*"
                filterType="image"
                title={`Select ${uploadTarget === 'logo' ? 'Logo' : 'Favicon'}`}
                role="admin"
            />
        </div>
    );
};

export default SystemSettings;
