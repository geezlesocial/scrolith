
import React from 'react';
import { Link } from 'react-router-dom';
import { HeroContent } from '../../types';
import { ShieldCheck, Lock, Star } from 'lucide-react';

const HeroAISection = ({ content }: { content: HeroContent }) => {
    return (
        <div className="relative bg-gray-900 text-white overflow-hidden">
            <div className="absolute inset-0">
                <img src={content.backgroundImage} alt="Hero" className="w-full h-full object-cover opacity-20" />
                <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/90 to-transparent" />
            </div>
            
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32">
                <div className="max-w-3xl animate-fade-in-up">
                    <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
                        {content.headline}
                    </h1>
                    <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                        {content.subheadline}
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-4 mb-12">
                        <Link to={content.primaryCtaLink} className="px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-lg text-center transition shadow-lg shadow-green-900/20">
                            {content.primaryCtaText}
                        </Link>
                        <Link to={content.secondaryCtaLink} className="px-8 py-4 bg-white hover:bg-gray-100 text-gray-900 font-bold rounded-lg text-lg text-center transition">
                            {content.secondaryCtaText}
                        </Link>
                    </div>
    
                    {content.showTrustBadges && (
                        <div className="flex flex-wrap gap-8 text-sm text-gray-400 font-medium">
                          <div className="flex items-center"><ShieldCheck className="w-5 h-5 mr-2 text-green-400" /> Admin Verified</div>
                          <div className="flex items-center"><Lock className="w-5 h-5 mr-2 text-green-400" /> Secure Escrow</div>
                          <div className="flex items-center"><Star className="w-5 h-5 mr-2 text-green-400" /> Top Rated Talent</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HeroAISection;
