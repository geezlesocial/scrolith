
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { HomeSlide, UserRole, HeroSearchConfig } from '../types';
import { useUser } from '../context/UserContext';
import { ChevronLeft, ChevronRight, ShieldCheck, Lock, Star, Search, Briefcase } from 'lucide-react';
import SearchInput from './SearchInput';
import { CMSService } from '../services/cms';

interface HomeSliderProps {
    slides: HomeSlide[];
}

const HomeSlider: React.FC<HomeSliderProps> = ({ slides }) => {
    const { user } = useUser();
    const navigate = useNavigate();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [visibleSlides, setVisibleSlides] = useState<HomeSlide[]>([]);
    const [heroConfig, setHeroConfig] = useState<HeroSearchConfig | null>(null);

    useEffect(() => {
        const role = user?.role || UserRole.GUEST;
        const filtered = slides
            .filter(s => s.isActive && s.roleVisibility.includes(role))
            .sort((a, b) => a.sortOrder - b.sortOrder);
        setVisibleSlides(filtered);
    }, [slides, user]);

    useEffect(() => {
        CMSService.getHeroSearchConfig().then(setHeroConfig);
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % visibleSlides.length);
        }, 6000); // 6s Auto-rotate
        return () => clearInterval(interval);
    }, [visibleSlides.length]);

    if (visibleSlides.length === 0) return null;

    const handleSlideClick = (slide: HomeSlide) => {
        if (slide.redirectUrl) {
            if (slide.redirectUrl.startsWith('http')) {
                window.location.href = slide.redirectUrl;
            } else {
                navigate(slide.redirectUrl);
            }
        }
    };

    const nextSlide = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev + 1) % visibleSlides.length);
    };

    const prevSlide = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentIndex((prev) => (prev - 1 + visibleSlides.length) % visibleSlides.length);
    };

    const getBadgeIcon = (iconName: string) => {
        switch(iconName) {
            case 'shield': return <ShieldCheck className="w-4 h-4 mr-2 text-green-400" />;
            case 'lock': return <Lock className="w-4 h-4 mr-2 text-green-400" />;
            case 'star': return <Star className="w-4 h-4 mr-2 text-green-400" />;
            default: return <ShieldCheck className="w-4 h-4 mr-2 text-green-400" />;
        }
    };

    return (
        <div className="relative w-full h-[650px] overflow-hidden bg-gray-900 group">
            {/* --- HERO SEARCH OVERLAY --- */}
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none px-4">
                <div className="w-full max-w-5xl text-center pointer-events-auto mt-[-40px]">
                    
                    {/* 1. Main Headline (Restored) */}
                    <h1 className="text-3xl md:text-5xl font-bold text-white mb-8 drop-shadow-lg tracking-tight leading-tight animate-fade-in-up">
                        Find the perfect freelance services for your business
                    </h1>

                    {/* 2. Search Bar */}
                    <div className="w-full max-w-3xl mx-auto mb-6 animate-fade-in-up delay-100">
                        <SearchInput 
                            placeholder={heroConfig?.searchPlaceholder} 
                            className="shadow-2xl border-0 ring-4 ring-white/20"
                            size={heroConfig?.searchSize || 'large'}
                        />
                    </div>

                    {/* 3. Category Buttons (Pills) */}
                    {heroConfig?.quickTags && heroConfig.quickTags.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-3 mb-10 animate-fade-in-up delay-200">
                            <span className="text-white/80 text-sm font-medium mr-1 hidden sm:inline-block pt-1">Popular:</span>
                            {heroConfig.quickTags.map((tag) => (
                                <button 
                                   key={tag.id} 
                                   className="px-4 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-full text-sm font-medium backdrop-blur-md transition border border-white/10 hover:border-white/30 shadow-sm"
                                   onClick={() => navigate(tag.url)}
                                >
                                    {tag.label}
                                </button>
                            ))}
                        </div>
                    )}
                    
                    {/* 4. Actions & Trust Badges Row (Combined) */}
                    <div className="flex flex-col md:flex-row items-center justify-center gap-6 animate-fade-in-up delay-300">
                        {/* Action Buttons */}
                        <div className="flex gap-3">
                            <button 
                                onClick={() => navigate('/browse')} 
                                className="bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-full font-bold text-sm transition shadow-lg flex items-center"
                            >
                                <Search className="w-4 h-4 mr-2" /> Find Talent
                            </button>
                            <button 
                                onClick={() => navigate('/create-job')} 
                                className="bg-white hover:bg-gray-100 text-gray-900 px-5 py-2.5 rounded-full font-bold text-sm transition shadow-lg flex items-center"
                            >
                                <Briefcase className="w-4 h-4 mr-2" /> Post a Job
                            </button>
                        </div>

                        {/* Divider */}
                        <div className="hidden md:block w-px h-8 bg-white/20"></div>

                        {/* Trust Badges */}
                        <div className="flex flex-wrap justify-center gap-3 text-sm text-white/90 font-medium">
                            <div className="flex items-center bg-black/40 px-3 py-2 rounded-full backdrop-blur-md border border-white/10 hover:bg-black/60 transition-colors cursor-default">
                                <ShieldCheck className="w-4 h-4 mr-2 text-green-400" /> Admin Verified
                            </div>
                            <div className="flex items-center bg-black/40 px-3 py-2 rounded-full backdrop-blur-md border border-white/10 hover:bg-black/60 transition-colors cursor-default">
                                <Lock className="w-4 h-4 mr-2 text-green-400" /> Secure Escrow
                            </div>
                            <div className="flex items-center bg-black/40 px-3 py-2 rounded-full backdrop-blur-md border border-white/10 hover:bg-black/60 transition-colors cursor-default">
                                <Star className="w-4 h-4 mr-2 text-green-400" /> Top Rated Talent
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- TRUSTED BRANDS BOTTOM BAR --- */}
            {heroConfig?.trustedBrands?.enabled && (
                 <div className="absolute bottom-0 left-0 right-0 z-30 bg-black/60 backdrop-blur-md border-t border-white/10 py-4 hidden md:block">
                     <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between">
                         <span className="text-white/60 text-sm font-medium mb-2 md:mb-0 mr-6 whitespace-nowrap">
                             {heroConfig.trustedBrands.title}
                         </span>
                         <div className="flex flex-wrap justify-center gap-8 items-center opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
                             {heroConfig.trustedBrands.logos.map(logo => (
                                 <img key={logo.id} src={logo.src} alt={logo.alt} className="h-6 w-auto object-contain brightness-0 invert" />
                             ))}
                         </div>
                     </div>
                 </div>
            )}

            {/* --- SLIDES --- */}
            {visibleSlides.map((slide, index) => (
                <div 
                    key={slide.id}
                    className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${index === currentIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
                    onClick={() => handleSlideClick(slide)}
                    style={{ cursor: slide.redirectUrl ? 'pointer' : 'default', backgroundColor: slide.backgroundColor || '#000' }}
                >
                    {/* Media Layer */}
                    <div className="absolute inset-0 w-full h-full">
                        {slide.mediaType === 'video' ? (
                            <video 
                                src={slide.mediaUrl}
                                autoPlay 
                                muted 
                                loop 
                                playsInline 
                                className="w-full h-full object-cover object-center"
                            />
                        ) : (
                            <img 
                                src={slide.mediaUrl} 
                                alt={slide.title || 'Slide'} 
                                className="w-full h-full object-cover object-center"
                            />
                        )}
                        {/* Overlay Gradient for Text Readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/50 to-gray-900/30 pointer-events-none" />
                    </div>
                </div>
            ))}

            {/* --- CONTROLS --- */}
            {visibleSlides.length > 1 && (
                <>
                    <button 
                        onClick={prevSlide}
                        className="absolute left-4 top-1/2 -translate-y-1/2 z-30 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-sm transition opacity-0 group-hover:opacity-100"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button 
                        onClick={nextSlide}
                        className="absolute right-4 top-1/2 -translate-y-1/2 z-30 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white backdrop-blur-sm transition opacity-0 group-hover:opacity-100"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                </>
            )}
        </div>
    );
};

export default HomeSlider;
