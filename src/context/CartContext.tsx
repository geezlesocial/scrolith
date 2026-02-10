import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CartService } from '../services/cart';
import type { CartSummary } from '../types';
import { useUser } from './UserContext';
import { useSocket } from './SocketContext';

interface CartContextType {
  cart: CartSummary;
  refreshCart: () => Promise<void>;
  addToCart: (gigId: string, quantity?: number) => Promise<void>;
  addJobToCart: (jobId: string, quantity?: number) => Promise<void>;
  removeFromCart: (itemId: string, gigId?: string, jobId?: string) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  isInCart: (gigId: string) => boolean;
  isJobInCart: (jobId: string) => boolean;
}

const emptyCart: CartSummary = {
  items: [],
  subtotal: 0,
  totalItems: 0
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useUser();
  const { socket } = useSocket();
  const [cart, setCart] = useState<CartSummary>(emptyCart);
  const [loaded, setLoaded] = useState(false);

  const refreshCart = async () => {
    if (!isAuthenticated || !user) {
      setCart(emptyCart);
      setLoaded(true);
      return;
    }

    const data = await CartService.getCart();
    setCart(data);
    setLoaded(true);
  };

  useEffect(() => {
    refreshCart().catch(() => {
      setCart(emptyCart);
      setLoaded(true);
    });
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!loaded) return;
    if (!isAuthenticated) {
      setCart(emptyCart);
    }
  }, [isAuthenticated, loaded]);

  const addToCart = async (gigId: string, quantity = 1) => {
    if (!isAuthenticated || !user) {
      throw new Error('Please sign in to add items to your cart.');
    }
    const updated = await CartService.addItem(gigId, quantity);
    setCart(updated);
  };

  const addJobToCart = async (jobId: string, quantity = 1) => {
    if (!isAuthenticated || !user) {
      throw new Error('Please sign in to add items to your cart.');
    }
    const updated = await CartService.addJobItem(jobId, quantity);
    setCart(updated);
  };

  const removeFromCart = async (itemId: string, gigId?: string, jobId?: string) => {
    if (!isAuthenticated || !user) {
      throw new Error('Please sign in to manage your cart.');
    }
    const updated = itemId
      ? await CartService.removeItem(itemId)
      : gigId
        ? await CartService.removeByGigId(gigId)
        : jobId
          ? await CartService.removeByJobId(jobId)
        : emptyCart;
    setCart(updated);
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (!isAuthenticated || !user) {
      throw new Error('Please sign in to manage your cart.');
    }
    const updated = await CartService.updateItem(itemId, quantity);
    setCart(updated);
  };

  const clearCart = async () => {
    if (!isAuthenticated || !user) {
      throw new Error('Please sign in to manage your cart.');
    }
    const updated = await CartService.clear();
    setCart(updated);
  };

  const isInCart = (gigId: string) => cart.items.some((item) => item.gigId === gigId);
  const isJobInCart = (jobId: string) => cart.items.some((item) => item.jobId === jobId);

  useEffect(() => {
    if (!socket || !isAuthenticated || !user?.id) return;
    const onCartUpdated = () => {
      refreshCart().catch(() => null);
    };
    socket.on('cart:updated', onCartUpdated);
    return () => {
      socket.off('cart:updated', onCartUpdated);
    };
  }, [socket, isAuthenticated, user?.id]);

  useEffect(() => {
    const onCartUpdated = () => {
      refreshCart().catch(() => null);
    };
    window.addEventListener('cart:updated', onCartUpdated as EventListener);
    return () => {
      window.removeEventListener('cart:updated', onCartUpdated as EventListener);
    };
  }, []);

  const value = useMemo(
    () => ({
      cart,
      refreshCart,
      addToCart,
      addJobToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      isInCart,
      isJobInCart
    }),
    [cart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
};
