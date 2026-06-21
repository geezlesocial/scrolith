
import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import { GigCreationContent } from '../../types';

const AIGigCreationCTA = ({ content }: { content?: GigCreationContent }) => {
    return (
        <div className="py-20 bg-gray-900 text-white text-center relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden opacity-30 pointer-events-none">
                <div className="absolute -top-24 -left-24 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
                <div className="absolute top-0 -right-24 w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
            </div>

            <div className="max-w-3xl mx-auto px-4 relative z-10">
                <div className="inline-block p-4 bg-white/10 rounded-full mb-8 backdrop-blur-sm border border-white/10">
                    <Sparkles className="w-8 h-8 text-yellow-400" />
                </div>
                <h2 className="text-3xl md:text-5xl font-bold mb-6 tracking-tight">{content?.headline || "Create a Gig That Gets Hired"}</h2>
                <p className="text-xl text-gray-300 mb-10 leading-relaxed max-w-2xl mx-auto">
                    {content?.subheadline || "Let our AI assist you in crafting the perfect service offering. We generate titles, tags, and pricing strategies for you."}
                </p>
                <Link to="/create-gig?mode=ai" className="inline-flex items-center px-10 py-5 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-xl transition shadow-lg shadow-blue-900/50 hover:scale-105 transform">
                    {content?.buttonText || "Create Gig with AI"} <ArrowRight className="ml-3 w-6 h-6" />
                </Link>
            </div>
        </div>
    );
};

export default AIGigCreationCTA;
