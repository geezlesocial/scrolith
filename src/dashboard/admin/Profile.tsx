import React, { useEffect, useState } from 'react';
import { Camera, Lock, LogOut, Mail, Save, User } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import FilePickerModal from '../shared/FilePickerModal';
import { AdminService } from '../../services/admin';
import type { UploadedFile } from '../../types';

const DEFAULT_ADMIN_AVATAR = 'https://scrolith.com/icon-192.png';

const Profile = () => {
  const { user, updateAdminProfile, getAdminProfile, logout, updateUser } = useUser();
  const { showNotification } = useNotification();
  const currentProfile =
    (typeof getAdminProfile === 'function' ? getAdminProfile() : null) || {
      username: user?.username || user?.name || '',
      email: user?.email || '',
      password: '',
      avatar: user?.avatar || DEFAULT_ADMIN_AVATAR,
      profilePhotoFileId: user?.profilePhotoFileId || null
    };

  const [isSaving, setIsSaving] = useState(false);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(
    user?.avatar || currentProfile?.avatar || DEFAULT_ADMIN_AVATAR
  );
  const [avatarFileId, setAvatarFileId] = useState<string | null>(
    user?.profilePhotoFileId || currentProfile?.profilePhotoFileId || null
  );
  const [formData, setFormData] = useState({
    username: currentProfile.username || '',
    email: currentProfile.email || '',
    password: '',
    confirmPassword: ''
  });

  useEffect(() => {
    setAvatarPreview(user?.avatar || currentProfile?.avatar || DEFAULT_ADMIN_AVATAR);
    setAvatarFileId(user?.profilePhotoFileId || currentProfile?.profilePhotoFileId || null);
    setFormData((prev) => ({
      ...prev,
      username: currentProfile.username || user?.username || user?.name || '',
      email: currentProfile.email || user?.email || ''
    }));
  }, [
    currentProfile?.avatar,
    currentProfile?.email,
    currentProfile?.profilePhotoFileId,
    currentProfile?.username,
    user?.avatar,
    user?.email,
    user?.name,
    user?.profilePhotoFileId,
    user?.username
  ]);

  const handleAvatarSelect = (file: UploadedFile) => {
    setAvatarPreview(file.url);
    setAvatarFileId(file.id || null);
    setIsFilePickerOpen(false);
  };

  const handleSave = async () => {
    if (isSaving) return;
    if (formData.password && formData.password !== formData.confirmPassword) {
      showNotification('alert', 'Profile', 'Passwords do not match.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        username: formData.username.trim(),
        email: formData.email.trim(),
        ...(formData.password ? { password: formData.password } : {}),
        avatar: avatarPreview,
        profilePhotoFileId: avatarFileId || undefined
      };
      const result = await AdminService.updateProfile(payload);
      const savedProfile = (result && ((result as any).data || result)) || payload;

      if (typeof updateAdminProfile === 'function') {
        updateAdminProfile(savedProfile);
      }
      if (typeof updateUser === 'function') {
        updateUser({
          name: payload.username,
          username: payload.username,
          email: payload.email,
          avatar: payload.avatar,
          profilePhotoFileId: avatarFileId || undefined
        });
      }
      setFormData((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      showNotification('success', 'Profile Updated', 'Admin profile changes have been saved.');
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Unable to save admin profile.';
      showNotification('alert', 'Save Failed', String(message));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Admin Profile</h2>
            <p className="mt-1 text-sm text-gray-500">Manage your administrator identity and security details.</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex w-full items-center justify-center rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 sm:w-auto"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign Out
          </button>
        </div>

        <div className="grid gap-8 p-4 sm:p-6 md:grid-cols-[14rem,1fr] md:p-8">
          <div className="flex flex-col items-center rounded-2xl border border-gray-100 bg-gray-50 p-5 text-center">
            <button
              type="button"
              className="group relative h-32 w-32 overflow-hidden rounded-full border-4 border-white bg-gray-200 shadow-lg"
              onClick={() => setIsFilePickerOpen(true)}
              aria-label="Change admin profile photo"
            >
              <img src={avatarPreview || DEFAULT_ADMIN_AVATAR} alt="Admin" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition group-hover:opacity-100">
                <Camera className="h-8 w-8 text-white" />
              </span>
            </button>
            <p className="mt-4 text-sm font-semibold text-gray-900">{formData.username || 'Administrator'}</p>
            <p className="text-xs text-gray-500">{formData.email}</p>
            <button
              type="button"
              onClick={() => setIsFilePickerOpen(true)}
              className="mt-4 rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-blue-600 hover:bg-white"
            >
              Change Photo
            </button>
          </div>

          <div className="space-y-6">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Display Name</span>
              <span className="relative block">
                <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={formData.username}
                  onChange={(event) => setFormData((prev) => ({ ...prev, username: event.target.value }))}
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Email Address</span>
              <span className="relative block">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  className="w-full rounded-xl border border-gray-300 py-3 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={formData.email}
                  onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
                />
              </span>
            </label>

            <div className="rounded-2xl border border-gray-100 p-4">
              <h3 className="mb-4 flex items-center text-sm font-bold text-gray-900">
                <Lock className="mr-2 h-4 w-4" /> Security
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700">New Password</span>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    value={formData.password}
                    onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
                    autoComplete="new-password"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700">Confirm Password</span>
                  <input
                    type="password"
                    className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    value={formData.confirmPassword}
                    onChange={(event) => setFormData((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                    autoComplete="new-password"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                <Save className="mr-2 h-4 w-4" /> {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <FilePickerModal
        isOpen={isFilePickerOpen}
        onClose={() => setIsFilePickerOpen(false)}
        onSelect={handleAvatarSelect}
        acceptedTypes="image/*"
        filterType="image"
        title="Update Profile Photo"
        role="admin"
      />
    </div>
  );
};

export default Profile;
