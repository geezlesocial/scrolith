
import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { useCurrency } from '../context/CurrencyContext';
import { Gig } from '../types';

interface GigCardProps {
  gig: Gig;
}

const GigCard: React.FC<GigCardProps> = ({ gig }) => {
  const { formatPrice } = useCurrency();
  
  return (
    <Link to={`/gigs/${gig.id}`} className="block group bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 overflow-hidden h-full flex flex-col">
      <div className="aspect-[4/3] overflow-hidden bg-gray-100 relative">
        <img 
          src={gig.image} 
          alt={gig.title} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
        />
      </div>
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-center mb-3">
          <img src={gig.freelancerAvatar} alt={gig.freelancerName} className="w-6 h-6 rounded-full mr-2" />
          <span className="text-xs font-medium text-gray-700 truncate">{gig.freelancerName}</span>
        </div>
        <h3 className="font-medium text-gray-900 line-clamp-2 text-sm mb-2 group-hover:text-blue-600 transition-colors flex-1">
          {gig.title}
        </h3>
        <div className="flex items-center text-xs text-gray-500 mb-3">
          <Star className="w-3 h-3 text-yellow-400 fill-current mr-1" />
          <span className="font-bold text-gray-900 mr-1">{gig.rating}</span>
          <span>({gig.reviews})</span>
        </div>
        <div className="flex items-center justify-between border-t border-gray-50 pt-3 mt-auto">
          <span className="text-xs text-gray-400 uppercase font-medium">Starting at</span>
          <span className="font-bold text-gray-900">{formatPrice(gig.price)}</span>
        </div>
      </div>
    </Link>
  );
};

export default GigCard;
