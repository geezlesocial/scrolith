import React, { useEffect, useState } from 'react';
import { ArrowLeft, Save, Upload } from 'lucide-react';
import { CMSService } from '../../services/cms';
import { AuthPagesConfig } from '../../types';
import { useNotification } from '../../context/NotificationContext';

const defaultAuthConfig: AuthPagesConfig = {
    id: 'auth_pages',
    branding: {
        show_logo: true,
        logo_url: '',
        logo_link_url: '/'
    },
    login: {
        headline: 'Sign in to your account',
        subheadline: '',
        email_placeholder: 'Email address',
        password_placeholder: 'Password',
        submit_label: 'Sign in',
        footer_text: "Don't have an account?",
        footer_link_label: 'Sign up',
        footer_link_url: '/auth/signup'
    },
    signup: {
        headline: 'Join Our Community',
        subheadline: '',
        submit_label: 'Create Account',
        terms_url: '/p/terms',
        privacy_url: '/p/privacy',
        footer_text: 'Already have an account?',
        footer_link_label: 'Sign in here',
        footer_link_url: '/auth/login'
    }
};

type AuthTab = 'branding' | 'login' | 'signup';

const AuthPagesManager = ({ setView }: { setView: (view: 'list' | 'editor' | 'categories' | 'auth-pages') => void }) => {
    const [config, setConfig] = useState<AuthPagesConfig>(defaultAuthConfig);
    const [activeTab, setActiveTab] = useState<AuthTab>('branding');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { showNotification } = useNotification();

    useEffect(() => {
        let isMounted = true;
        const loadConfig = async () => {
            try {
                const data = await CMSService.getAuthPagesConfig();
                if (isMounted && data) {
                    setConfig({ ...defaultAuthConfig, ...data });
                }
            } catch (error) {
                showNotification('alert', 'Error', 'Failed to load auth pages config.');
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };
        loadConfig();
        return () => {
            isMounted = false;
        };
    }, [showNotification]);

    const updateBranding = (updates: Partial<AuthPagesConfig['branding']>) => {
        setConfig((prev) => ({
            ...prev,
            branding: { ...prev.branding, ...updates }
        }));
    };

    const updateLogin = (updates: Partial<AuthPagesConfig['login']>) => {
        setConfig((prev) => ({
            ...prev,
            login: { ...prev.login, ...updates }
        }));
    };

    const updateSignup = (updates: Partial<AuthPagesConfig['signup']>) => {
        setConfig((prev) => ({
            ...prev,
            signup: { ...prev.signup, ...updates }
        }));
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        try {
            const media = await CMSService.uploadMedia(e.target.files[0]);
            updateBranding({ logo_url: media.url });
            showNotification('success', 'Uploaded', 'Logo updated successfully.');
        } catch (error) {
            showNotification('alert', 'Error', 'Logo upload failed.');
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const saved = await CMSService.saveAuthPagesConfig({
                ...config,
                updated_at: new Date().toISOString()
            });
            setConfig(saved || config);
            showNotification('success', 'Saved', 'Auth pages updated.');
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to save auth pages.');
        } finally {
            setIsSaving(false);
        }
    };

    const previewHeadline = activeTab === 'signup' ? config.signup.headline : config.login.headline;
    const previewButton = activeTab === 'signup' ? config.signup.submit_label : config.login.submit_label;

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-900 flex items-center">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pages
                </button>
                <h2 className="text-xl font-bold">Auth Pages Manager</h2>
                <button
                    onClick={handleSave}
                    disabled={isSaving || isLoading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 shadow-sm disabled:opacity-60"
                >
                    <Save className="w-4 h-4 mr-2" /> {isSaving ? 'Saving...' : 'Save'}
                </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
                <button
                    onClick={() => setActiveTab('branding')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'branding' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                    Branding
                </button>
                <button
                    onClick={() => setActiveTab('login')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'login' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                    Login
                </button>
                <button
                    onClick={() => setActiveTab('signup')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'signup' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                    Signup
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {activeTab === 'branding' && (
                        <div className="space-y-4">
                            <label className="flex items-center space-x-3">
                                <input
                                    type="checkbox"
                                    checked={config.branding.show_logo}
                                    onChange={(e) => updateBranding({ show_logo: e.target.checked })}
                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                />
                                <span className="text-sm font-medium text-gray-700">Show Logo</span>
                            </label>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                                <input
                                    className="w-full border-gray-300 rounded-lg p-2.5"
                                    value={config.branding.logo_url}
                                    onChange={(e) => updateBranding({ logo_url: e.target.value })}
                                    placeholder="https://..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Upload Logo</label>
                                <label className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                                    <Upload className="w-4 h-4 mr-2 text-gray-500" />
                                    <span className="text-sm">Select File</span>
                                    <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                                </label>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Logo Link URL</label>
                                <input
                                    className="w-full border-gray-300 rounded-lg p-2.5"
                                    value={config.branding.logo_link_url}
                                    onChange={(e) => updateBranding({ logo_link_url: e.target.value })}
                                    placeholder="/"
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'login' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
                                <input
                                    className="w-full border-gray-300 rounded-lg p-2.5"
                                    value={config.login.headline}
                                    onChange={(e) => updateLogin({ headline: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Subheadline</label>
                                <input
                                    className="w-full border-gray-300 rounded-lg p-2.5"
                                    value={config.login.subheadline || ''}
                                    onChange={(e) => updateLogin({ subheadline: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Placeholder</label>
                                    <input
                                        className="w-full border-gray-300 rounded-lg p-2.5"
                                        value={config.login.email_placeholder || ''}
                                        onChange={(e) => updateLogin({ email_placeholder: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Password Placeholder</label>
                                    <input
                                        className="w-full border-gray-300 rounded-lg p-2.5"
                                        value={config.login.password_placeholder || ''}
                                        onChange={(e) => updateLogin({ password_placeholder: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Submit Button Label</label>
                                <input
                                    className="w-full border-gray-300 rounded-lg p-2.5"
                                    value={config.login.submit_label}
                                    onChange={(e) => updateLogin({ submit_label: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text</label>
                                    <input
                                        className="w-full border-gray-300 rounded-lg p-2.5"
                                        value={config.login.footer_text || ''}
                                        onChange={(e) => updateLogin({ footer_text: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Footer Link Label</label>
                                    <input
                                        className="w-full border-gray-300 rounded-lg p-2.5"
                                        value={config.login.footer_link_label || ''}
                                        onChange={(e) => updateLogin({ footer_link_label: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Footer Link URL</label>
                                <input
                                    className="w-full border-gray-300 rounded-lg p-2.5"
                                    value={config.login.footer_link_url || ''}
                                    onChange={(e) => updateLogin({ footer_link_url: e.target.value })}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'signup' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Headline</label>
                                <input
                                    className="w-full border-gray-300 rounded-lg p-2.5"
                                    value={config.signup.headline}
                                    onChange={(e) => updateSignup({ headline: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Subheadline</label>
                                <input
                                    className="w-full border-gray-300 rounded-lg p-2.5"
                                    value={config.signup.subheadline || ''}
                                    onChange={(e) => updateSignup({ subheadline: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Submit Button Label</label>
                                <input
                                    className="w-full border-gray-300 rounded-lg p-2.5"
                                    value={config.signup.submit_label}
                                    onChange={(e) => updateSignup({ submit_label: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Terms URL</label>
                                    <input
                                        className="w-full border-gray-300 rounded-lg p-2.5"
                                        value={config.signup.terms_url || ''}
                                        onChange={(e) => updateSignup({ terms_url: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Privacy URL</label>
                                    <input
                                        className="w-full border-gray-300 rounded-lg p-2.5"
                                        value={config.signup.privacy_url || ''}
                                        onChange={(e) => updateSignup({ privacy_url: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text</label>
                                    <input
                                        className="w-full border-gray-300 rounded-lg p-2.5"
                                        value={config.signup.footer_text || ''}
                                        onChange={(e) => updateSignup({ footer_text: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Footer Link Label</label>
                                    <input
                                        className="w-full border-gray-300 rounded-lg p-2.5"
                                        value={config.signup.footer_link_label || ''}
                                        onChange={(e) => updateSignup({ footer_link_label: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Footer Link URL</label>
                                <input
                                    className="w-full border-gray-300 rounded-lg p-2.5"
                                    value={config.signup.footer_link_url || ''}
                                    onChange={(e) => updateSignup({ footer_link_url: e.target.value })}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                        <h4 className="font-semibold text-gray-900 mb-4">Preview</h4>
                        <div className="space-y-3">
                            {config.branding.show_logo && config.branding.logo_url && (
                                <img src={config.branding.logo_url} alt="Logo preview" className="h-10" />
                            )}
                            <div>
                                <div className="text-lg font-bold text-gray-900">{previewHeadline}</div>
                                <div className="mt-3 inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">
                                    {previewButton}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthPagesManager;
