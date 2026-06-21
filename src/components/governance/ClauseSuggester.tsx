
import React, { useState } from 'react';
import { Sparkles, Plus, Shield, RefreshCw } from 'lucide-react';
import { ContractClauseSuggestion } from '../../types';
import { GovernanceService } from '../../services/ai/governance.service';

interface Props {
    jobDescription: string;
    jobType: string;
    onAddClause: (text: string) => void;
}

const ClauseSuggester: React.FC<Props> = ({ jobDescription, jobType, onAddClause }) => {
    const [suggestions, setSuggestions] = useState<ContractClauseSuggestion[]>([]);
    const [loading, setLoading] = useState(false);

    const generate = async () => {
        setLoading(true);
        try {
            const data = await GovernanceService.suggestContractClauses(jobType);
            setSuggestions(data);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="border border-indigo-100 bg-indigo-50/50 rounded-xl p-6 mt-6">
            <div className="flex justify-between items-center mb-4">
                <h4 className="font-bold text-indigo-900 flex items-center">
                    <Shield className="w-5 h-5 mr-2 text-indigo-600" /> 
                    Smart Contract Protections
                </h4>
                <button 
                    onClick={generate} 
                    disabled={loading}
                    className="text-xs bg-white border border-indigo-200 text-indigo-700 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition flex items-center"
                >
                    {loading ? <RefreshCw className="w-3 h-3 animate-spin mr-1"/> : <Sparkles className="w-3 h-3 mr-1"/>}
                    {suggestions.length > 0 ? 'Regenerate' : 'Analyze & Suggest'}
                </button>
            </div>

            {suggestions.length === 0 && !loading && (
                <p className="text-sm text-indigo-400 italic">Click analyze to detect missing protective clauses for this {jobType} contract.</p>
            )}

            <div className="space-y-3">
                {suggestions.map((clause) => (
                    <div key={clause.id} className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm hover:shadow-md transition">
                        <div className="flex justify-between items-start">
                            <div>
                                <h5 className="font-bold text-sm text-gray-900 mb-1">{clause.title}</h5>
                                <p className="text-sm text-gray-600 mb-2">{clause.text}</p>
                                <div className="flex gap-2">
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{clause.category}</span>
                                    <span className="text-[10px] text-gray-400">Risk: {clause.riskLevel}</span>
                                </div>
                            </div>
                            <button 
                                onClick={() => onAddClause(clause.text)}
                                className="ml-4 p-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition"
                                title="Add Clause"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ClauseSuggester;
