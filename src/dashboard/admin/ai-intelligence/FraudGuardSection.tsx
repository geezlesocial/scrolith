import React, { useEffect, useState } from 'react';
import { AdminService } from '../../../services/admin';
import type { FraudLog } from '../../../types';

const FraudGuardSection: React.FC = () => {
  const [logs, setLogs] = useState<FraudLog[]>([]);

  useEffect(() => {
    let cancelled = false;
    AdminService.getFraudLogs()
      .then((rows) => {
        if (cancelled) return;
        setLogs(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setLogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Subscriber Fraud Logs</h3>
            <p className="text-sm text-gray-500">AI-detected fake signups and bots.</p>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-800">Active Protection</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">Risk Score</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{log.email}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.ip}</td>
                  <td className="px-4 py-3">
                    <span className={`font-bold ${log.riskScore > 70 ? 'text-red-600' : log.riskScore > 40 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {log.riskScore}/100
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {log.reasons.map((reason, index) => (
                        <span key={`${log.id}-${index}`} className="rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px]">
                          {reason}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-1 text-xs font-bold uppercase ${
                        log.actionTaken === 'Blocked'
                          ? 'bg-red-100 text-red-700'
                          : log.actionTaken === 'Flagged'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {log.actionTaken}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(log.timestamp).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default FraudGuardSection;
