
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { AIService } from '../../services/ai/ai.service';
import { useNotification } from '../../context/NotificationContext';
import { ProjectBriefContent } from '../../types';

const AIProjectBriefGenerator = ({ content }: { content?: ProjectBriefContent }) => {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const { showNotification } = useNotification();
    const navigate = useNavigate();

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setIsGenerating(true);
        try {
            // Use AI Service to generate brief
            const brief = await AIService.generateProjectBrief({ prompt });
            
            // Store brief in session storage to pre-fill the Create Job page
            sessionStorage.setItem('ai_job_brief', JSON.stringify(brief));
            
            showNotification('success', 'Brief Generated', 'Redirecting to job creation...');
            navigate('/create-job?mode=ai_draft');
        } catch (error) {
            showNotification('alert', 'Error', 'Could not generate brief. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="bg-gradient-to-br from-indigo-900 to-purple-900 py-20 text-white relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-overlay filter blur-3xl opacity-20 -mr-20 -mt-20"></div>
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-overlay filter blur-3xl opacity-20 -ml-20 -mb-20"></div>

            <div className="max-w-4xl mx-auto px-4 relative z-10 text-center">
                <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-sm font-bold mb-6">
                    <Sparkles className="w-4 h-4 mr-2 text-yellow-300" /> 
                    AI Project Assistant
                </div>
                
                <h2 className="text-3xl md:text-5xl font-extrabold mb-6 tracking-tight leading-tight">
                    {content?.title || "Not sure where to start?"}
                </h2>
                
                <p className="text-lg md:text-xl text-indigo-100 mb-10 max-w-2xl mx-auto leading-relaxed">
                    {content?.subtitle || "Describe your project in simple words. Our AI will draft a professional job post, suggest a budget, and find the perfect talent for you."}
                </p>

                <div className="bg-white p-2 rounded-2xl shadow-2xl flex flex-col md:flex-row gap-3 max-w-2xl mx-auto transition-transform hover:scale-[1.01]">
                    <input 
                        type="text" 
                        placeholder="e.g. I need a modern logo for my coffee shop..." 
                        className="flex-1 px-6 py-4 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    />
                    <button 
                        onClick={handleGenerate}
                        disabled={isGenerating || !prompt}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed shadow-lg"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Generating...
                            </>
                        ) : (
                            <>
                                Build Brief <ArrowRight className="w-5 h-5 ml-2" />
                            </>
                        )}
                    </button>
                </div>
                
                <p className="text-sm text-indigo-300 mt-4">
                    Takes ~5 seconds. Free to use. No sign-up required to draft.
                </p>
            </div>
        </div>
    );
};

export default AIProjectBriefGenerator;
