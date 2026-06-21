
import React, { useState, useEffect } from 'react';
import { StaffMember, StaffRole } from '../../types';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import { UserPlus, Edit2, Trash2, Shield, X, Lock, CheckCircle, AlertOctagon, User, Key, Mail, ShieldAlert } from 'lucide-react';

const StaffManagementTab = () => {
    const { user: currentUser } = useUser();
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [roles, setRoles] = useState<StaffRole[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const { showNotification } = useNotification();

    // Extended Form State
    const [currentStaff, setCurrentStaff] = useState<Partial<StaffMember>>({});
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [formErrors, setFormErrors] = useState<{[key: string]: string}>({});

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [s, r] = await Promise.all([AdminService.getStaff(), AdminService.getRoles()]);
            setStaff(s);
            // Sort roles by level (Higher level = higher authority)
            setRoles(r.sort((a, b) => b.level - a.level));
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to load staff data.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAdd = () => {
        setCurrentStaff({
            status: 'active',
            avatar: `https://ui-avatars.com/api/?name=New+Staff&background=random`,
            roleId: roles.find(r => r.level < 100)?.id || '', // Default to non-super admin
            twoFactorEnabled: false,
            forcePasswordReset: true
        });
        setPassword('');
        setConfirmPassword('');
        setFormErrors({});
        setIsModalOpen(true);
    };

    const handleEdit = (member: StaffMember) => {
        // Find user's role object to check levels
        // Assuming Admin is managing, but we can't edit someone with higher or equal role unless Super Admin
        const myRoleLevel = 100; // Mock current user as Super Admin for now since context doesn't store level
        // In real app: const myRoleLevel = roles.find(r => r.id === currentUser.roleId)?.level || 0;

        if (member.roleName === 'Super Admin') {
            showNotification('alert', 'Restricted', 'Super Admin accounts cannot be modified here.');
            return;
        }

        setCurrentStaff({ ...member });
        setPassword(''); // Reset password fields
        setConfirmPassword('');
        setFormErrors({});
        setIsModalOpen(true);
    };

    const validateForm = () => {
        const errors: {[key: string]: string} = {};
        if (!currentStaff.name || currentStaff.name.length < 3) errors.name = "Name must be at least 3 chars";
        if (!currentStaff.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentStaff.email)) errors.email = "Valid email is required";
        if (!currentStaff.username || currentStaff.username.length < 4) errors.username = "Username must be at least 4 chars";
        if (!currentStaff.roleId) errors.roleId = "Role is required";
        
        // Password Validation
        if (!currentStaff.id && !password) errors.password = "Password is required for new accounts";
        if (password && password.length < 8) errors.password = "Password must be at least 8 chars";
        if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match";

        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsSaving(true);
        try {
            const role = roles.find(r => r.id === currentStaff.roleId);
            const staffData: Partial<StaffMember> & { password?: string } = {
                id: currentStaff.id || '',
                name: currentStaff.name!,
                username: currentStaff.username!,
                email: currentStaff.email!,
                roleId: currentStaff.roleId!,
                roleName: role?.name || 'Staff',
                roleLevel: role?.level || 0,
                avatar: currentStaff.avatar || `https://ui-avatars.com/api/?name=${currentStaff.name}&background=random`,
                status: currentStaff.status || 'active',
                twoFactorEnabled: currentStaff.twoFactorEnabled || false,
                forcePasswordReset: currentStaff.forcePasswordReset || false,
                // Only send password if changed
                password: password ? password : undefined 
            };

            const savedStaff = await AdminService.saveStaff(staffData);
            
            showNotification('success', 'Staff Saved', `${savedStaff.name} has been ${currentStaff.id ? 'updated' : 'added'}.`);
            setIsModalOpen(false);
            loadData();
        } catch (error: any) {
            showNotification('alert', 'Save Failed', error.message || 'An unexpected error occurred.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleStatusChange = async (member: StaffMember, newStatus: StaffMember['status']) => {
        if (member.roleName === 'Super Admin') {
            showNotification('alert', 'Restricted', 'Cannot change status of Super Admin.');
            return;
        }
        
        try {
            const updated = { ...member, status: newStatus };
            await AdminService.saveStaff(updated);
            setStaff(prev => prev.map(s => s.id === member.id ? updated : s));
            showNotification('info', 'Status Updated', `${member.name} is now ${newStatus}.`);
        } catch (error) {
            showNotification('alert', 'Error', 'Failed to update status.');
        }
    };

    const handleDelete = async (id: string, roleName: string) => {
        if (roleName === 'Super Admin') {
            showNotification('alert', 'Restricted', 'Cannot delete Super Admin account.');
            return;
        }

        if(confirm("Are you sure you want to remove this staff member? This action cannot be undone.")) {
            try {
                await AdminService.deleteStaff(id);
                setStaff(prev => prev.filter(s => s.id !== id));
                showNotification('success', 'Staff Removed', 'Staff member deleted successfully.');
            } catch (error) {
                showNotification('alert', 'Error', 'Failed to delete staff member.');
            }
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Staff & Permissions</h2>
                    <p className="text-sm text-gray-500">Manage administrative access and roles.</p>
                </div>
                <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center hover:bg-blue-700 transition-colors shadow-sm">
                    <UserPlus className="w-4 h-4 mr-2" /> Add Staff
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4">Staff Member</th>
                            <th className="px-6 py-4">Username</th>
                            <th className="px-6 py-4">Role</th>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">Security</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {isLoading ? (
                            <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading staff data...</td></tr>
                        ) : staff.map(s => (
                            <tr key={s.id} className="hover:bg-gray-50 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex items-center">
                                        <img src={s.avatar} className="w-10 h-10 rounded-full mr-3 border border-gray-200" alt="" />
                                        <div>
                                            <div className="font-bold text-gray-900">{s.name}</div>
                                            <div className="text-xs text-gray-500">{s.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-gray-600 font-mono text-xs">@{s.username || 'unknown'}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                        s.roleLevel && s.roleLevel >= 90 ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                        s.roleLevel && s.roleLevel >= 50 ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                        'bg-gray-50 text-gray-700 border-gray-200'
                                    }`}>
                                        <Shield className="w-3 h-3 mr-1" />
                                        {s.roleName}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <select 
                                        value={s.status}
                                        onChange={(e) => handleStatusChange(s, e.target.value as any)}
                                        disabled={s.roleName === 'Super Admin'}
                                        className={`text-xs font-bold px-2 py-1 rounded border-0 cursor-pointer focus:ring-2 focus:ring-offset-1 transition-colors ${
                                            s.status === 'active' ? 'bg-green-100 text-green-700 focus:ring-green-500' : 
                                            s.status === 'suspended' ? 'bg-red-100 text-red-700 focus:ring-red-500' : 
                                            'bg-gray-100 text-gray-700 focus:ring-gray-500'
                                        } ${s.roleName === 'Super Admin' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <option value="active">Active</option>
                                        <option value="suspended">Suspended</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4">
                                    {s.twoFactorEnabled ? (
                                        <span className="text-green-600 text-xs flex items-center"><CheckCircle className="w-3 h-3 mr-1"/> 2FA On</span>
                                    ) : (
                                        <span className="text-gray-400 text-xs">2FA Off</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    {s.roleName !== 'Super Admin' && (
                                        <>
                                            <button onClick={() => handleEdit(s)} className="text-blue-600 hover:bg-blue-50 p-2 rounded transition-colors" title="Edit Credentials">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDelete(s.id, s.roleName)} className="text-red-600 hover:bg-red-50 p-2 rounded transition-colors" title="Remove Staff">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                    {s.roleName === 'Super Admin' && (
                                        <Lock className="w-4 h-4 text-gray-400 inline-block mr-2" />
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 sticky top-0 z-10">
                            <h3 className="font-bold text-gray-900 flex items-center">
                                {currentStaff.id ? <Edit2 className="w-4 h-4 mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                                {currentStaff.id ? 'Edit Staff Credentials' : 'Add New Staff'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-6">
                            
                            {/* Personal Info */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide border-b pb-2">Personal Details</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                            <input 
                                                type="text" 
                                                className={`w-full pl-9 border rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 ${formErrors.name ? 'border-red-300' : 'border-gray-300'}`}
                                                value={currentStaff.name || ''}
                                                onChange={e => setCurrentStaff({...currentStaff, name: e.target.value})}
                                            />
                                        </div>
                                        {formErrors.name && <p className="text-xs text-red-600 mt-1">{formErrors.name}</p>}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                            <input 
                                                type="email" 
                                                className={`w-full pl-9 border rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500 ${formErrors.email ? 'border-red-300' : 'border-gray-300'}`}
                                                value={currentStaff.email || ''}
                                                onChange={e => setCurrentStaff({...currentStaff, email: e.target.value})}
                                            />
                                        </div>
                                        {formErrors.email && <p className="text-xs text-red-600 mt-1">{formErrors.email}</p>}
                                    </div>
                                </div>
                            </div>

                            {/* Account Credentials */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide border-b pb-2">Login Credentials</h4>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                                    <input 
                                        type="text" 
                                        className={`w-full border rounded-lg p-2.5 bg-gray-50 ${formErrors.username ? 'border-red-300' : 'border-gray-300'}`}
                                        value={currentStaff.username || ''}
                                        onChange={e => setCurrentStaff({...currentStaff, username: e.target.value.replace(/\s+/g, '').toLowerCase()})}
                                    />
                                    {formErrors.username && <p className="text-xs text-red-600 mt-1">{formErrors.username}</p>}
                                </div>

                                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <div className="col-span-2 text-xs text-gray-500 flex items-center mb-1">
                                        <Key className="w-3 h-3 mr-1" />
                                        {currentStaff.id ? 'Leave blank to keep current password' : 'Set initial password'}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                                        <input 
                                            type="password" 
                                            className={`w-full border rounded-lg p-2.5 ${formErrors.password ? 'border-red-300' : 'border-gray-300'}`}
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                        />
                                        {formErrors.password && <p className="text-xs text-red-600 mt-1">{formErrors.password}</p>}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                                        <input 
                                            type="password" 
                                            className={`w-full border rounded-lg p-2.5 ${formErrors.confirmPassword ? 'border-red-300' : 'border-gray-300'}`}
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••"
                                        />
                                        {formErrors.confirmPassword && <p className="text-xs text-red-600 mt-1">{formErrors.confirmPassword}</p>}
                                    </div>
                                    <div className="col-span-2">
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input 
                                                type="checkbox"
                                                checked={currentStaff.forcePasswordReset}
                                                onChange={e => setCurrentStaff({...currentStaff, forcePasswordReset: e.target.checked})}
                                                className="rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">Force password reset on next login</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Permissions & Status */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide border-b pb-2">Access Control</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                        <select 
                                            className={`w-full border rounded-lg p-2.5 ${formErrors.roleId ? 'border-red-300' : 'border-gray-300'}`}
                                            value={currentStaff.roleId || ''}
                                            onChange={e => setCurrentStaff({...currentStaff, roleId: e.target.value})}
                                        >
                                            <option value="">Select a Role</option>
                                            {roles.map(r => (
                                                <option key={r.id} value={r.id} disabled={r.name === 'Super Admin' && !currentStaff.id}>
                                                    {r.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                        <select 
                                            className="w-full border border-gray-300 rounded-lg p-2.5"
                                            value={currentStaff.status || 'active'}
                                            onChange={e => setCurrentStaff({...currentStaff, status: e.target.value as any})}
                                        >
                                            <option value="active">Active</option>
                                            <option value="suspended">Suspended (Blocked)</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input 
                                            type="checkbox"
                                            checked={currentStaff.twoFactorEnabled}
                                            onChange={e => setCurrentStaff({...currentStaff, twoFactorEnabled: e.target.checked})}
                                            className="rounded text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700 font-medium">Require Two-Factor Authentication (2FA)</span>
                                    </label>
                                </div>
                            </div>

                            {/* Warning Footer */}
                            <div className="bg-blue-50 p-4 rounded-lg flex items-start">
                                <AlertOctagon className="w-5 h-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-blue-800">
                                    Changes to roles or status will take effect immediately. If you change a password, the user will be logged out of all active sessions.
                                </p>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">Cancel</button>
                                <button 
                                    type="submit" 
                                    disabled={isSaving}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-lg shadow-blue-600/20 transition-all flex items-center disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? 'Saving...' : 'Update Credentials'}
                                    {!isSaving && <CheckCircle className="w-4 h-4 ml-2" />}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StaffManagementTab;
