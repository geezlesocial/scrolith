import React, { useEffect, useState } from 'react';
import { Eye, Trash2, RefreshCw } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useCurrency } from '../../context/CurrencyContext';
import { useNotification } from '../../context/NotificationContext';

const CommerceEngagement = () => {
  const { formatPrice } = useCurrency();
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<'favorites' | 'carts'>('favorites');
  const [favorites, setFavorites] = useState<any[]>([]);
  const [carts, setCarts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCart, setSelectedCart] = useState<any | null>(null);
  const [cartLoading, setCartLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'favorites') {
        const data = await AdminService.getFavorites();
        setFavorites(Array.isArray(data) ? data : []);
      } else {
        const data = await AdminService.getCarts();
        setCarts(Array.isArray(data) ? data : []);
      }
    } catch (error: any) {
      showNotification('error', 'Error', error?.message || 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const openCart = async (cartId: string) => {
    setCartLoading(true);
    try {
      const data = await AdminService.getCartById(cartId);
      setSelectedCart(data);
    } catch (error: any) {
      showNotification('error', 'Error', error?.message || 'Failed to load cart.');
    } finally {
      setCartLoading(false);
    }
  };

  const deleteFavorite = async (id: string) => {
    const ok = confirm('Remove this favorite?');
    if (!ok) return;
    try {
      await AdminService.deleteFavorite(id);
      showNotification('success', 'Removed', 'Favorite removed.');
      loadData();
    } catch (error: any) {
      showNotification('error', 'Error', error?.message || 'Failed to remove favorite.');
    }
  };

  const deleteCart = async (id: string) => {
    const ok = confirm('Delete this cart and its items?');
    if (!ok) return;
    try {
      await AdminService.deleteCart(id);
      showNotification('success', 'Deleted', 'Cart deleted.');
      setSelectedCart(null);
      loadData();
    } catch (error: any) {
      showNotification('error', 'Error', error?.message || 'Failed to delete cart.');
    }
  };

  const deleteCartItem = async (itemId: string) => {
    const ok = confirm('Remove this cart item?');
    if (!ok) return;
    try {
      await AdminService.deleteCartItem(itemId);
      showNotification('success', 'Removed', 'Cart item removed.');
      if (selectedCart?.id) {
        await openCart(selectedCart.id);
      } else {
        loadData();
      }
    } catch (error: any) {
      showNotification('error', 'Error', error?.message || 'Failed to remove cart item.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Favorites & Carts</h2>
          <p className="text-sm text-gray-500">Monitor saved gigs and active buyer carts.</p>
        </div>
        <button
          onClick={loadData}
          className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100"
          title="Refresh"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex space-x-2 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('favorites')}
          className={`px-4 py-2 text-sm font-semibold rounded-md ${activeTab === 'favorites' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}
        >
          Favorites
        </button>
        <button
          onClick={() => setActiveTab('carts')}
          className={`px-4 py-2 text-sm font-semibold rounded-md ${activeTab === 'carts' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}
        >
          Carts
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">Loading...</div>
      ) : activeTab === 'favorites' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-medium">
              <tr>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Entity</th>
                <th className="px-6 py-3">Created</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {favorites.map((fav) => (
                <tr key={fav.id}>
                  <td className="px-6 py-3 text-gray-700">{fav.user_id || fav.userId}</td>
                  <td className="px-6 py-3 text-gray-700">{fav.entity_type || fav.entityType} • {fav.entity_id || fav.entityId}</td>
                  <td className="px-6 py-3 text-gray-500">{fav.created_at ? new Date(fav.created_at).toLocaleString() : ''}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => deleteFavorite(fav.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {favorites.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-6 text-center text-gray-500">No favorites yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-medium">
              <tr>
                <th className="px-6 py-3">User</th>
                <th className="px-6 py-3">Items</th>
                <th className="px-6 py-3">Subtotal</th>
                <th className="px-6 py-3">Updated</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {carts.map((cart) => (
                <tr key={cart.id}>
                  <td className="px-6 py-3 text-gray-700">{cart.user?.name || cart.user?.email || cart.user_id || cart.userId}</td>
                  <td className="px-6 py-3 text-gray-700">{cart.items_count ?? 0} items</td>
                  <td className="px-6 py-3 text-gray-700">{formatPrice(cart.subtotal ?? 0)}</td>
                  <td className="px-6 py-3 text-gray-500">{cart.updated_at ? new Date(cart.updated_at).toLocaleString() : ''}</td>
                  <td className="px-6 py-3 text-right space-x-2">
                    <button
                      onClick={() => openCart(cart.id)}
                      className="text-blue-600 hover:text-blue-700"
                      title="View cart"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteCart(cart.id)}
                      className="text-red-600 hover:text-red-700"
                      title="Delete cart"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {carts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-gray-500">No carts found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedCart && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Cart Details</h3>
                <p className="text-sm text-gray-500">{selectedCart.user?.name || selectedCart.user?.email || selectedCart.userId}</p>
              </div>
              <button onClick={() => setSelectedCart(null)} className="text-gray-400 hover:text-gray-600">?</button>
            </div>

            {cartLoading ? (
              <div className="p-6 text-center text-gray-500">Loading...</div>
            ) : (
              <div className="space-y-3">
                {selectedCart.items?.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                    <div>
                      <div className="font-semibold text-gray-900">{item.title}</div>
                      <div className="text-xs text-gray-500">Qty: {item.quantity} • {formatPrice(item.price)}</div>
                    </div>
                    <button
                      onClick={() => deleteCartItem(item.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {(!selectedCart.items || selectedCart.items.length === 0) && (
                  <div className="text-sm text-gray-500">No items in this cart.</div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setSelectedCart(null)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600"
              >
                Close
              </button>
              <button
                onClick={() => deleteCart(selectedCart.id)}
                className="px-4 py-2 rounded-lg bg-red-600 text-white"
              >
                Delete Cart
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommerceEngagement;
