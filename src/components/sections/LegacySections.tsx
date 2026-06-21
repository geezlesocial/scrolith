
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Star, ShieldCheck, Lock, UserPlus, Search, Briefcase, CheckCircle, DollarSign } from 'lucide-react';
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

export const CategoriesSection = ({ content }: { content: CategoriesContent }) => (
  <div className="py-20 bg-gray-50">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-10 text-center">Popular Categories</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
        {CATEGORIES.map((cat, idx) => (
            <Link key={idx} to={`/browse?category=${cat.name}`} className="group block text-center p-8 rounded-xl bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition duration-300">
                {content.showIcons && (
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-50 text-blue-600 mb-4 group-hover:bg-blue-600 group-hover:text-white transition">
                      <Star className="w-6 h-6" />
                  </div>
                )}
                <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition">{cat.name}</h3>
            </Link>
        ))}
        </div>
        {content.viewMoreLink && (
          <div className="mt-10 text-center">
            <Link to={content.viewMoreLink} className="text-blue-600 font-medium hover:underline inline-flex items-center">
              View All Categories <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
        )}
    </div>
  </div>
);

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
