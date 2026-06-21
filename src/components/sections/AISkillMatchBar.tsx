
import React, { useState } from 'react';
import { AIService } from '../../services/ai/ai.service';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AISkillMatchBar = () => {
    const [input, setInput] = useState('');
    const [isMatching, setIsMatching] = useState(false);
    const [results, setResults] = useState<any>(null);
    const navigate = useNavigate();

    const handleMatch = async () => {
        if (!input.trim()) return;
        setIsMatching(true);
        setResults(null);
        try {
            const response = await AIService.freelancerSkillMatch({ query: input });
            setResults(response);
        } catch (error) {
            console.error("Match failed", error);
        } finally {
            setIsMatching(false);
        }
    };

    return (
        <div className="bg-indigo-900 py-16 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-indigo-500 rounded-full mix-blend-overlay filter blur-3xl opacity-20"></div>
            <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-indigo-800 text-indigo-200 text-xs font-bold mb-4 border border-indigo-700">
                    <Sparkles className="w-3 h-3 mr-1" /> AI Powered Opportunity Finder
                </div>
                <h2 className="text-3xl font-bold mb-6">What services do you offer?</h2>
                
                <div className="bg-white p-2 rounded-xl shadow-2xl flex flex-col sm:flex-row gap-2 max-w-xl mx-auto mb-8">
                    <input 
                        type="text" 
                        placeholder="e.g. Logo design, Python scripting..." 
                        className="flex-1 px-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-0 text-lg placeholder-gray-400"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleMatch()}
                    />
                    <button 
                        onClick={handleMatch}
                        disabled={isMatching || !input}
                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold transition flex items-center justify-center disabled:opacity-70 whitespace-nowrap text-white shadow-md"
                    >
                        {isMatching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Find Matches'}
                    </button>
                </div>

                {results && (
                    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl p-6 text-left animate-fade-in-up">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <h4 className="text-xs font-bold text-indigo-200 uppercase mb-2">Best Categories</h4>
                                <div className="flex flex-wrap gap-2">
                                    {results.recommendedCategories.map((cat: string, i: number) => (
                                        <span key={i} onClick={() => navigate(`/browse?category=${cat}`)} className="bg-indigo-800/50 hover:bg-indigo-700 px-3 py-1 rounded text-sm cursor-pointer transition">{cat}</span>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-indigo-200 uppercase mb-2">Suggested Pricing</h4>
                                <p className="text-2xl font-bold text-white">{results.pricingRange}</p>
                                <p className="text-xs text-indigo-300">Avg. for beginners</p>
                            </div>
                            <div>
                                <h4 className="text-xs font-bold text-indigo-200 uppercase mb-2">Recommended Gigs</h4>
                                <ul className="space-y-1">
                                    {results.suggestedGigs.slice(0, 2).map((gig: string, i: number) => (
                                        <li key={i} className="text-sm flex items-center text-indigo-100">
                                            <ArrowRight className="w-3 h-3 mr-2" /> {gig}
                                        </li>
                                    ))}
                                </ul>
                                <button onClick={() => navigate('/create-gig')} className="mt-3 text-xs font-bold text-green-400 hover:text-green-300 flex items-center">
                                    Create Now <ArrowRight className="w-3 h-3 ml-1" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AISkillMatchBar;
