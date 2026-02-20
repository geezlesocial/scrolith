import React, { useEffect, useState } from 'react';
import { FileText, Scale } from 'lucide-react';
import { GovernanceService } from '../../../services/ai/governance.service';
import type { ContractClauseSuggestion } from '../../../types';

const GovernancePanelSection: React.FC = () => {
  const [clauses, setClauses] = useState<ContractClauseSuggestion[]>([]);

  useEffect(() => {
    let cancelled = false;
    GovernanceService.suggestContractClauses('general')
      .then((rows) => {
        if (cancelled) return;
        setClauses(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setClauses([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center font-bold text-gray-900">
            <Scale className="mr-2 h-5 w-5 text-blue-600" /> AI Dispute Predictor Control
          </h3>
          <div className="mb-4 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
            AI predicts outcomes for active disputes based on evidence and contract history.
          </div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Prediction Accuracy</span>
            <span className="font-bold text-green-600">88.5%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Auto-Flag High Risk</span>
            <span className="rounded bg-green-100 px-2 py-1 text-xs font-bold text-green-800">ENABLED</span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center font-bold text-gray-900">
            <FileText className="mr-2 h-5 w-5 text-purple-600" /> Smart Contract Library
          </h3>
          <div className="space-y-3">
            {clauses.map((clause, i) => (
              <div key={`${clause.title}-${i}`} className="rounded-lg border border-gray-100 p-3 hover:bg-gray-50">
                <div className="mb-1 flex items-start justify-between">
                  <span className="text-sm font-bold text-gray-800">{clause.title}</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">{clause.category}</span>
                </div>
                <p className="line-clamp-2 text-xs text-gray-600">{clause.text}</p>
              </div>
            ))}
          </div>
          <button className="mt-4 w-full text-center text-sm font-bold text-blue-600 hover:underline">
            Manage Clause Library
          </button>
        </div>
      </div>
    </div>
  );
};

export default GovernancePanelSection;
