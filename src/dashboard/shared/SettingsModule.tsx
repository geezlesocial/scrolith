
import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '../../context/UserContext';
import { UserService } from '../../services/user';
import { NotificationService, type QuietHourRule } from '../../services/notifications';
import { useNotification } from '../../context/NotificationContext';
import { useCurrency } from '../../context/CurrencyContext';
import { UserSettings } from '../../types';
import { Bell, Lock, Globe, Shield, Save, Moon, Sun, Smartphone, Mail, AlertTriangle, Eye, EyeOff, Loader2, Fingerprint, Users, MessageCircle, Heart, Gauge } from 'lucide-react';
import { usePerformanceProfile } from '../../hooks/usePerformanceProfile';
import {
    authenticateBiometrics,
    checkBiometrics,
    getBiometricPreference,
    getBiometryLabel,
    isNativePlatform,
    setBiometricPreference
} from '../../mobile/biometrics';
import LanguageMultiSelect from '../../components/language/LanguageMultiSelect';
import { LanguagePreferencesService, type UserLanguagePreferences } from '../../services/languagePreferences';
import { listOnboardingLanguages } from '../../utils/supportedLanguages';

const normalizeSettings = (value: UserSettings): UserSettings => ({
    email_notifications: value.emailNotifications ?? value.email_notifications ?? true,
    in_app_notifications: value.inAppNotifications ?? value.in_app_notifications ?? true,
    message_requests_notifications:
        value.messageRequestsNotifications ?? value.message_requests_notifications ?? true,
    allow_in_mail: value.allowInMail ?? value.allow_in_mail ?? true,
    mention_notifications: value.mentionNotifications ?? value.notifyMentions ?? value.notify_mentions ?? value.mention_notifications ?? true,
    followed_post_notifications:
        value.followedPostNotifications ??
        value.notifyFollowedPosts ??
        value.notify_followed_posts ??
        value.followed_post_notifications ??
        true,
    follow_notifications:
        value.followNotifications ??
        value.notifyFollowedYou ??
        value.notify_followed_you ??
        value.follow_notifications ??
        true,
    comment_notifications:
        value.commentNotifications ??
        value.notifyCommentsOnPosts ??
        value.notify_comments_on_posts ??
        value.comment_notifications ??
        true,
    reaction_notifications:
        value.reactionNotifications ??
        value.notifyReactionsOnPosts ??
        value.notify_reactions_on_posts ??
        value.reaction_notifications ??
        true,
    repost_notifications:
        value.repostNotifications ??
        value.notifyReposts ??
        value.notify_reposts ??
        value.repost_notifications ??
        true,
    job_application_notifications:
        value.jobApplicationNotifications ??
        value.notifyJobApplications ??
        value.notify_job_applications ??
        value.job_application_notifications ??
        true,
    application_update_notifications:
        value.applicationUpdateNotifications ??
        value.notifyApplicationUpdates ??
        value.notify_application_updates ??
        value.application_update_notifications ??
        true,
    notify_mentions: value.notifyMentions ?? value.notify_mentions ?? value.mentionNotifications ?? value.mention_notifications ?? true,
    notify_followed_posts:
        value.notifyFollowedPosts ??
        value.notify_followed_posts ??
        value.followedPostNotifications ??
        value.followed_post_notifications ??
        true,
    notify_followed_you:
        value.notifyFollowedYou ??
        value.notify_followed_you ??
        value.followNotifications ??
        value.follow_notifications ??
        true,
    notify_comments_on_posts:
        value.notifyCommentsOnPosts ??
        value.notify_comments_on_posts ??
        value.commentNotifications ??
        value.comment_notifications ??
        true,
    notify_reactions_on_posts:
        value.notifyReactionsOnPosts ??
        value.notify_reactions_on_posts ??
        value.reactionNotifications ??
        value.reaction_notifications ??
        true,
    notify_reposts: value.notifyReposts ?? value.notify_reposts ?? value.repostNotifications ?? value.repost_notifications ?? true,
    notify_job_applications:
        value.notifyJobApplications ??
        value.notify_job_applications ??
        value.jobApplicationNotifications ??
        value.job_application_notifications ??
        true,
    notify_application_updates:
        value.notifyApplicationUpdates ??
        value.notify_application_updates ??
        value.applicationUpdateNotifications ??
        value.application_update_notifications ??
        true,
    marketing_emails: value.marketingEmails ?? value.marketing_emails ?? true,
    two_factor_enabled: value.twoFactorEnabled ?? value.two_factor_enabled ?? false,
    login_alerts: value.loginAlerts ?? value.login_alerts ?? true,
    emailNotifications: value.emailNotifications ?? value.email_notifications ?? true,
    inAppNotifications: value.inAppNotifications ?? value.in_app_notifications ?? true,
    messageRequestsNotifications:
        value.messageRequestsNotifications ?? value.message_requests_notifications ?? true,
    allowInMail: value.allowInMail ?? value.allow_in_mail ?? true,
    mentionNotifications: value.mentionNotifications ?? value.notifyMentions ?? value.notify_mentions ?? value.mention_notifications ?? true,
    followedPostNotifications:
        value.followedPostNotifications ??
        value.notifyFollowedPosts ??
        value.notify_followed_posts ??
        value.followed_post_notifications ??
        true,
    followNotifications:
        value.followNotifications ??
        value.notifyFollowedYou ??
        value.notify_followed_you ??
        value.follow_notifications ??
        true,
    commentNotifications:
        value.commentNotifications ??
        value.notifyCommentsOnPosts ??
        value.notify_comments_on_posts ??
        value.comment_notifications ??
        true,
    reactionNotifications:
        value.reactionNotifications ??
        value.notifyReactionsOnPosts ??
        value.notify_reactions_on_posts ??
        value.reaction_notifications ??
        true,
    repostNotifications:
        value.repostNotifications ??
        value.notifyReposts ??
        value.notify_reposts ??
        value.repost_notifications ??
        true,
    jobApplicationNotifications:
        value.jobApplicationNotifications ??
        value.notifyJobApplications ??
        value.notify_job_applications ??
        value.job_application_notifications ??
        true,
    applicationUpdateNotifications:
        value.applicationUpdateNotifications ??
        value.notifyApplicationUpdates ??
        value.notify_application_updates ??
        value.application_update_notifications ??
        true,
    notifyMentions: value.notifyMentions ?? value.notify_mentions ?? value.mentionNotifications ?? value.mention_notifications ?? true,
    notifyFollowedPosts:
        value.notifyFollowedPosts ??
        value.notify_followed_posts ??
        value.followedPostNotifications ??
        value.followed_post_notifications ??
        true,
    notifyFollowedYou:
        value.notifyFollowedYou ??
        value.notify_followed_you ??
        value.followNotifications ??
        value.follow_notifications ??
        true,
    notifyCommentsOnPosts:
        value.notifyCommentsOnPosts ??
        value.notify_comments_on_posts ??
        value.commentNotifications ??
        value.comment_notifications ??
        true,
    notifyReactionsOnPosts:
        value.notifyReactionsOnPosts ??
        value.notify_reactions_on_posts ??
        value.reactionNotifications ??
        value.reaction_notifications ??
        true,
    notifyReposts: value.notifyReposts ?? value.notify_reposts ?? value.repostNotifications ?? value.repost_notifications ?? true,
    notifyJobApplications:
        value.notifyJobApplications ??
        value.notify_job_applications ??
        value.jobApplicationNotifications ??
        value.job_application_notifications ??
        true,
    notifyApplicationUpdates:
        value.notifyApplicationUpdates ??
        value.notify_application_updates ??
        value.applicationUpdateNotifications ??
        value.application_update_notifications ??
        true,
    marketingEmails: value.marketingEmails ?? value.marketing_emails ?? true,
    twoFactorEnabled: value.twoFactorEnabled ?? value.two_factor_enabled ?? false,
    loginAlerts: value.loginAlerts ?? value.login_alerts ?? true
});

const SettingsModule = () => {
    const { user, updateUser } = useUser();
    const { showNotification } = useNotification();
    const { currency, setCurrency, availableCurrencies } = useCurrency();
    const { profile, userDataSaver, setUserDataSaver } = usePerformanceProfile();
    const [activeSection, setActiveSection] = useState<'notifications' | 'security' | 'account'>('notifications');
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);
    const [quietHours, setQuietHours] = useState<QuietHourRule[]>([]);
    const [savingQuietHours, setSavingQuietHours] = useState(false);
    const [quietHourForm, setQuietHourForm] = useState({
        label: '',
        channel: 'PUSH' as 'ALL' | 'IN_APP' | 'PUSH' | 'EMAIL',
        timezone: '',
        startTime: '22:00',
        endTime: '07:00',
        daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as string[]
    });
    
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
    const [biometricsEnabled, setBiometricsEnabled] = useState(false);
    const [biometricsAvailable, setBiometricsAvailable] = useState(false);
    const [biometryLabel, setBiometryLabel] = useState('Biometric');
    const [biometricsBusy, setBiometricsBusy] = useState(false);
    const [langPrefs, setLangPrefs] = useState<UserLanguagePreferences | null>(null);
    const [langSaving, setLangSaving] = useState(false);
    const onboardingLanguages = useMemo(() => listOnboardingLanguages(), []);

    const preferenceKey = useMemo(() => ({
        language: 'Scrolith.pref.language',
        timezone: 'Scrolith.pref.timezone',
        theme: 'Scrolith.pref.theme',
        profileVisibility: 'Scrolith.pref.profileVisibility'
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
                        mention_notifications: true,
                        followed_post_notifications: true,
                        follow_notifications: true,
                        comment_notifications: true,
                        reaction_notifications: true,
                        repost_notifications: true,
                        job_application_notifications: true,
                        application_update_notifications: true,
                        notify_mentions: true,
                        notify_followed_posts: true,
                        notify_followed_you: true,
                        notify_comments_on_posts: true,
                        notify_reactions_on_posts: true,
                        notify_reposts: true,
                        notify_job_applications: true,
                        notify_application_updates: true,
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
        if (!user) return;
        let mounted = true;
        const loadQuietHours = async () => {
            try {
                const rows = await NotificationService.getQuietHours();
                if (!mounted) return;
                setQuietHours(Array.isArray(rows) ? rows : []);
                setQuietHourForm((current) => ({
                    ...current,
                    timezone: current.timezone || user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
                }));
            } catch (error: any) {
                if (mounted) {
                    showNotification('alert', 'Quiet Hours Load Failed', error?.message || 'Unable to load quiet hours.');
                }
            }
        };
        void loadQuietHours();
        return () => {
            mounted = false;
        };
    }, [user?.id]);

    useEffect(() => {
        setEmail(user?.email || '');
    }, [user?.email]);

    useEffect(() => {
        void LanguagePreferencesService.getMine()
            .then((prefs) => setLangPrefs(prefs))
            .catch(() => null);

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
        setBiometricsEnabled(getBiometricPreference());
        if (!isNativePlatform()) {
            setBiometricsAvailable(false);
            return;
        }
        let mounted = true;
        const check = async () => {
            const info = await checkBiometrics();
            if (!mounted) return;
            setBiometricsAvailable(info.available);
            setBiometryLabel(getBiometryLabel(info.biometryType));
            if (!info.available) {
                setBiometricsEnabled(false);
                setBiometricPreference(false);
            }
        };
        void check();
        return () => {
            mounted = false;
        };
    }, []);

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

    const toggleQuietHourDay = (day: string) => {
        setQuietHourForm((current) => {
            const exists = current.daysOfWeek.includes(day);
            return {
                ...current,
                daysOfWeek: exists
                    ? current.daysOfWeek.filter((entry) => entry !== day)
                    : current.daysOfWeek.concat(day)
            };
        });
    };

    const handleCreateQuietHour = async () => {
        try {
            setSavingQuietHours(true);
            const created = await NotificationService.createQuietHour({
                label: quietHourForm.label || null,
                channel: quietHourForm.channel,
                timezone: quietHourForm.timezone || null,
                daysOfWeek: quietHourForm.daysOfWeek,
                startTime: quietHourForm.startTime,
                endTime: quietHourForm.endTime
            });
            setQuietHours((current) => [created, ...current]);
            setQuietHourForm((current) => ({
                ...current,
                label: ''
            }));
            showNotification('success', 'Quiet Hours Updated', 'Your quiet-hour rule was added.');
        } catch (error: any) {
            showNotification('alert', 'Quiet Hours Failed', error?.message || 'Failed to save quiet-hour rule.');
        } finally {
            setSavingQuietHours(false);
        }
    };

    const handleDeleteQuietHour = async (id: string) => {
        try {
            setSavingQuietHours(true);
            await NotificationService.deleteQuietHour(id);
            setQuietHours((current) => current.filter((rule) => rule.id !== id));
            showNotification('success', 'Quiet Hours Updated', 'The quiet-hour rule was removed.');
        } catch (error: any) {
            showNotification('alert', 'Quiet Hours Failed', error?.message || 'Failed to remove quiet-hour rule.');
        } finally {
            setSavingQuietHours(false);
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

    const handleBiometricToggle = async () => {
        if (biometricsBusy) return;
        if (!isNativePlatform()) {
            showNotification('alert', 'Biometrics Unavailable', 'Biometric unlock is available in the mobile app only.');
            return;
        }

        const enabling = !biometricsEnabled;
        setBiometricsBusy(true);

        if (enabling) {
            const info = await checkBiometrics();
            if (!info.available) {
                setBiometricsAvailable(false);
                setBiometricsEnabled(false);
                setBiometricPreference(false);
                showNotification('alert', 'Biometrics Unavailable', 'Your device does not support biometric authentication.');
                setBiometricsBusy(false);
                return;
            }

            setBiometryLabel(getBiometryLabel(info.biometryType));
            const auth = await authenticateBiometrics(`Enable ${getBiometryLabel(info.biometryType)} on this device`);
            if (auth.ok) {
                setBiometricsEnabled(true);
                setBiometricPreference(true);
                showNotification('success', 'Biometrics Enabled', `${getBiometryLabel(info.biometryType)} is now required to unlock the app.`);
            } else {
                setBiometricsEnabled(false);
                setBiometricPreference(false);
                showNotification('alert', 'Biometric Setup Failed', auth.error || 'Unable to enable biometrics.');
            }
        } else {
            setBiometricsEnabled(false);
            setBiometricPreference(false);
            showNotification('success', 'Biometrics Disabled', 'Biometric unlock has been turned off on this device.');
        }

        window.dispatchEvent(new Event('Scrolith:biometric_pref_changed'));
        setBiometricsBusy(false);
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
                                            <div className="p-2 bg-indigo-50 rounded-lg mr-4 text-indigo-600"><Bell className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">@Mention Notifications</p>
                                                <p className="text-xs text-gray-500">Notify me when someone mentions me in posts or comments.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={Boolean(settings.notifyMentions)} onChange={() => handleToggle('notifyMentions')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-sky-50 rounded-lg mr-4 text-sky-600"><Users className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">Follow Notifications</p>
                                                <p className="text-xs text-gray-500">Notify me when someone starts following me.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={Boolean(settings.notifyFollowedYou)} onChange={() => handleToggle('notifyFollowedYou')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-sky-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-cyan-50 rounded-lg mr-4 text-cyan-600"><Bell className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">Following Posted</p>
                                                <p className="text-xs text-gray-500">Notify me when people I follow publish new posts.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={Boolean(settings.notifyFollowedPosts)} onChange={() => handleToggle('notifyFollowedPosts')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-emerald-50 rounded-lg mr-4 text-emerald-600"><MessageCircle className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">Comment Notifications</p>
                                                <p className="text-xs text-gray-500">Notify me when someone comments on my posts.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={Boolean(settings.notifyCommentsOnPosts)} onChange={() => handleToggle('notifyCommentsOnPosts')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-rose-50 rounded-lg mr-4 text-rose-600"><Heart className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">Reaction Notifications</p>
                                                <p className="text-xs text-gray-500">Notify me when someone reacts to my posts.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={Boolean(settings.notifyReactionsOnPosts)} onChange={() => handleToggle('notifyReactionsOnPosts')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-rose-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-600"></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-amber-50 rounded-lg mr-4 text-amber-600"><AlertTriangle className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">Repost Notifications</p>
                                                <p className="text-xs text-gray-500">Notify me when someone reposts my content.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={Boolean(settings.notifyReposts)} onChange={() => handleToggle('notifyReposts')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-violet-50 rounded-lg mr-4 text-violet-600"><Users className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">New Application Alerts</p>
                                                <p className="text-xs text-gray-500">Notify me when freelancers apply to my jobs.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={Boolean(settings.notifyJobApplications)} onChange={() => handleToggle('notifyJobApplications')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-violet-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-purple-50 rounded-lg mr-4 text-purple-600"><MessageCircle className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">Application Update Alerts</p>
                                                <p className="text-xs text-gray-500">Notify me when my applications are opened, updated, shortlisted, or scheduled for interview.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={Boolean(settings.notifyApplicationUpdates)} onChange={() => handleToggle('notifyApplicationUpdates')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-blue-50 rounded-lg mr-4 text-blue-600"><MessageCircle className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">Message Requests</p>
                                                <p className="text-xs text-gray-500">Allow others to send you message request notifications.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={Boolean(settings.messageRequestsNotifications)} onChange={() => handleToggle('messageRequestsNotifications')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>

                                    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
                                        <div className="flex items-center">
                                            <div className="p-2 bg-slate-50 rounded-lg mr-4 text-slate-700"><Mail className="w-5 h-5"/></div>
                                            <div>
                                                <p className="font-medium text-gray-900">InMail Messages</p>
                                                <p className="text-xs text-gray-500">Allow others to send you InMail messages.</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" checked={Boolean(settings.allowInMail)} onChange={() => handleToggle('allowInMail')} className="sr-only peer" disabled={savingSettings} />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-slate-700"></div>
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

                                    <div className="rounded-xl border border-gray-200 p-4">
                                        <div className="flex items-start gap-4">
                                            <div className="p-2 bg-slate-50 rounded-lg text-slate-700"><Moon className="w-5 h-5" /></div>
                                            <div className="flex-1 space-y-4">
                                                <div>
                                                    <p className="font-medium text-gray-900">Quiet Hours</p>
                                                    <p className="text-xs text-gray-500">Pause push, email, or all journey-driven notifications during selected hours.</p>
                                                </div>
                                                <div className="grid gap-2 md:grid-cols-2">
                                                    <input
                                                        value={quietHourForm.label}
                                                        onChange={(event) => setQuietHourForm((current) => ({ ...current, label: event.target.value }))}
                                                        placeholder="Rule label"
                                                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                                    />
                                                    <select
                                                        value={quietHourForm.channel}
                                                        onChange={(event) => setQuietHourForm((current) => ({ ...current, channel: event.target.value as any }))}
                                                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                                    >
                                                        <option value="PUSH">Push</option>
                                                        <option value="EMAIL">Email</option>
                                                        <option value="IN_APP">In-app</option>
                                                        <option value="ALL">All channels</option>
                                                    </select>
                                                    <input
                                                        value={quietHourForm.timezone}
                                                        onChange={(event) => setQuietHourForm((current) => ({ ...current, timezone: event.target.value }))}
                                                        placeholder="Timezone"
                                                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                                    />
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <input
                                                            type="time"
                                                            value={quietHourForm.startTime}
                                                            onChange={(event) => setQuietHourForm((current) => ({ ...current, startTime: event.target.value }))}
                                                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                                        />
                                                        <input
                                                            type="time"
                                                            value={quietHourForm.endTime}
                                                            onChange={(event) => setQuietHourForm((current) => ({ ...current, endTime: event.target.value }))}
                                                            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'].map((day) => (
                                                        <button
                                                            key={day}
                                                            type="button"
                                                            onClick={() => toggleQuietHourDay(day)}
                                                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                                                quietHourForm.daysOfWeek.includes(day)
                                                                    ? 'bg-indigo-600 text-white'
                                                                    : 'bg-gray-100 text-gray-600'
                                                            }`}
                                                        >
                                                            {day.slice(0, 3)}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={handleCreateQuietHour}
                                                        disabled={savingQuietHours}
                                                        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                                                    >
                                                        {savingQuietHours ? 'Saving...' : 'Add Quiet Hour'}
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    {quietHours.map((rule) => (
                                                        <div key={rule.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                                                            <div>
                                                                <div className="font-medium text-gray-900">{rule.label || 'Quiet Hour Rule'}</div>
                                                                <div className="text-xs text-gray-500">
                                                                    {rule.channel} · {(rule.daysOfWeek || []).length ? rule.daysOfWeek.join(', ') : 'All days'}
                                                                    {' · '}
                                                                    {rule.startMinute !== undefined ? `${String(Math.floor(rule.startMinute / 60)).padStart(2, '0')}:${String(rule.startMinute % 60).padStart(2, '0')}` : '--:--'}
                                                                    {' to '}
                                                                    {rule.endMinute !== undefined ? `${String(Math.floor(rule.endMinute / 60)).padStart(2, '0')}:${String(rule.endMinute % 60).padStart(2, '0')}` : '--:--'}
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteQuietHour(rule.id)}
                                                                className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
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
                                            <h4 className="font-bold text-gray-900 flex items-center">
                                                <Fingerprint className="w-4 h-4 mr-2 text-indigo-600" />
                                                {biometryLabel} Unlock
                                            </h4>
                                            <p className="text-sm text-gray-500 mt-1">
                                                Require biometric verification to unlock the Scrolith mobile app.
                                            </p>
                                            {!isNativePlatform() && (
                                                <p className="text-xs text-gray-400 mt-1">Available on the mobile app only.</p>
                                            )}
                                            {isNativePlatform() && !biometricsAvailable && (
                                                <p className="text-xs text-red-500 mt-1">No biometric hardware detected on this device.</p>
                                            )}
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={biometricsEnabled}
                                                onChange={handleBiometricToggle}
                                                className="sr-only peer"
                                                disabled={biometricsBusy || !isNativePlatform() || !biometricsAvailable}
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
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

                                <div className="mb-8 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                                    <div className="mb-4 flex items-start gap-3">
                                        <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
                                            <Globe className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold text-slate-900">Language &amp; Translation</h3>
                                            <p className="mt-1 text-xs text-slate-500">
                                                Languages you understand guide translation suggestions. This is not nationality, location, or interface language.
                                            </p>
                                        </div>
                                    </div>
                                    <LanguageMultiSelect
                                        value={langPrefs?.understoodLanguages || []}
                                        onChange={(codes) =>
                                            setLangPrefs((prev) => ({
                                                understoodLanguages: codes,
                                                preferredTranslationLanguage: prev?.preferredTranslationLanguage || 'en',
                                                languageSuggestionsEnabled: prev?.languageSuggestionsEnabled !== false,
                                                autoTranslateEnabled: Boolean(prev?.autoTranslateEnabled),
                                                languagePreferencesConfirmed: Boolean(prev?.languagePreferencesConfirmed),
                                                languagePreferencesUpdatedAt: prev?.languagePreferencesUpdatedAt || null
                                            }))
                                        }
                                        languages={onboardingLanguages}
                                        min={1}
                                        max={24}
                                    />
                                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                        <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                                            <span>Translation suggestions</span>
                                            <input
                                                type="checkbox"
                                                checked={langPrefs?.languageSuggestionsEnabled !== false}
                                                onChange={(e) =>
                                                    setLangPrefs((prev) =>
                                                        prev
                                                            ? { ...prev, languageSuggestionsEnabled: e.target.checked }
                                                            : prev
                                                    )
                                                }
                                            />
                                        </label>
                                        <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                                            <span>Auto-translate when needed</span>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(langPrefs?.autoTranslateEnabled)}
                                                onChange={(e) =>
                                                    setLangPrefs((prev) =>
                                                        prev ? { ...prev, autoTranslateEnabled: e.target.checked } : prev
                                                    )
                                                }
                                            />
                                        </label>
                                    </div>
                                    <div className="mt-4">
                                        <label className="mb-1 block text-xs font-medium text-slate-600">
                                            Preferred translation language
                                        </label>
                                        <select
                                            className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm"
                                            value={langPrefs?.preferredTranslationLanguage || 'en'}
                                            onChange={(e) =>
                                                setLangPrefs((prev) =>
                                                    prev
                                                        ? { ...prev, preferredTranslationLanguage: e.target.value }
                                                        : prev
                                                )
                                            }
                                        >
                                            {onboardingLanguages
                                                .filter((l) => l.translationSupported)
                                                .map((lang) => (
                                                    <option key={lang.code} value={lang.code}>
                                                        {lang.name}
                                                    </option>
                                                ))}
                                        </select>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={langSaving || !(langPrefs?.understoodLanguages?.length)}
                                        onClick={async () => {
                                            if (!langPrefs) return;
                                            setLangSaving(true);
                                            try {
                                                const saved = await LanguagePreferencesService.updateMine({
                                                    ...langPrefs,
                                                    confirm: true
                                                });
                                                setLangPrefs(saved);
                                                showNotification(
                                                    'success',
                                                    'Language Preferences Saved',
                                                    'Your understood languages were updated.'
                                                );
                                            } catch (error: any) {
                                                showNotification(
                                                    'alert',
                                                    'Save Failed',
                                                    error?.response?.data?.error || error?.message || 'Unable to save.'
                                                );
                                            } finally {
                                                setLangSaving(false);
                                            }
                                        }}
                                        className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                    >
                                        {langSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                        Save language preferences
                                    </button>
                                </div>

                                
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

                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div>
                                            <p className="font-medium text-gray-900 flex items-center">
                                                <Gauge className="mr-2 h-4 w-4 text-indigo-600" />
                                                Data Saver Mode
                                            </p>
                                            <p className="mt-1 text-xs text-gray-600">
                                                Reduces autoplay and media payloads on unstable or low-bandwidth networks.
                                            </p>
                                            <p className="mt-1 text-[11px] text-gray-500">
                                                Live profile: {profile.dataSaver ? 'Data Saver On' : 'Normal'} • Autoplay {profile.autoplayEnabled ? 'On' : 'Off'} • Quality {profile.mediaQuality}
                                            </p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={Boolean(userDataSaver)}
                                                onChange={(event) => setUserDataSaver(event.target.checked)}
                                            />
                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                        </label>
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

