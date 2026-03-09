import React, { useEffect, useState } from 'react';
import { ArrowLeft, Save, Upload } from 'lucide-react';
import { CMSService } from '../../services/cms';
import type { AuthPagesConfig, AuthProviderKey, UserRole } from '../../types';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { USER_ROLES } from '../../utils/userRoles';
import FilePickerModal from '../shared/FilePickerModal';

const defaultSocialConfig: AuthPagesConfig['social_auth'] = {
    enabled: true,
    divider_text: 'Or continue with',
    login_enabled: true,
    signup_enabled: true,
    providers: {
        google: {
            enabled: false,
            client_id: '',
            client_secret: '',
            scopes: 'openid profile email',
            button_label: 'Continue with Google',
            label_logo_url: '',
            login_enabled: true,
            signup_enabled: true,
            allow_roles: [USER_ROLES.FREELANCER, USER_ROLES.EMPLOYER]
        },
        facebook: {
            enabled: false,
            client_id: '',
            client_secret: '',
            scopes: 'public_profile email',
            button_label: 'Continue with Facebook',
            label_logo_url: '',
            login_enabled: true,
            signup_enabled: true,
            allow_roles: [USER_ROLES.FREELANCER, USER_ROLES.EMPLOYER]
        },
        twitter: {
            enabled: false,
            client_id: '',
            client_secret: '',
            scopes: 'tweet.read users.read offline.access',
            button_label: 'Continue with Twitter',
            label_logo_url: '',
            login_enabled: true,
            signup_enabled: true,
            allow_roles: [USER_ROLES.FREELANCER, USER_ROLES.EMPLOYER]
        },
        linkedin: {
            enabled: false,
            client_id: '',
            client_secret: '',
            scopes: 'openid profile email',
            button_label: 'Continue with LinkedIn',
            label_logo_url: '',
            login_enabled: true,
            signup_enabled: true,
            allow_roles: [USER_ROLES.FREELANCER, USER_ROLES.EMPLOYER]
        }
    }
};

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
    },
    social_auth: defaultSocialConfig
};

type AuthTab = 'branding' | 'login' | 'signup' | 'social';

const providerMeta: Record<AuthProviderKey, { label: string; description: string }> = {
    google: { label: 'Google', description: 'OpenID Connect (profile + email).' },
    facebook: { label: 'Facebook', description: 'OAuth 2.0 with email permission.' },
    twitter: { label: 'Twitter', description: 'OAuth 2.0 with PKCE (users.read).' },
    linkedin: { label: 'LinkedIn', description: 'OpenID Connect (profile + email).' }
};

const normalizeRoleValue = (value: any) => {
    if (!value) return '';
    return value.toString().trim().toLowerCase();
};

const normalizeAllowRoles = (roles: any[] | undefined) => {
    const list = Array.isArray(roles) ? roles : [];
    const seen = new Set<string>();
    return list
        .map(normalizeRoleValue)
        .filter(Boolean)
        .filter((role) => {
            if (seen.has(role)) return false;
            seen.add(role);
            return true;
        }) as UserRole[];
};

const AuthPagesManager = ({ setView }: { setView: (view: 'list' | 'editor' | 'categories' | 'auth-pages') => void }) => {
    const [config, setConfig] = useState<AuthPagesConfig>(defaultAuthConfig);
    const [activeTab, setActiveTab] = useState<AuthTab>('branding');
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [logoPickerOpen, setLogoPickerOpen] = useState(false);
    const [providerLogoPicker, setProviderLogoPicker] = useState<AuthProviderKey | null>(null);
    const { showNotification } = useNotification();
    const { socket } = useSocket();

    useEffect(() => {
        let isMounted = true;
        const loadConfig = async () => {
            try {
                const data = await CMSService.getAuthPagesConfig();
                if (isMounted && data) {
                    const socialIncoming = (data as any)?.social_auth || (data as any)?.socialAuth;
                    const mergedSocial = {
                        ...defaultSocialConfig,
                        ...(socialIncoming || {}),
                        providers: {
                            ...defaultSocialConfig.providers,
                            ...(socialIncoming?.providers || {})
                        }
                    };
                    (Object.keys(mergedSocial.providers) as AuthProviderKey[]).forEach((key) => {
                        const provider = mergedSocial.providers[key];
                        provider.allow_roles = normalizeAllowRoles(provider.allow_roles ?? defaultSocialConfig.providers[key].allow_roles);
                    });
                    setConfig({ ...defaultAuthConfig, ...data, social_auth: mergedSocial });
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

    useEffect(() => {
        if (!socket) return;
        const refresh = async () => {
            try {
                const data = await CMSService.getAuthPagesConfig();
                if (data) {
                    const socialIncoming = (data as any)?.social_auth || (data as any)?.socialAuth;
                    const mergedSocial = {
                        ...defaultSocialConfig,
                        ...(socialIncoming || {}),
                        providers: {
                            ...defaultSocialConfig.providers,
                            ...(socialIncoming?.providers || {})
                        }
                    };
                    (Object.keys(mergedSocial.providers) as AuthProviderKey[]).forEach((key) => {
                        const provider = mergedSocial.providers[key];
                        provider.allow_roles = normalizeAllowRoles(provider.allow_roles ?? defaultSocialConfig.providers[key].allow_roles);
                    });
                    setConfig({ ...defaultAuthConfig, ...data, social_auth: mergedSocial });
                }
            } catch (error) {
                // silent refresh failure
            }
        };
        socket.on('cms:auth_pages_updated', refresh);
        return () => {
            socket.off('cms:auth_pages_updated', refresh);
        };
    }, [socket]);

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

    const updateSocial = (updates: Partial<NonNullable<AuthPagesConfig['social_auth']>>) => {
        setConfig((prev) => ({
            ...prev,
            social_auth: { ...(prev.social_auth || defaultSocialConfig), ...updates }
        }));
    };

    const updateProvider = (provider: AuthProviderKey, updates: Partial<NonNullable<AuthPagesConfig['social_auth']>['providers'][AuthProviderKey]>) => {
        setConfig((prev) => {
            const current = prev.social_auth || defaultSocialConfig;
            return {
                ...prev,
                social_auth: {
                    ...current,
                    providers: {
                        ...current.providers,
                        [provider]: { ...current.providers[provider], ...updates }
                    }
                }
            };
        });
    };

    const toggleProviderRole = (provider: AuthProviderKey, role: UserRole) => {
        const currentRoles = normalizeAllowRoles(config.social_auth?.providers?.[provider]?.allow_roles);
        const roleKey = normalizeRoleValue(role);
        const next = currentRoles.some((r) => normalizeRoleValue(r) === roleKey)
            ? currentRoles.filter((r) => normalizeRoleValue(r) !== roleKey)
            : [...currentRoles, role];
        updateProvider(provider, { allow_roles: normalizeAllowRoles(next) });
    };

    const openBrandLogoPicker = () => {
        setProviderLogoPicker(null);
        setLogoPickerOpen(true);
    };

    const openProviderLogoPicker = (provider: AuthProviderKey) => {
        setProviderLogoPicker(provider);
        setLogoPickerOpen(true);
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
    const socialConfig = config.social_auth || defaultSocialConfig;

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
                <button
                    onClick={() => setActiveTab('social')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'social' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                    Social Auth
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
                                <button
                                    type="button"
                                    onClick={openBrandLogoPicker}
                                    className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    <Upload className="w-4 h-4 mr-2 text-gray-500" />
                                    <span className="text-sm">Select from Uploaded Files</span>
                                </button>
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

                    {activeTab === 'social' && (
                        <div className="space-y-6">
                            <div className="space-y-4">
                                <label className="flex items-center space-x-3">
                                    <input
                                        type="checkbox"
                                        checked={socialConfig.enabled}
                                        onChange={(e) => updateSocial({ enabled: e.target.checked })}
                                        className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                    />
                                    <span className="text-sm font-medium text-gray-700">Enable Social Sign-in</span>
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label className="flex items-center space-x-3">
                                        <input
                                            type="checkbox"
                                            checked={socialConfig.login_enabled ?? true}
                                            onChange={(e) => updateSocial({ login_enabled: e.target.checked })}
                                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                        />
                                        <span className="text-sm font-medium text-gray-700">Show on Login</span>
                                    </label>
                                    <label className="flex items-center space-x-3">
                                        <input
                                            type="checkbox"
                                            checked={socialConfig.signup_enabled ?? true}
                                            onChange={(e) => updateSocial({ signup_enabled: e.target.checked })}
                                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                        />
                                        <span className="text-sm font-medium text-gray-700">Show on Signup</span>
                                    </label>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Divider Text</label>
                                    <input
                                        className="w-full border-gray-300 rounded-lg p-2.5"
                                        value={socialConfig.divider_text || ''}
                                        onChange={(e) => updateSocial({ divider_text: e.target.value })}
                                        placeholder="Or continue with"
                                    />
                                </div>
                                <p className="text-xs text-gray-500">
                                    Leave provider secrets blank to keep the existing values.
                                </p>
                            </div>

                            {(['google', 'facebook', 'twitter', 'linkedin'] as AuthProviderKey[]).map((provider) => {
                                const providerConfig = socialConfig.providers[provider];
                                return (
                                    <div key={provider} className="border border-gray-200 rounded-xl p-4 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h4 className="text-sm font-semibold text-gray-900">{providerMeta[provider].label}</h4>
                                                <p className="text-xs text-gray-500">{providerMeta[provider].description}</p>
                                            </div>
                                            <label className="flex items-center space-x-2">
                                                <input
                                                    type="checkbox"
                                                    checked={providerConfig.enabled}
                                                    onChange={(e) => updateProvider(provider, { enabled: e.target.checked })}
                                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                                />
                                                <span className="text-xs font-medium text-gray-600">Enabled</span>
                                            </label>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Client ID</label>
                                                <input
                                                    className="w-full border-gray-300 rounded-lg p-2 text-sm"
                                                    value={providerConfig.client_id || ''}
                                                    onChange={(e) => updateProvider(provider, { client_id: e.target.value })}
                                                    placeholder="Client ID"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Client Secret</label>
                                                <input
                                                    type="password"
                                                    className="w-full border-gray-300 rounded-lg p-2 text-sm"
                                                    value={providerConfig.client_secret || ''}
                                                    onChange={(e) => updateProvider(provider, { client_secret: e.target.value })}
                                                    placeholder="Leave blank to keep"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Scopes</label>
                                                <input
                                                    className="w-full border-gray-300 rounded-lg p-2 text-sm"
                                                    value={providerConfig.scopes || ''}
                                                    onChange={(e) => updateProvider(provider, { scopes: e.target.value })}
                                                    placeholder="space-separated scopes"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Redirect URI (optional)</label>
                                                <input
                                                    className="w-full border-gray-300 rounded-lg p-2 text-sm"
                                                    value={providerConfig.redirect_uri || ''}
                                                    onChange={(e) => updateProvider(provider, { redirect_uri: e.target.value })}
                                                    placeholder="https://api.yoursite.com/api/auth/oauth/{provider}/callback"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Button Label</label>
                                                <input
                                                    className="w-full border-gray-300 rounded-lg p-2 text-sm"
                                                    value={providerConfig.button_label || ''}
                                                    onChange={(e) => updateProvider(provider, { button_label: e.target.value })}
                                                    placeholder={`Continue with ${providerMeta[provider].label}`}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">Label Logo URL</label>
                                                <input
                                                    className="w-full border-gray-300 rounded-lg p-2 text-sm"
                                                    value={providerConfig.label_logo_url || ''}
                                                    onChange={(e) => updateProvider(provider, { label_logo_url: e.target.value })}
                                                    placeholder="https://..."
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            {providerConfig.label_logo_url ? (
                                                <img
                                                    src={providerConfig.label_logo_url}
                                                    alt={`${providerMeta[provider].label} logo`}
                                                    className="w-8 h-8 rounded-full border object-contain bg-white"
                                                />
                                            ) : (
                                                <div className="w-8 h-8 rounded-full border bg-gray-50 flex items-center justify-center text-[10px] font-bold text-gray-500">
                                                    {providerMeta[provider].label.slice(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => openProviderLogoPicker(provider)}
                                                className="inline-flex items-center px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                                            >
                                                <Upload className="w-4 h-4 mr-2 text-gray-500" />
                                                <span className="text-xs">Select from Uploaded Files</span>
                                            </button>
                                            {providerConfig.label_logo_url && (
                                                <button
                                                    type="button"
                                                    onClick={() => updateProvider(provider, { label_logo_url: '' })}
                                                    className="text-xs text-red-600 hover:underline"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <label className="flex items-center space-x-2">
                                                <input
                                                    type="checkbox"
                                                    checked={providerConfig.login_enabled ?? true}
                                                    onChange={(e) => updateProvider(provider, { login_enabled: e.target.checked })}
                                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                                />
                                                <span className="text-xs text-gray-600">Show on Login</span>
                                            </label>
                                            <label className="flex items-center space-x-2">
                                                <input
                                                    type="checkbox"
                                                    checked={providerConfig.signup_enabled ?? true}
                                                    onChange={(e) => updateProvider(provider, { signup_enabled: e.target.checked })}
                                                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                                />
                                                <span className="text-xs text-gray-600">Show on Signup</span>
                                            </label>
                                        </div>

                                        <div>
                                            <p className="text-xs font-medium text-gray-600 mb-2">Allowed Roles (Signup)</p>
                                            <div className="flex flex-wrap gap-3">
                                                {[USER_ROLES.FREELANCER, USER_ROLES.EMPLOYER].map((role) => (
                                                    <label key={`${provider}-${role}`} className="flex items-center space-x-2 text-xs text-gray-600">
                                                        <input
                                                            type="checkbox"
                                                            checked={normalizeAllowRoles(providerConfig.allow_roles || []).includes(role)}
                                                            onChange={() => toggleProviderRole(provider, role)}
                                                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                                        />
                                                        <span>{role === USER_ROLES.FREELANCER ? 'Freelancer' : 'Employer'}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
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

            <FilePickerModal
                isOpen={logoPickerOpen}
                onClose={() => setLogoPickerOpen(false)}
                onSelect={(file) => {
                    if (providerLogoPicker) {
                        updateProvider(providerLogoPicker, { label_logo_url: file.url });
                        showNotification('success', 'Updated', `${providerMeta[providerLogoPicker].label} logo selected.`);
                    } else {
                        updateBranding({ logo_url: file.url });
                        showNotification('success', 'Updated', 'Logo selected.');
                    }
                    setLogoPickerOpen(false);
                    setProviderLogoPicker(null);
                }}
                filterType="image"
                acceptedTypes="image/*"
                role="admin"
                visibility="public"
                allowUpload
                title="Select Logo from Uploaded Files"
            />
        </div>
    );
};

export default AuthPagesManager;

