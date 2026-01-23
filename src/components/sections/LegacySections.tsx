
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowRight, Star, ShieldCheck, Lock, UserPlus, Search, Briefcase, CheckCircle, DollarSign,
  Code, Palette, Megaphone, PenTool, Video, Brain, Camera, Music, Globe, BarChart3,
  Smartphone, Laptop, Database, Zap, FileText, Image, Mic, Gamepad2, ShoppingBag,
  Heart, GraduationCap, Wrench, Home, Car, Plane, UtensilsCrossed, Shirt, Mail, Sparkles
} from 'lucide-react';
import { TrustContent, CategoriesContent, HowItWorksContent, FeaturedContent, CTAContent } from '../../types';
import { CATEGORIES, MOCK_GIGS, MOCK_JOBS } from '../../constants';
import { useCurrency } from '../../context/CurrencyContext';

export const TrustSection = ({ content, style }: { content: TrustContent, style?: any }) => (
  <div className={`${style?.theme === 'blue' ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'}`}>
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            {content.stats.map((stat, i) => (
                <div key={i}>
                    <div className="text-4xl font-extrabold mb-1">{stat.value}</div>
                    <div className={`${style?.theme === 'blue' ? 'text-blue-100' : 'text-gray-500'} text-sm uppercase tracking-wide font-semibold`}>{stat.label}</div>
                </div>
            ))}
        </div>
    </div>
  </div>
);

// Professional icon mapping for categories
const getCategoryIcon = (categoryName: string) => {
  const iconMap: { [key: string]: React.ComponentType<{ className?: string }> } = {
    // Development & Tech
    'Development': Code,
    'Web Development': Code,
    'Mobile Development': Smartphone,
    'Software Development': Laptop,
    'Game Development': Gamepad2,
    'Database': Database,
    'DevOps': Zap,
    
    // Design
    'Design': Palette,
    'Graphic Design': Image,
    'UI/UX Design': Palette,
    'Logo Design': Image,
    'Branding': Palette,
    'Illustration': PenTool,
    
    // Marketing & Business
    'Marketing': Megaphone,
    'Digital Marketing': Megaphone,
    'SEO': BarChart3,
    'Social Media Marketing': Megaphone,
    'Content Marketing': FileText,
    'Email Marketing': Mail,
    'Business': Briefcase,
    'E-commerce': ShoppingBag,
    
    // Writing & Content
    'Writing': PenTool,
    'Content Writing': FileText,
    'Copywriting': PenTool,
    'Blog Writing': FileText,
    'Technical Writing': FileText,
    'Translation': Globe,
    
    // Video & Media
    'Video': Video,
    'Video Editing': Video,
    'Video Production': Camera,
    'Animation': Video,
    'Photography': Camera,
    'Music': Music,
    'Audio Editing': Mic,
    
    // AI & Tech Services
    'AI Services': Brain,
    'Machine Learning': Brain,
    'Data Science': BarChart3,
    'Chatbot Development': Brain,
    
    // Other Services
    'Consulting': Briefcase,
    'Legal': FileText,
    'Accounting': DollarSign,
    'Education': GraduationCap,
    'Health & Fitness': Heart,
    'Lifestyle': Heart,
    'Real Estate': Home,
    'Automotive': Car,
    'Travel': Plane,
    'Food & Beverage': UtensilsCrossed,
    'Fashion': Shirt,
    'Beauty': Heart,
  };
  
  // Try exact match first
  if (iconMap[categoryName]) {
    return iconMap[categoryName];
  }
  
  // Try case-insensitive match
  const lowerName = categoryName.toLowerCase();
  for (const [key, Icon] of Object.entries(iconMap)) {
    if (key.toLowerCase() === lowerName) {
      return Icon;
    }
  }
  
  // Try partial match
  for (const [key, Icon] of Object.entries(iconMap)) {
    if (lowerName.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerName)) {
      return Icon;
    }
  }
  
  // Default icon
  return Briefcase;
};

export const CategoriesSection = ({ content }: { content: CategoriesContent }) => {
  const getCategoryColor = (categoryName: string) => {
    const lowerName = categoryName.toLowerCase();
    
    if (lowerName.includes('development') || lowerName.includes('code') || lowerName.includes('software')) {
      return { bg: 'bg-blue-50', text: 'text-blue-600', hoverBg: 'group-hover:bg-blue-600', hoverText: 'group-hover:text-white', ring: 'ring-blue-200' };
    }
    if (lowerName.includes('design') || lowerName.includes('graphic') || lowerName.includes('ui') || lowerName.includes('ux')) {
      return { bg: 'bg-pink-50', text: 'text-pink-600', hoverBg: 'group-hover:bg-pink-600', hoverText: 'group-hover:text-white', ring: 'ring-pink-200' };
    }
    if (lowerName.includes('marketing') || lowerName.includes('seo') || lowerName.includes('social')) {
      return { bg: 'bg-green-50', text: 'text-green-600', hoverBg: 'group-hover:bg-green-600', hoverText: 'group-hover:text-white', ring: 'ring-green-200' };
    }
    if (lowerName.includes('writing') || lowerName.includes('content') || lowerName.includes('copy')) {
      return { bg: 'bg-purple-50', text: 'text-purple-600', hoverBg: 'group-hover:bg-purple-600', hoverText: 'group-hover:text-white', ring: 'ring-purple-200' };
    }
    if (lowerName.includes('video') || lowerName.includes('photo') || lowerName.includes('media')) {
      return { bg: 'bg-red-50', text: 'text-red-600', hoverBg: 'group-hover:bg-red-600', hoverText: 'group-hover:text-white', ring: 'ring-red-200' };
    }
    if (lowerName.includes('ai') || lowerName.includes('machine learning') || lowerName.includes('data')) {
      return { bg: 'bg-indigo-50', text: 'text-indigo-600', hoverBg: 'group-hover:bg-indigo-600', hoverText: 'group-hover:text-white', ring: 'ring-indigo-200' };
    }
    
    // Default color
    return { bg: 'bg-gray-50', text: 'text-gray-600', hoverBg: 'group-hover:bg-gray-600', hoverText: 'group-hover:text-white', ring: 'ring-gray-200' };
  };

  return (
    <div className="py-12 sm:py-16 md:py-20 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8 sm:mb-10 md:mb-12">
          <div className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mb-4">
            <Sparkles className="w-3 h-3 mr-1.5" /> Browse by Category
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3">Popular Categories</h2>
          <p className="text-gray-600 text-sm sm:text-base max-w-2xl mx-auto">
            Discover services across all categories, powered by AI recommendations
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
          {CATEGORIES.map((cat, idx) => {
            const IconComponent = getCategoryIcon(cat.name);
            const colors = getCategoryColor(cat.name);
            
            return (
              <Link 
                key={idx} 
                to={`/browse?category=${cat.name}`} 
                className="group block text-center p-4 sm:p-6 rounded-xl bg-white border-2 border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-300 hover:border-blue-300"
              >
                {content.showIcons && (
                  <div className={`inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl ${colors.bg} ${colors.text} mb-3 sm:mb-4 ${colors.hoverBg} ${colors.hoverText} transition-all duration-300 ring-2 ${colors.ring} group-hover:ring-4 group-hover:scale-110 transform`}>
                    <IconComponent className="w-6 h-6 sm:w-7 sm:h-7" />
                  </div>
                )}
                <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition text-xs sm:text-sm md:text-base mb-1">{cat.name}</h3>
                {cat.count !== undefined && (
                  <p className="text-xs text-gray-500 font-medium">{cat.count}+ services</p>
                )}
              </Link>
            );
          })}
        </div>
        {content.viewMoreLink && (
          <div className="mt-8 sm:mt-10 text-center">
            <Link to={content.viewMoreLink} className="inline-flex items-center text-blue-600 font-semibold hover:text-blue-700 hover:underline transition-colors text-sm sm:text-base">
              View All Categories <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export const HowItWorksSection = ({ content }: { content: HowItWorksContent }) => {
  const [tab, setTab] = useState<'employer' | 'freelancer'>('employer');
  
  const getIcon = (name: string) => {
    const icons: any = { UserPlus, Search, Briefcase, CheckCircle, DollarSign };
    const Icon = icons[name] || Star;
    return <Icon className="w-8 h-8 text-blue-600 mb-4" />;
  };

  return (
    <div className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">How It Works</h2>
        <div className="flex justify-center mb-12">
            <div className="bg-gray-100 p-1 rounded-lg inline-flex">
                <button onClick={() => setTab('employer')} className={`px-6 py-2 rounded-md text-sm font-medium transition ${tab === 'employer' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>For Employers</button>
                <button onClick={() => setTab('freelancer')} className={`px-6 py-2 rounded-md text-sm font-medium transition ${tab === 'freelancer' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}>For Freelancers</button>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {(tab === 'employer' ? content.employerSteps : content.freelancerSteps).map((step, i) => (
                <div key={i} className="relative">
                    <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                        {getIcon(step.icon)}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                    <p className="text-gray-600 text-sm px-4">{step.description}</p>
                    {i < 3 && <div className="hidden md:block absolute top-10 left-1/2 w-full h-0.5 bg-blue-100 -z-10 translate-x-1/2"></div>}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export const FeaturedSection = ({ content, style }: { content: FeaturedContent, style?: any }) => {
  const { formatPrice } = useCurrency();
  const isGray = style?.theme === 'gray';
  const items = content.source === 'gigs' ? MOCK_GIGS : MOCK_JOBS;

  return (
    <div className={`py-20 ${isGray ? 'bg-gray-50' : 'bg-white'}`}>
       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="flex justify-between items-end mb-10">
              <div>
                  <h2 className="text-3xl font-bold text-gray-900">Featured {content.source === 'gigs' ? 'Services' : 'Jobs'}</h2>
                  <p className="text-gray-600 mt-2">Handpicked for you</p>
              </div>
              <Link to="/browse" className="text-blue-600 hover:text-blue-700 font-semibold flex items-center">
                 View All <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
           </div>
           
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {items.slice(0, content.count).map((item: any) => (
                 content.source === 'gigs' ? (
                   <Link key={item.id} to={`/gigs/${item.id}`} className="group bg-white rounded-xl shadow-sm hover:shadow-lg transition duration-300 overflow-hidden border border-gray-100">
                      <div className="aspect-w-16 aspect-h-10 bg-gray-200">
                         <img src={item.image} alt={item.title} className="object-cover w-full h-56 group-hover:scale-105 transition duration-500" />
                      </div>
                      <div className="p-5">
                         <div className="flex items-center mb-3">
                            <img src={item.freelancerAvatar} alt="" className="w-8 h-8 rounded-full mr-3 border border-gray-200" />
                            <div>
                                <div className="text-sm font-semibold text-gray-900 hover:underline">{item.freelancerName}</div>
                                <div className="text-xs text-gray-500">Level 2 Seller</div>
                            </div>
                         </div>
                         <h3 className="text-gray-900 font-medium line-clamp-2 mb-3 group-hover:text-blue-600 transition h-12">
                            {item.title}
                         </h3>
                         <div className="flex items-center text-sm text-gray-500 mb-4">
                            <Star className="w-4 h-4 text-yellow-400 fill-current mr-1" />
                            <span className="font-bold text-gray-900 mr-1">{item.rating}</span>
                            <span>({item.reviews})</span>
                         </div>
                         <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                            <div className="text-xs text-gray-400 font-medium uppercase">Starting at</div>
                            <div className="text-lg font-bold text-gray-900">{formatPrice(item.price)}</div>
                         </div>
                      </div>
                   </Link>
                 ) : (
                   <Link key={item.id} to={`/jobs/${item.id}`} className="block bg-white shadow rounded-lg p-6 hover:shadow-md transition border border-gray-100">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-gray-900 line-clamp-2">{item.title}</h3>
                      </div>
                      <p className="text-sm text-gray-500 mb-4 line-clamp-3">{item.description}</p>
                      <div className="flex justify-between items-center text-xs text-gray-500">
                         <span className="bg-gray-100 px-2 py-1 rounded">{item.type}</span>
                         <span className="font-medium text-gray-900">{item.budget}</span>
                      </div>
                   </Link>
                 )
              ))}
           </div>
       </div>
    </div>
  );
};

export const CTASection = ({ content, style }: { content: CTAContent, style?: any }) => {
  const isBlue = style?.theme === 'blue';
  
  return (
    <div className={`py-24 text-center ${isBlue ? 'bg-blue-600 text-white' : 'bg-gray-900 text-white'}`}>
      <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">{content.headline}</h2>
          <p className={`text-xl mb-10 max-w-2xl mx-auto ${isBlue ? 'text-blue-100' : 'text-gray-300'}`}>{content.subheadline}</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link to={content.buttonLink} className="px-10 py-4 bg-white text-blue-600 font-bold rounded-lg hover:bg-gray-100 transition shadow-lg">
                  {content.buttonText}
              </Link>
          </div>
      </div>
    </div>
  );
};
