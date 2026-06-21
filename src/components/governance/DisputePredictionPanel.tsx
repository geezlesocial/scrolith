
import React from 'react';
import { Brain, AlertTriangle, CheckCircle, Scale, FileText } from 'lucide-react';
import { DisputePrediction } from '../../types';

interface Props {
    prediction: DisputePrediction;
    isLoading?: boolean;
}

const DisputePredictionPanel: React.FC<Props> = ({ prediction, isLoading }) => {
    if (isLoading) return <div className="p-6 text-center animate-pulse text-gray-500">AI is analyzing case files...</div>;
    if (!prediction) return null;

    const riskColor = prediction.riskLevel === 'High' ? 'text-red-600 bg-red-50 border-red-200' : 
                      prediction.riskLevel === 'Medium' ? 'text-yellow-600 bg-yellow-50 border-yellow-200' : 
                      'text-green-600 bg-green-50 border-green-200';

    return (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-white p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-bold text-gray-900 flex items-center">
                    <Scale className="w-5 h-5 mr-2 text-indigo-600" /> AI Case Predictor
                </h3>
                <span className="text-xs font-mono text-gray-400">Model: Gemini 1.5 Pro</span>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: Outcome */}
                <div>
                    <div className="mb-4">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Predicted Outcome</span>
                        <div className="text-2xl font-extrabold text-gray-900 mt-1 flex items-center">
                            {prediction.predictedOutcome}
                            <span className="ml-3 text-sm font-medium px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full">
                                {prediction.confidenceScore}% Confidence
                            </span>
                        </div>
                    </div>
                    
                    <div className={`p-3 rounded-lg border ${riskColor} mb-4`}>
                        <div className="flex items-center text-sm font-bold mb-1">
                            <AlertTriangle className="w-4 h-4 mr-2" /> Risk Assessment: {prediction.riskLevel}
                        </div>
                        <p className="text-xs opacity-90">Based on communication gaps and contract ambiguity.</p>
                    </div>

                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                        <span className="text-xs font-bold text-indigo-800 uppercase block mb-1">Suggested Resolution</span>
                        <p className="text-sm text-indigo-900">{prediction.suggestedResolution}</p>
                    </div>
                </div>

                {/* Right: Factors */}
                <div className="space-y-4">
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide block mb-2">Key Factors</span>
                        <ul className="space-y-2">
                            {prediction.keyFactors.map((factor, i) => (
                                <li key={i} className="flex items-start text-sm text-gray-700">
                                    <CheckCircle className="w-4 h-4 mr-2 text-green-500 mt-0.5 flex-shrink-0" />
                                    {factor}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {prediction.evidenceGaps && prediction.evidenceGaps.length > 0 && (
                        <div>
                            <span className="text-xs font-bold text-red-500 uppercase tracking-wide block mb-2">Missing Evidence</span>
                            <ul className="space-y-2">
                                {prediction.evidenceGaps.map((gap, i) => (
                                    <li key={i} className="flex items-start text-sm text-red-700 bg-red-50 p-2 rounded">
                                        <FileText className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                                        {gap}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
            
            <div className="bg-gray-50 p-3 border-t border-gray-200 text-xs text-gray-500 text-center">
                This is an AI advisory estimation. Final decision rests with the human arbitrator.
            </div>
        </div>
    );
};

export default DisputePredictionPanel;
