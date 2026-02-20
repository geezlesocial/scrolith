import React, { useEffect, useState } from 'react';
import { AlertOctagon, CheckCircle } from 'lucide-react';
import { AdminService } from '../../../services/admin';
import type { AnomalyAlert } from '../../../types';
import { useNotification } from '../../../context/NotificationContext';

const AnomalyMonitorSection: React.FC = () => {
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const { showNotification } = useNotification();

  useEffect(() => {
    let cancelled = false;
    AdminService.getAnomalyAlerts()
      .then((rows) => {
        if (cancelled) return;
        setAlerts(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setAlerts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolveAlert = (id: string) => {
    setAlerts((prev) => prev.map((alert) => (alert.id === id ? { ...alert, status: 'resolved' } : alert)));
    showNotification('success', 'Resolved', 'Alert marked as resolved.');
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 p-4">
        <h3 className="flex items-center font-bold text-gray-900">
          <AlertOctagon className="mr-2 h-5 w-5 text-red-500" /> System Anomalies
        </h3>
        <span className="text-xs text-gray-500">Live Monitor</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3">Severity</th>
              <th className="px-6 py-3">Area</th>
              <th className="px-6 py-3">Message</th>
              <th className="px-6 py-3">Deviation</th>
              <th className="px-6 py-3">Time</th>
              <th className="px-6 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {alerts.map((alert) => (
              <tr key={alert.id} className={`hover:bg-gray-50 ${alert.status === 'resolved' ? 'opacity-50' : ''}`}>
                <td className="px-6 py-4">
                  <span
                    className={`rounded px-2 py-1 text-xs font-bold uppercase ${
                      alert.severity === 'critical'
                        ? 'bg-red-100 text-red-700'
                        : alert.severity === 'warning'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {alert.severity}
                  </span>
                </td>
                <td className="px-6 py-4 capitalize font-medium">{alert.area}</td>
                <td className="px-6 py-4 text-gray-600">{alert.message}</td>
                <td className="px-6 py-4">
                  <div className="flex flex-col text-xs">
                    <span className="font-bold text-red-600">{alert.value}</span>
                    <span className="text-gray-400">vs {alert.baseline}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-xs text-gray-400">{new Date(alert.timestamp).toLocaleTimeString()}</td>
                <td className="px-6 py-4 text-right">
                  {alert.status === 'active' && (
                    <button
                      onClick={() => resolveAlert(alert.id)}
                      className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Resolve
                    </button>
                  )}
                  {alert.status === 'resolved' && (
                    <span className="flex items-center justify-end text-xs font-bold text-green-600">
                      <CheckCircle className="mr-1 h-3 w-3" /> Done
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AnomalyMonitorSection;
