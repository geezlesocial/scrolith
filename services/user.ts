
import { User, UserProfile, UserSettings } from '../types';

const PROFILE_KEY = 'scrolith_user_profile';
const SETTINGS_KEY = 'scrolith_user_settings';
const USER_KEY = 'scrolith_user'; // Reference key for main user data if stored individually or in session

const DEFAULT_PROFILE: UserProfile = {
    userId: '',
    title: 'New Freelancer',
    bio: 'Tell us about yourself...',
    location: '',
    languages: ['English'],
    skills: [],
    hourlyRate: 0,
    portfolio: [],
    experience: [],
    education: [],
    certifications: []
};

const DEFAULT_SETTINGS: UserSettings = {
    emailNotifications: true,
    inAppNotifications: true,
    marketingEmails: false,
    twoFactorEnabled: false,
    loginAlerts: true
};

export const UserService = {
    // --- Profile Management ---

    getProfile: async (userId: string): Promise<UserProfile> => {
        return new Promise(resolve => {
            setTimeout(() => {
                const stored = localStorage.getItem(`${PROFILE_KEY}_${userId}`);
                if (stored) {
                    resolve(JSON.parse(stored));
                } else {
                    resolve({ ...DEFAULT_PROFILE, userId });
                }
            }, 300);
        });
    },

    updateProfile: async (userId: string, data: Partial<UserProfile>): Promise<UserProfile> => {
        return new Promise(async resolve => {
            const current = await UserService.getProfile(userId);
            const updated = { ...current, ...data };
            localStorage.setItem(`${PROFILE_KEY}_${userId}`, JSON.stringify(updated));
            // Simulate network delay
            setTimeout(() => resolve(updated), 500);
        });
    },

    // --- Settings Management ---

    getSettings: async (userId: string): Promise<UserSettings> => {
        return new Promise(resolve => {
            setTimeout(() => {
                const stored = localStorage.getItem(`${SETTINGS_KEY}_${userId}`);
                resolve(stored ? JSON.parse(stored) : { ...DEFAULT_SETTINGS });
            }, 200);
        });
    },

    updateSettings: async (userId: string, settings: Partial<UserSettings>): Promise<UserSettings> => {
        return new Promise(async resolve => {
            const current = await UserService.getSettings(userId);
            const updated = { ...current, ...settings };
            localStorage.setItem(`${SETTINGS_KEY}_${userId}`, JSON.stringify(updated));
            setTimeout(() => resolve(updated), 400);
        });
    },

    // --- Account Management ---

    changePassword: async (userId: string, oldPass: string, newPass: string): Promise<void> => {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // Mock verification
                if (oldPass === 'wrong') {
                    reject(new Error('Incorrect current password'));
                } else {
                    console.log(`Password changed for user ${userId}`);
                    resolve();
                }
            }, 800);
        });
    },

    updateEmail: async (userId: string, newEmail: string): Promise<void> => {
        return new Promise(resolve => {
            setTimeout(() => {
                console.log(`Email updated to ${newEmail} for user ${userId}`);
                resolve();
            }, 600);
        });
    },

    updateCredentials: async (userId: string, data: { name?: string, email?: string, username?: string, password?: string }): Promise<User> => {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                // In a real app, this would hit the API to update the user record
                // For mock, we can try to update local storage user if it matches ID, or just simulate success
                const storedUserStr = localStorage.getItem(USER_KEY);
                if (storedUserStr) {
                    const storedUser = JSON.parse(storedUserStr);
                    if (storedUser.id === userId) {
                        const updatedUser = { ...storedUser, ...data };
                        // Don't store password in local storage object usually, but for mock consistency
                        delete (updatedUser as any).password; 
                        localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
                        resolve(updatedUser);
                        return;
                    }
                }
                resolve({ id: userId, ...data } as User); // Fallback mock return
            }, 800);
        });
    }
};
