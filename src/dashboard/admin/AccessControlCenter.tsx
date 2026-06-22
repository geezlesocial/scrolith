import React, { useEffect, useState } from 'react';
import { Shield, KeyRound, Users, CheckCircle2 } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

const StatCard = ({ label, value, icon: Icon }: { label: string; value: number | string; icon: any }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <Icon className="h-4 w-4 text-slate-400" />
    </div>
    <div className="mt-3 text-2xl font-semibold text-slate-900">{value}</div>
  </div>
);

const AccessControlCenter: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<any>(null);
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [accessData, rolesData, permissionData] = await Promise.all([
          AdminService.getCurrentAdminAccess(),
          AdminService.getRbacRoles(),
          AdminService.getRbacPermissions()
        ]);
        setAccess(accessData || null);
        setRoles(Array.isArray(rolesData) ? rolesData : []);
        setPermissions(Array.isArray(permissionData?.permissions) ? permissionData.permissions : []);
      } catch (error: any) {
        showNotification('alert', 'Error', error?.message || 'Failed to load access control center');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [showNotification]);

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading access control...</div>;
  }

  const permissionKeys = Array.isArray(access?.permissionKeys) ? access.permissionKeys : [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Active roles" value={roles.filter((role) => role?.isActive !== false).length} icon={Users} />
        <StatCard label="Permission keys" value={permissions.length} icon={KeyRound} />
        <StatCard label="My access" value={permissionKeys.length} icon={Shield} />
        <StatCard label="Role state" value={access?.roleActive ? 'Active' : 'Review'} icon={CheckCircle2} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Current operator context</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Role</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{access?.roleName || 'Unknown'}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Status</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{access?.status || 'Unknown'}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Staff ID</div>
              <div className="mt-1 break-all text-sm font-medium text-slate-900">{access?.staffId || 'Not linked'}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs uppercase tracking-wide text-slate-500">Admin override</div>
              <div className="mt-1 text-sm font-medium text-slate-900">{access?.isAdmin ? 'Enabled' : 'Permission based'}</div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Governance coverage</h2>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li>Role lifecycle is now auditable through governed admin mutations.</li>
            <li>Permission changes remain live without deployment because they resolve from the database.</li>
            <li>Sensitive denies raise searchable security alerts and permission decision logs.</li>
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Effective permission keys</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {permissionKeys.length ? (
            permissionKeys.map((permissionKey: string) => (
              <span key={permissionKey} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {permissionKey}
              </span>
            ))
          ) : (
            <div className="text-sm text-slate-500">No permission keys resolved for this operator.</div>
          )}
        </div>
      </section>
    </div>
  );
};

export default AccessControlCenter;
