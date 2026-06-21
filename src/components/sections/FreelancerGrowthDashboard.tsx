
import React from 'react';
import { Link } from 'react-router-dom';
import { Target, CheckCircle, ArrowRight } from 'lucide-react';
import { GrowthDashContent } from '../../types';

const FreelancerGrowthDashboard = ({ content }: { content?: GrowthDashContent }) => {
    // Mock tips if content not provided
    const tips = content?.tips || [
        "AI Tip: Adding a short intro video can increase your visibility by 32%.",
        "Complete your skill tests to rank higher in search."
    ];

    return (
        <div className="py-12 bg-white border-y border-gray-100">
             <div className="max-w-6xl mx-auto px-4">
                 <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between shadow-sm border border-blue-100">
                     <div className="mb-6 md:mb-0 md:mr-8 flex-1">
                         <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                             <Target className="w-6 h-6 mr-2 text-blue-600" /> Personal Growth Dashboard
                         </h3>
                         <div className="space-y-3">
                             {tips.map((tip, i) => (
                                 <div key={i} className="flex items-start text-sm text-gray-700 bg-white/50 p-2 rounded-lg">
                                     <CheckCircle className="w-5 h-5 mr-3 text-green-500 mt-0.5 flex-shrink-0" />
                                     {tip}
                                 </div>
                             ))}
                         </div>
                     </div>
                     
                     <div className="flex gap-6">
                        <div className="text-center bg-white p-6 rounded-xl shadow-sm border border-gray-200 w-32">
                             <div className="text-3xl font-bold text-gray-900 mb-1">85%</div>
                             <div className="text-xs text-gray-500 uppercase tracking-wide font-bold">Profile Score</div>
                         </div>
                         <div className="text-center bg-white p-6 rounded-xl shadow-sm border border-gray-200 w-32">
                             <div className="text-3xl font-bold text-green-600 mb-1">$1.2k</div>
                             <div className="text-xs text-gray-500 uppercase tracking-wide font-bold">Proj. Earnings</div>
                         </div>
                     </div>
                 </div>
                 
                 <div className="text-center mt-6">
                    <Link to="/freelancer/dashboard" className="text-blue-600 font-bold text-sm hover:underline inline-flex items-center">
                        Go to Full Dashboard <ArrowRight className="w-4 h-4 ml-1" />
                    </Link>
                 </div>
             </div>
        </div>
    );
};

export default FreelancerGrowthDashboard;
