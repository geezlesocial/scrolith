import React from 'react';
import { MOCK_GIGS } from '../constants';
import { useCurrency } from '../context/CurrencyContext';
import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';

const BrowseTalent = () => {
  const { formatPrice } = useCurrency();

  return (
    <div className="bg-gray-50 min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Browse Talent & Gigs</h1>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {MOCK_GIGS.map((gig) => (
            <Link key={gig.id} to={`/gigs/${gig.id}`} className="bg-white rounded-lg shadow hover:shadow-lg transition overflow-hidden flex flex-col">
              <img src={gig.image} alt={gig.title} className="w-full h-48 object-cover" />
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-center mb-2">
                   <img src={gig.freelancerAvatar} className="w-8 h-8 rounded-full mr-2" alt=""/>
                   <span className="text-sm font-semibold">{gig.freelancerName}</span>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2 hover:text-blue-600 transition">{gig.title}</h3>
                <div className="mt-auto flex items-center justify-between">
                   <div className="flex items-center text-sm text-gray-600">
                      <Star className="w-4 h-4 text-yellow-400 fill-current mr-1"/>
                      {gig.rating} ({gig.reviews})
                   </div>
                   <div className="text-right">
                      <p className="text-xs text-gray-500">Starting at</p>
                      <p className="font-bold text-gray-900">{formatPrice(gig.price)}</p>
                   </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BrowseTalent;