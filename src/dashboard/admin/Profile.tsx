
import React, { useState, useEffect } from 'react';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { Save, User, Lock, Mail, Camera, LogOut } from 'lucide-react';
import FilePicker from '../../components/FilePicker';
import { UploadedFile } from '../../types';

const Profile = () => {
    const { user, updateAdminProfile, getAdminProfile, logout, updateUser } = useUser();
    const { showNotification } = useNotification();
    
    // Initialize profile data safely
    const currentProfile = getAdminProfile() || { username: '', email: '', password: '' };

    const [formData, setFormData] = useState({
        username: currentProfile.username || '',
        email: currentProfile.email || '',
        password: currentProfile.password || '',
        confirmPassword: currentProfile.password || ''
    });
    
    // State for image handling
    const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
    const [avatarPreview, setAvatarPreview] = useState(user?.avatar || "https://ui-avatars.com/api/?name=Admin&background=000&color=fff");

    // Sync state when user context updates (e.g. initial load)
    useEffect(() => {
        if(user?.avatar) {
            setAvatarPreview(user.avatar);
        }
    }, [user]);

    const handleSave = () => {
        if (formData.password !== formData.confirmPassword) {
            showNotification('alert', 'Error', 'Passwords do not match.');
            return;
        }
        
        // 1. Update Admin Credentials in LocalStorage
        updateAdminProfile({
            username: formData.username,
            email: formData.email,
            password: formData.password,
            avatar: avatarPreview // Save the new avatar URL
        });

        // 2. Force update User Context to reflect changes in UI immediately
        updateUser({
            name: formData.username,
            email: formData.email,
            avatar: avatarPreview
        });

        showNotification('success', 'Profile Updated', 'Admin credentials have been updated.');
    };
    
    const handleAvatarSelect = (file: UploadedFile) => {
        setAvatarPreview(file.url);
        setIsFilePickerOpen(false);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900">Admin Profile</h2>
                    <button onClick={logout} className="text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center transition-colors">
                        <LogOut className="w-4 h-4 mr-2" /> Sign Out
                    </button>
                </div>
                
                <div className="p-8">
                    <div className="flex flex-col md:flex-row gap-8">
                        {/* Avatar Section */}
                        <div className="flex flex-col items-center space-y-4">
                            <div 
                                className="w-32 h-32 rounded-full bg-gray-200 relative overflow-hidden border-4 border-white shadow-lg group cursor-pointer"
                                onClick={() => setIsFilePickerOpen(true)}
                            >
                                <img src={avatarPreview} alt="Admin" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                            </div>
                            <p className="text-sm text-gray-500">Administrator</p>
                            <button 
                                onClick={() => setIsFilePickerOpen(true)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
                            >
                                Change Photo
                            </button>
                        </div>

                        {/* Form Section */}
                        <div className="flex-1 space-y-6 max-w-lg">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                    <input 
                                        type="text" 
                                        className="w-full pl-10 border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                        value={formData.username}
                                        onChange={e => setFormData({...formData, username: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                                    <input 
                                        type="email" 
                                        className="w-full pl-10 border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                        value={formData.email}
                                        onChange={e => setFormData({...formData, email: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100">
                                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center"><Lock className="w-4 h-4 mr-2" /> Security</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                                        <input 
                                            type="password" 
                                            className="w-full border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            value={formData.password}
                                            onChange={e => setFormData({...formData, password: e.target.value})}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                                        <input 
                                            type="password" 
                                            className="w-full border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                            value={formData.confirmPassword}
                                            onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 flex justify-end">
                                <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all flex items-center">
                                    <Save className="w-4 h-4 mr-2" /> Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <FilePicker 
                isOpen={isFilePickerOpen} 
                onClose={() => setIsFilePickerOpen(false)} 
                onSelect={handleAvatarSelect} 
                acceptedTypes="image/*"
                title="Update Profile Photo"
            />
        </div>
    );
};

export default Profile;
