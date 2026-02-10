import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Edit2, Copy, Power, Shield } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

type Permission = {
  id: string;
  key: string;
  label: string;
  groupName: string;
};

type PermissionGroup = {
  groupName: string;
  permissions: Permission[];
};

type RbacRole = {
  id: string;
  name: string;
  description?: string;
  isSystemRole?: boolean;
  isActive?: boolean;
  assignedStaffCount?: number;
  permissionsCount?: number;
  permissionKeys?: string[];
};

const RoleManagementTab: React.FC = () => {
  const { showNotification } = useNotification();
  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RbacRole | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

  const broadcastRolesUpdated = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('admin:roles-updated'));
    }
  };

  const groupedPermissionKeys = useMemo(() => {
    const map = new Map<string, string[]>();
    permissionGroups.forEach((group) => {
      map.set(
        group.groupName,
        (group.permissions || []).map((permission) => permission.key)
      );
    });
    return map;
  }, [permissionGroups]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rolesData, permissionsData] = await Promise.all([
        AdminService.getRbacRoles(),
        AdminService.getRbacPermissions()
      ]);
      setRoles(Array.isArray(rolesData) ? rolesData : []);
      setPermissionGroups(Array.isArray(permissionsData?.groups) ? permissionsData.groups : []);
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to load role management data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingRole(null);
    setName('');
    setDescription('');
    setIsActive(true);
    setSelectedPermissions(new Set());
    setModalOpen(true);
  };

  const openEditModal = (role: RbacRole) => {
    setEditingRole(role);
    setName(role.name || '');
    setDescription(role.description || '');
    setIsActive(role.isActive !== false);
    setSelectedPermissions(new Set(role.permissionKeys || []));
    setModalOpen(true);
  };

  const togglePermission = (permissionKey: string) => {
    setSelectedPermissions((previous) => {
      const next = new Set(previous);
      if (next.has(permissionKey)) next.delete(permissionKey);
      else next.add(permissionKey);
      return next;
    });
  };

  const toggleGroup = (groupName: string) => {
    const groupKeys = groupedPermissionKeys.get(groupName) || [];
    const allSelected = groupKeys.length > 0 && groupKeys.every((key) => selectedPermissions.has(key));
    setSelectedPermissions((previous) => {
      const next = new Set(previous);
      if (allSelected) groupKeys.forEach((key) => next.delete(key));
      else groupKeys.forEach((key) => next.add(key));
      return next;
    });
  };

  const saveRole = async (event: React.FormEvent) => {
    event.preventDefault();
    const roleName = String(name || '').trim();
    if (!roleName) {
      showNotification('alert', 'Validation', 'Role name is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: roleName,
        description: String(description || '').trim(),
        isActive,
        permissionKeys: Array.from(selectedPermissions)
      };

      if (editingRole?.id) {
        await AdminService.updateRbacRole(editingRole.id, payload);
        showNotification('success', 'Role Updated', `${roleName} has been updated.`);
      } else {
        await AdminService.createRbacRole(payload);
        showNotification('success', 'Role Created', `${roleName} has been created.`);
      }

      broadcastRolesUpdated();
      setModalOpen(false);
      await loadData();
    } catch (error: any) {
      showNotification('alert', 'Save Failed', error?.message || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  const cloneRole = async (role: RbacRole) => {
    try {
      await AdminService.cloneRbacRole(role.id);
      showNotification('success', 'Role Cloned', `${role.name} was cloned successfully.`);
      broadcastRolesUpdated();
      await loadData();
    } catch (error: any) {
      showNotification('alert', 'Clone Failed', error?.message || 'Failed to clone role');
    }
  };

  const deactivateRole = async (role: RbacRole) => {
    const roleName = role.name || 'this role';
    if (!window.confirm(`Deactivate ${roleName}?`)) return;
    try {
      await AdminService.deactivateRbacRole(role.id);
      showNotification('info', 'Role Deactivated', `${roleName} has been deactivated.`);
      broadcastRolesUpdated();
      await loadData();
    } catch (error: any) {
      showNotification('alert', 'Deactivate Failed', error?.message || 'Failed to deactivate role');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Role Management</h2>
          <p className="text-sm text-gray-500">Create, edit, clone, and deactivate staff roles and permissions.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" /> Add Role
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
            <tr>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Assigned Staff</th>
              <th className="px-6 py-4">Permissions</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  Loading roles...
                </td>
              </tr>
            ) : roles.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No roles found.
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr key={role.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-gray-900 flex items-center">
                      <Shield className="w-4 h-4 mr-2 text-gray-500" />
                      {role.name}
                    </div>
                    <div className="text-xs text-gray-500">{role.description || 'No description'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        role.isActive !== false
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}
                    >
                      {role.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-700">{Number(role.assignedStaffCount || 0)}</td>
                  <td className="px-6 py-4 text-gray-700">{Number(role.permissionsCount || 0)}</td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => openEditModal(role)}
                      className="text-blue-600 hover:bg-blue-50 p-2 rounded transition-colors"
                      title="Edit Role"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => cloneRole(role)}
                      className="text-purple-600 hover:bg-purple-50 p-2 rounded transition-colors"
                      title="Clone Role"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deactivateRole(role)}
                      disabled={role.isSystemRole || role.name?.toLowerCase() === 'admin'}
                      className="text-red-600 hover:bg-red-50 p-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Deactivate Role"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl border border-gray-100 max-h-[92vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <h3 className="font-bold text-gray-900">{editingRole ? 'Edit Role' : 'Create Role'}</h3>
            </div>
            <form onSubmit={saveRole} className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Moderator"
                  />
                </div>
                <div className="flex items-center mt-6">
                  <label className="inline-flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(event) => setIsActive(event.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Role Active</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full border border-gray-300 rounded-lg p-2.5 min-h-20 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Role description"
                />
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-800">Permissions</h4>
                {permissionGroups.map((group) => {
                  const groupKeys = (group.permissions || []).map((permission) => permission.key);
                  const allSelected = groupKeys.length > 0 && groupKeys.every((key) => selectedPermissions.has(key));
                  return (
                    <div key={group.groupName} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-semibold text-gray-800">{group.groupName}</div>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.groupName)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          {allSelected ? 'Clear Group' : 'Select Group'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {group.permissions.map((permission) => (
                          <label key={permission.key} className="inline-flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={selectedPermissions.has(permission.key)}
                              onChange={() => togglePermission(permission.key)}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span>{permission.label}</span>
                            <span className="text-xs text-gray-400">({permission.key})</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving...' : editingRole ? 'Update Role' : 'Create Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoleManagementTab;
