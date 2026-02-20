import React, { useEffect, useState } from 'react';
import { CheckCircle, Play, TrendingUp, Zap } from 'lucide-react';
import { AdminService } from '../../../services/admin';
import type { OptimizationProposal } from '../../../types';
import { useNotification } from '../../../context/NotificationContext';

const AutoOptimizerSection: React.FC = () => {
  const [proposals, setProposals] = useState<OptimizationProposal[]>([]);
  const { showNotification } = useNotification();

  useEffect(() => {
    let cancelled = false;
    AdminService.getOptimizationProposals()
      .then((rows) => {
        if (cancelled) return;
        setProposals(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (cancelled) return;
        setProposals([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleApply = (id: string) => {
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'applied' } : p)));
    showNotification('success', 'Applied', 'Optimization deployed to production.');
  };

  const handleDismiss = (id: string) => {
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'rejected' } : p)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">AI Optimization Proposals</h3>
        <span className="flex items-center rounded-full bg-purple-100 px-2 py-1 text-xs font-bold text-purple-700">
          <Zap className="mr-1 h-3 w-3" /> Auto-Tune Active
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {proposals.map((proposal) => (
          <div
            key={proposal.id}
            className={`rounded-xl border-2 p-6 transition-all ${
              proposal.status === 'pending' ? 'border-purple-100 bg-white shadow-sm' : 'border-gray-100 bg-gray-50 opacity-70'
            }`}
          >
            <div className="mb-3 flex items-start justify-between">
              <span className="rounded bg-gray-100 px-2 py-1 text-xs font-bold uppercase tracking-wider text-gray-500">
                {proposal.module}
              </span>
              <span
                className={`rounded px-2 py-1 text-xs font-bold capitalize ${
                  proposal.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-700'
                    : proposal.status === 'applied'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                }`}
              >
                {proposal.status}
              </span>
            </div>
            <h4 className="mb-2 font-bold text-gray-900">Problem: {proposal.issue}</h4>
            <p className="mb-4 text-sm text-gray-600">{proposal.recommendation}</p>

            <div className="mb-6 flex w-fit items-center rounded-lg bg-green-50 p-2 text-sm font-bold text-green-600">
              <TrendingUp className="mr-2 h-4 w-4" /> Projected Impact: {proposal.impact}
            </div>

            {proposal.status === 'pending' && (
              <div className="flex gap-3">
                <button
                  onClick={() => handleApply(proposal.id)}
                  className="flex flex-1 items-center justify-center rounded-lg bg-purple-600 py-2 text-sm font-bold text-white transition hover:bg-purple-700"
                >
                  <Play className="mr-2 h-3 w-3" /> Apply Fix
                </button>
                <button
                  onClick={() => handleDismiss(proposal.id)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50"
                >
                  Dismiss
                </button>
              </div>
            )}
            {proposal.status === 'applied' && (
              <div className="flex items-center justify-center text-xs font-bold text-green-700">
                <CheckCircle className="mr-1 h-3 w-3" /> Optimized on {new Date().toLocaleDateString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AutoOptimizerSection;
