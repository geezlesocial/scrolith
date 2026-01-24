
import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '../../context/UserContext';
import { UserService } from '../../services/user';
import { useNotification } from '../../context/NotificationContext';
import { useCurrency } from '../../context/CurrencyContext';
import { UserSettings } from '../../types';
import { Bell, Lock, Globe, Shield, Save, Moon, Sun, Smartphone, Mail, AlertTriangle, Eye, EyeOff, Loader2 } from 'lucide-react';

const normalizeSettings = (value: UserSettings): UserSettings => ({
    email_notifications: value.emailNotifications ?? value.email_notifications ?? true,
    in_app_notifications: value.inAppNotifications ?? value.in_app_notifications ?? true,
    marketing_emails: value.marketingEmails ?? value.marketing_emails ?? true,
    two_factor_enabled: value.twoFactorEnabled ?? value.two_factor_enabled ?? false,
    login_alerts: value.loginAlerts ?? value.login_alerts ?? true,
    emailNotifications: value.emailNotifications ?? value.email_notifications ?? true,
    inAppNotifications: value.inAppNotifications ?? value.in_app_notifications ?? true,
    marketingEmails: value.marketingEmails ?? value.marketing_emails ?? true,
    twoFactorEnabled: value.twoFactorEnabled ?? value.two_factor_enabled ?? false,
    loginAlerts: value.loginAlerts ?? value.login_alerts ?? true
});

const SettingsModule = () => {
    const { user, updateUser } = useUser();
    const { showNotification } = useNotification();
    const { currency, setCurrency, availableCurrencies } = useCurrency();
    const [activeSection, setActiveSection] = useState<'notifications' | 'security' | 'account'>('notifications');
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    
    // Security State
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [email, setEmail] = useState('');
    const [emailSaving, setEmailSaving] = useState(false);

    // Visibility State
    const [isProfilePublic, setIsProfilePublic] = useState(true);
    const [language, setLanguage] = useState('English (US)');
    const [timezone, setTimezone] = useState('(GMT-08:00) Pacific Time (US & Canada)');
    const [theme, setTheme] = useState<'light' | 'dark'>('light');

    const preferenceKey = useMemo(() => ({
        language: 'geezle.pref.language',
        timezone: 'geezle.pref.timezone',
        theme: 'geezle.pref.theme',
        profileVisibility: 'geezle.pref.profileVisibility'
    }), []);

    useEffect(() => {
        if (!user) return;
        let mounted = true;

        const load = async () => {
            try {
                setLoading(true);
                const data = await UserService.getMySettings();
                if (mounted) setSettings(normalizeSettings(data));
            } catch (error: any) {
                if (mounted) {
                    showNotification('alert', 'Settings Load Failed', error?.message || 'Unable to load settings.');
                    setSettings(normalizeSettings({
                        email_notifications: true,
                        in_app_notifications: true,
                        marketing_emails: true,
                        two_factor_enabled: false,
                        login_alerts: true
                    }));
                }
            } finally {
                if (mounted) setLoading(false);
            }
        };

        load();
        return () => {
            mounted = false;
        };
    }, [user, showNotification]);

    useEffect(() => {
        setEmail(user?.email || '');
    }, [user?.email]);

    useEffect(() => {
        const storedLanguage = localStorage.getItem(preferenceKey.language);
        const storedTimezone = localStorage.getItem(preferenceKey.timezone);
        const storedTheme = localStorage.getItem(preferenceKey.theme) as 'light' | 'dark' | null;
        const storedVisibility = localStorage.getItem(preferenceKey.profileVisibility);

        if (storedLanguage) setLanguage(storedLanguage);
        if (storedTimezone) setTimezone(storedTimezone);
        if (storedTheme === 'light' || storedTheme === 'dark') setTheme(storedTheme);
        if (storedVisibility) setIsProfilePublic(storedVisibility === 'public');
    }, [preferenceKey]);

    useEffect(() => {
        localStorage.setItem(preferenceKey.language, language);
    }, [language, preferenceKey.language]);

    useEffect(() => {
        localStorage.setItem(preferenceKey.timezone, timezone);
    }, [timezone, preferenceKey.timezone]);

    const handleToggle = async (key: keyof UserSettings) => {
        if (!settings) return;
        const s = settings as unknown as Record<string, any>;
        const newValue = !s[key];
        const newSettings = normalizeSettings({ ...settings, [key]: newValue } as UserSettings);
        setSettings(newSettings);
        setSavingSettings(true);
        try {
            const updated = await UserService.updateMySettings(newSettings);
            setSettings(normalizeSettings(updated));
            showNotification('success', 'Settings Updated', 'Your notification preferences were saved.');
        } catch (error: any) {
            showNotification('alert', 'Update Failed', error?.message || 'Failed to update settings.');
            setSettings(settings);
        } finally {
            setSavingSettings(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            showNotification('alert', 'Error', 'New passwords do not match.');
            return;
        }
        if (!user) return;

        try {
            await UserService.changePassword(user.id, currentPassword, newPassword);
            showNotification('success', 'Success', 'Password updated successfully.');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            showNotification('alert', 'Error', 'Failed to update password. Check current password.');
        }
    };

    const handleEmailChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (!email.trim()) {
            showNotification('alert', 'Error', 'Email cannot be empty.');
            return;
        }
        setEmailSaving(true);
        try {
            await UserService.updateEmail(user.id, email.trim());
            updateUser({ email: email.trim() });
            showNotification('success', 'Email Updated', 'Your login email was updated.');
        } catch (error: any) {
            showNotification('alert', 'Error', error?.message || 'Failed to update email.');
            setEmail(user?.email || '');
        } finally {
            setEmailSaving(false);
        }
    };

    const handleVisibilityToggle = () => {
        const newStatus = !isProfilePublic;
        setIsProfilePublic(newStatus);
        localStorage.setItem(preferenceKey.profileVisibility, newStatus ? 'public' : 'private');
        showNotification(
            'success', 
            newStatus ? 'Profile Visible' : 'Profile Hidden', 
            newStatus ? 'Your account is now visible to the public.' : 'Your account is now private.'
        );
    };

    const handlePreferenceSave = () => {
        localStorage.setItem(preferenceKey.language, language);
        localStorage.setItem(preferenceKey.timezone, timezone);
        localStorage.setItem(preferenceKey.theme, theme);
        showNotification('success', 'Preferences Saved', 'Your preferences were saved on this device.');
    };

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem(preferenceKey.theme, theme);
    }, [theme, preferenceKey.theme]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row min-h-[600px]">
            {/* Sidebar */}
            <div className="w-full md:w-64 bg-gray-50 border-r border-gray-200 p-4">
                <h3 className="font-bold text-gray-900 mb-4 px-2">Account Settings</h3>
                <nav className="space-y-1">
                    <button 
                        onClick={() => setActiveSection('notifications')}
                        className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeSection === 'notifications' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <Bell className="w-4 h-4 mr-3" /> Notifications
                    </button>
                    <button 
                        onClick={() => setActiveSection('security')}
                        className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeSection === 'security' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <Lock className="w-4 h-4 mr-3" /> Security
                    </button>
                    <button 
                        onClick={() => setActiveSection('account')}
                        className={`w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeSection === 'account' ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <Globe className="w-4 h-4 mr-3" /> Preferences
                    </button>
                </nav>
            </div>

            {/* Content */}
            <div className="flex-1 p-8">
                {loading || !settings ? (
                    <div className="h-full flex items-center justify-center text-gray-500">
                        <Loader2 className="w-8 h-8 animate-spin mr-2" /> Loading settings...
                    </div>
                ) : (
                    <>
                        {activeSection === 'notifications' && (
                            <div className="space-y-6 animate-fade-in">
                                <h2 className="text-xl font-bold text-gray-900 mb-6">Notification Preferences</h2>
                                
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-blue-50 rounded-lg mr-4 text-blue-600"><Mail className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">Email Notifications</p>
                                                <p className="text-xs text-gray-500">Receive updates about orders and messages via email.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={settings.emailNotifications} onChange={() => handleToggle('emailNotifications')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-purple-50 rounded-lg mr-4 text-purple-600"><Smartphone className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">Push Notifications</p>
                                                <p className="text-xs text-gray-500">Get real-time alerts on your device.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={settings.inAppNotifications} onChange={() => handleToggle('inAppNotifications')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-green-50 rounded-lg mr-4 text-green-600"><Globe className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">Marketing Emails</p>
                                                <p className="text-xs text-gray-500">Receive tips, trends, and special offers.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={settings.marketingEmails} onChange={() => handleToggle('marketingEmails')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'security' && (
                            <div className="space-y-8 animate-fade-in">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 mb-6">Security Settings</h2>

                                    <form onSubmit={handleEmailChange} className="space-y-4 max-w-md mb-8">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Login Email</label>
                                            <input
                                                type="email"
                                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                            />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={emailSaving}
                                            className="px-4 py-2 bg-gray-900 text-white rounded-lg font-bold hover:bg-gray-800 shadow-sm disabled:opacity-70"
                                        >
                                            {emailSaving ? 'Saving...' : 'Update Email'}
                                        </button>
                                    </form>
                                    
                                    <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                                            <input 
                                                type="password" 
                                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500"
                                                value={currentPassword}
                                                onChange={e => setCurrentPassword(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                                            <input 
                                                type="password" 
                                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500"
                                                value={newPassword}
                                                onChange={e => setNewPassword(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                                            <input 
                                                type="password" 
                                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-indigo-500 focus:border-indigo-500"
                                                value={confirmPassword}
                                                onChange={e => setConfirmPassword(e.target.value)}
                                            />
                                        </div>
                                        <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-sm">
                                            Update Password
                                        </button>
                                    </form>
                                </div>

                                <div className="pt-6 border-t border-gray-200">
                                     <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="font-bold text-gray-900 flex items-center"><Shield className="w-4 h-4 mr-2 text-green-600" /> Two-Factor Authentication</h4>
                                            <p className="text-sm text-gray-500 mt-1">Add an extra layer of security to your account.</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={settings.twoFactorEnabled} onChange={() => handleToggle('twoFactorEnabled')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                                        </label>
                                     </div>
                                </div>

                                <div className="pt-6 border-t border-gray-200">
                                     <div className="flex items-center justify-between">
                                        <div>
                                            <h4 className="font-bold text-gray-900 flex items-center"><AlertTriangle className="w-4 h-4 mr-2 text-orange-600" /> Login Alerts</h4>
                                            <p className="text-sm text-gray-500 mt-1">Get notified of new sign-ins to your account.</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={settings.loginAlerts} onChange={() => handleToggle('loginAlerts')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                                        </label>
                                     </div>
                                </div>
                            </div>
                        )}

                        {activeSection === 'account' && (
                            <div className="space-y-6 animate-fade-in">
                                <h2 className="text-xl font-bold text-gray-900 mb-6">Global Preferences</h2>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
                                        <select className="w-full border border-gray-300 rounded-lg p-2.5" value={language} onChange={(e) => setLanguage(e.target.value)}>
                                            <option>English (US)</option>
                                            <option>Spanish</option>
                                            <option>French</option>
                                            <option>German</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
                                        <select className="w-full border border-gray-300 rounded-lg p-2.5" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                                            <option>(GMT-08:00) Pacific Time (US & Canada)</option>
                                            <option>(GMT-05:00) Eastern Time (US & Canada)</option>
                                            <option>(GMT+00:00) London</option>
                                            <option>(GMT+01:00) Paris</option>
                                            <option>(GMT+05:30) Mumbai</option>
                                            <option>(GMT+08:00) Singapore</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Currency Display</label>
                                        <select 
                                            className="w-full border border-gray-300 rounded-lg p-2.5"
                                            value={currency.code}
                                            onChange={(e) => setCurrency(e.target.value)}
                                        >
                                            {availableCurrencies.map(c => (
                                                <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Theme</label>
                                        <div className="flex gap-4">
                                            <button
                                                type="button"
                                                onClick={() => setTheme('light')}
                                                className={`flex-1 border rounded-lg p-3 flex items-center justify-center font-medium ${
                                                    theme === 'light'
                                                        ? 'bg-gray-50 text-gray-900 border-gray-300 ring-2 ring-indigo-500'
                                                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                                }`}
                                            >
                                                <Sun className="w-4 h-4 mr-2" /> Light
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTheme('dark')}
                                                className={`flex-1 border rounded-lg p-3 flex items-center justify-center font-medium ${
                                                    theme === 'dark'
                                                        ? 'bg-gray-50 text-gray-900 border-gray-300 ring-2 ring-indigo-500'
                                                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                                                }`}
                                            >
                                                <Moon className="w-4 h-4 mr-2" /> Dark
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex justify-end">
                                    <button
                                        onClick={handlePreferenceSave}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-sm inline-flex items-center"
                                        type="button"
                                    >
                                        <Save className="w-4 h-4 mr-2" /> Save Preferences
                                    </button>
                                </div>

                                <div className="pt-6 mt-6 border-t border-gray-200">
                                    <h4 className="font-bold text-gray-900 mb-2">Profile Visibility</h4>
                                    <div className={`flex justify-between items-center p-4 rounded-xl border ${isProfilePublic ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-200'}`}>
                                        <div>
                                            <p className="font-medium text-gray-900 flex items-center">
                                                {isProfilePublic ? <Eye className="w-4 h-4 mr-2 text-green-600"/> : <EyeOff className="w-4 h-4 mr-2 text-gray-500"/>}
                                                {isProfilePublic ? "Public Profile" : "Private Profile"}
                                            </p>
                                            <p className="text-xs text-gray-600 mt-1">
                                                {isProfilePublic 
                                                    ? "Your profile is visible to everyone. You can receive messages and job offers." 
                                                    : "Your profile is hidden. You won't appear in search results."}
                                            </p>
                                        </div>
                                        <button 
                                            onClick={handleVisibilityToggle}
                                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                                                isProfilePublic
                                                ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                                                : 'bg-indigo-600 text-white hover:bg-indigo-700 border border-transparent'
                                            }`}
                                        >
                                            {isProfilePublic ? "Make Private" : "Make Public"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default SettingsModule;
