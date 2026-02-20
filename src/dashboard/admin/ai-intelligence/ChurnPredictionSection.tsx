import React, { useEffect, useState } from 'react';
import { AdminService } from '../../../services/admin';
import type { ChurnRisk } from '../../../types';
import { useNotification } from '../../../context/NotificationContext';
import { useCurrency } from '../../../context/CurrencyContext';

const ChurnPredictionSection: React.FC = () => {
  const [risks, setRisks] = useState<ChurnRisk[]>([]);
  const { formatPrice } = useCurrency();
  const { showNotification } = useNotification();

  useEffect(() => {
    let cancelled = false;
    AdminService.getChurnRisks()
      .then((rows) => {
        if (cancelled) return;
        setRisks(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setRisks([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEngage = (userId: string) => {
    showNotification('success', 'Retention Action Started', `Automated retention campaign sent to user ${userId}`);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">At-Risk Accounts</h3>
            <p className="text-sm text-gray-500">Users identified by AI as having high churn probability.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500">
              <tr>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3">Churn Score</th>
                <th className="px-6 py-3">Key Factors</th>
                <th className="px-6 py-3">Proj. Loss</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {risks.map((risk, i) => (
                <tr key={`${risk.userId}-${i}`} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{risk.userName}</td>
                  <td className="px-6 py-4 capitalize">{risk.role}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="mr-2 h-2 w-16 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full ${risk.score > 70 ? 'bg-red-500' : 'bg-orange-400'}`}
                          style={{ width: `${risk.score}%` }}
                        />
                      </div>
                      <span className="font-bold">{risk.score}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {risk.factors.map((factor, idx) => (
                        <span key={`${risk.userId}-${idx}`} className="rounded border border-red-100 bg-red-50 px-2 py-0.5 text-[10px] text-red-700">
                          {factor}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-red-600">{formatPrice(risk.projectedLoss)}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleEngage(risk.userId)}
                      className="rounded-md bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600 transition hover:bg-indigo-100"
                    >
                      Engage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ChurnPredictionSection;
