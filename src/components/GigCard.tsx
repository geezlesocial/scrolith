
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingCart, Star } from 'lucide-react';
import { useCurrency } from '../context/CurrencyContext';
import { useFavorites } from '../context/FavoritesContext';
import { useCart } from '../context/CartContext';
import { useNotification } from '../context/NotificationContext';
import { Gig } from '../types';
import ProBadge from './ProBadge';
import { resolveAssetUrl } from '../utils/assetUrl';

interface GigCardProps {
  gig: Gig;
}

const GigCard: React.FC<GigCardProps> = ({ gig }) => {
  const { formatPrice } = useCurrency();
  const { toggleFavorite, isFavorite } = useFavorites();
  const { addToCart, isInCart } = useCart();
  const { showNotification } = useNotification();
  const [working, setWorking] = useState(false);
  
  const priceValue =
    typeof gig.price === 'number'
      ? gig.price
      : (gig as any)?.price?.amount ?? 0;
  const imageUrl = resolveAssetUrl(
    gig.image || (Array.isArray(gig.images) ? gig.images[0] : '') || ''
  );
  const freelancerAvatar = resolveAssetUrl(gig.freelancerAvatar || '');
  const liked = isFavorite('gig', gig.id);
  const inCart = isInCart(gig.id);

  const handleFavorite = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (working) return;
    setWorking(true);
    try {
      await toggleFavorite('gig', gig.id);
      showNotification('success', liked ? 'Removed' : 'Saved', liked ? 'Gig removed from favorites.' : 'Gig added to favorites.');
    } catch (error: any) {
      showNotification('error', 'Favorites', error?.message || 'Unable to update favorites.');
    } finally {
      setWorking(false);
    }
  };

  const handleAddToCart = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (working) return;
    if (inCart) {
      showNotification('info', 'Already in cart', 'This gig is already in your cart.');
      return;
    }
    setWorking(true);
    try {
      await addToCart(gig.id, 1);
      showNotification('success', 'Added to cart', 'Gig added to your cart.');
    } catch (error: any) {
      showNotification('error', 'Cart', error?.message || 'Unable to add gig to cart.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="group bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 overflow-hidden h-full flex flex-col relative">
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <button
          onClick={handleFavorite}
          className={`h-9 w-9 rounded-full flex items-center justify-center shadow-sm border ${liked ? 'bg-red-50 border-red-200 text-red-500' : 'bg-white border-gray-200 text-gray-500'} hover:scale-105 transition`}
          title={liked ? 'Remove from favorites' : 'Save to favorites'}
        >
          <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
        </button>
        <button
          onClick={handleAddToCart}
          className={`h-9 w-9 rounded-full flex items-center justify-center shadow-sm border ${inCart ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-white border-gray-200 text-gray-500'} hover:scale-105 transition`}
          title={inCart ? 'In cart' : 'Add to cart'}
        >
          <ShoppingCart className="w-4 h-4" />
        </button>
      </div>

      <Link to={`/gigs/${gig.id}`} className="block h-full">
        <div className="aspect-[4/3] overflow-hidden bg-gray-100 relative">
          {imageUrl ? (
            <img 
              src={imageUrl} 
              alt={gig.title} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No image</div>
          )}
        </div>
        <div className="p-4 flex flex-col flex-1">
          <div className="flex items-center mb-3">
            {freelancerAvatar ? (
              <img src={freelancerAvatar} alt={gig.freelancerName} className="w-6 h-6 rounded-full mr-2" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gray-200 mr-2" />
            )}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-medium text-gray-700 truncate">{gig.freelancerName}</span>
              <ProBadge role="freelancer" isPro={(gig as any)?.freelancerIsPro} />
            </div>
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
            <span className="font-bold text-gray-900">{formatPrice(priceValue)}</span>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default GigCard;
