import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, Trash2, CreditCard, ShieldAlert, CheckCircle, Loader2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useCurrency } from '../context/CurrencyContext';
import { useNotification } from '../context/NotificationContext';
import { commerceService } from '../services/commerce';
import { PaymentService } from '../services/payment';
import { walletApi } from '../services/wallet';
import type { CartItem } from '../types';
import { getUserFacingPaymentMethodName } from '../utils/paymentGatewayDisplay';

const Cart = () => {
  const { cart, refreshCart, removeFromCart, clearCart } = useCart();
  const { formatPrice, currency } = useCurrency();
  const { showNotification } = useNotification();
  const [checkoutItem, setCheckoutItem] = useState<CartItem | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [gateways, setGateways] = useState<any[]>([]);
  const [selectedGateway, setSelectedGateway] = useState<string | null>(null);
  const [loadingGateways, setLoadingGateways] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [walletInfo, setWalletInfo] = useState<any | null>(null);

  const resolveItemUrl = (item: CartItem) => {
    if (item.itemType === 'job' || item.jobId) return `/jobs/${item.jobId}`;
    return `/gigs/${item.gigId}`;
  };

  const isJobItem = (item: CartItem) => item.itemType === 'job' || Boolean(item.jobId);

  useEffect(() => {
    refreshCart().catch(() => null);
  }, [refreshCart]);

  const loadGateways = async (item?: CartItem) => {
    setLoadingGateways(true);
    setCheckoutError(null);
    try {
      const [list, wallet] = await Promise.all([
        PaymentService.getActivePaymentMethods(),
        walletApi.getWalletInfo().catch(() => null)
      ]);
      setWalletInfo(wallet || null);
      const currencyCode = (currency.code || wallet?.currency || 'USD').toUpperCase();
      const requiredAmount = Number((item ?? checkoutItem)?.price ?? 0);
      const walletBalance = Number(wallet?.availableBalance ?? wallet?.available_balance ?? 0);
      const walletCurrency = (wallet?.currency || currencyCode).toUpperCase();
      const walletGateway = wallet
        ? {
            id: 'wallet',
            name: 'Wallet Balance',
            mode: 'wallet',
            logo: null,
            supported_currencies: wallet?.currency ? [wallet.currency] : [],
            is_enabled: true,
            balance: Number(wallet?.availableBalance ?? wallet?.available_balance ?? 0)
          }
        : null;
      const listWithWallet = walletGateway ? [walletGateway, ...list] : list;
      const compatible = listWithWallet.filter((gw: any) => {
        if (gw.id === 'wallet') {
          return walletBalance >= requiredAmount && walletCurrency === currencyCode;
        }
        const supported = Array.isArray(gw.supported_currencies || gw.supportedCurrencies)
          ? (gw.supported_currencies || gw.supportedCurrencies)
          : [];
        if (!supported.length) return true;
        return supported.map((c: string) => c.toUpperCase()).includes(currencyCode);
      });
      setGateways(listWithWallet);
      const current = selectedGateway;
      const stillExists = current && listWithWallet.some((gw: any) => gw.id === current);
      const currentSupported = current && compatible.some((gw: any) => gw.id === current);
      if ((!current || !stillExists || !currentSupported) && listWithWallet.length) {
        const pick = compatible.length ? compatible[0] : null;
        if (pick?.id) {
          setSelectedGateway(pick.id);
        } else {
          setSelectedGateway(null);
        }
      }
    } catch (error: any) {
      setCheckoutError(error?.message || 'Failed to load payment methods.');
    } finally {
      setLoadingGateways(false);
    }
  };

  const openCheckout = async (item: CartItem) => {
    setCheckoutItem(item);
    setShowCheckout(true);
    await loadGateways(item);
  };

  const handleStartPayment = async () => {
    if (!checkoutItem) return;
    if (isJobItem(checkoutItem)) {
      setCheckoutError('Job items are not purchased directly. Open the job and submit a proposal.');
      return;
    }
    if (!selectedGateway) {
      setCheckoutError('Please select a payment method.');
      return;
    }
    if (selectedGateway === 'wallet') {
      const walletBalance = Number(walletInfo?.availableBalance ?? walletInfo?.available_balance ?? 0);
      const requiredAmount = Number(checkoutItem.price ?? 0);
      const currencyCode = (currency.code || walletInfo?.currency || 'USD').toUpperCase();
      const walletCurrency = (walletInfo?.currency || currencyCode).toUpperCase();
      if (walletCurrency !== currencyCode) {
        setCheckoutError(`Wallet currency ${walletCurrency} does not match ${currencyCode}.`);
        return;
      }
      if (walletBalance < requiredAmount) {
        setCheckoutError('Insufficient wallet balance.');
        return;
      }
    }
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const result = await commerceService.purchaseGig(checkoutItem.gigId, {
        provider: selectedGateway,
        currency: currency.code
      });
      const redirectUrl = result?.redirect_url || result?.redirectUrl;
      if (redirectUrl) {
        window.location.href = redirectUrl;
        return;
      }
      showNotification('success', 'Order created', 'Your order was created. Check your dashboard for updates.');
      setShowCheckout(false);
    } catch (error: any) {
      setCheckoutError(error?.message || 'Unable to start payment.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center">
            <ShoppingCart className="w-8 h-8 text-blue-600 mr-3" />
            <h1 className="text-3xl font-bold text-gray-900">Cart</h1>
            <span className="ml-3 text-sm text-gray-500">({cart.totalItems} items)</span>
          </div>
          {cart.items.length > 0 && (
            <button
              onClick={() => clearCart().catch((err) => showNotification('error', 'Cart', err?.message || 'Unable to clear cart.'))}
              className="text-sm text-red-600 hover:text-red-700 font-semibold"
            >
              Clear Cart
            </button>
          )}
        </div>

        {cart.items.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-dashed border-gray-300">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShoppingCart className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Your cart is empty</h3>
            <p className="text-gray-500 mb-6">Browse gigs and add your favorites to the cart.</p>
            <Link
              to="/browse"
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition"
            >
              Browse Talent
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {cart.items.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col md:flex-row gap-4">
                  <div className="w-full md:w-40 h-28 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    {item.image && !isJobItem(item) ? (
                      <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                        {isJobItem(item) ? 'Job listing' : 'No image'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <Link to={resolveItemUrl(item)} className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                      {item.title}
                    </Link>
                    <div className="text-sm text-gray-500 mt-1">
                      {isJobItem(item)
                        ? `Client: ${item.clientName || 'Client'}`
                        : `Seller: ${item.freelancerName || 'Freelancer'}`}
                    </div>
                    <div className="mt-3 flex items-center gap-3 text-sm text-gray-600">
                      <span>Qty: {item.quantity}</span>
                      <span className="h-1 w-1 rounded-full bg-gray-300" />
                      <span className="font-semibold text-gray-900">
                        {isJobItem(item) ? item.budget || formatPrice(item.price) : formatPrice(item.price)}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {!isJobItem(item) ? (
                        <button
                          onClick={() => openCheckout(item)}
                          className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                        >
                          <CreditCard className="w-4 h-4 mr-2" />
                          Checkout
                        </button>
                      ) : (
                        <Link
                          to={resolveItemUrl(item)}
                          className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
                        >
                          View Job
                        </Link>
                      )}
                      <button
                        onClick={() =>
                          removeFromCart(item.id, item.gigId, item.jobId).catch((err) =>
                            showNotification('error', 'Cart', err?.message || 'Unable to remove item.')
                          )
                        }
                        className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 h-fit">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
              <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                <span>Subtotal</span>
                <span className="font-semibold text-gray-900">{formatPrice(cart.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Total items</span>
                <span>{cart.totalItems}</span>
              </div>
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-700 flex gap-2">
                <ShieldAlert className="w-4 h-4 mt-0.5" />
                <span>All payments must be completed on Scrolith. Do not pay sellers outside the platform.</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {showCheckout && checkoutItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Checkout</h3>
              <button
                onClick={() => setShowCheckout(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ?
              </button>
            </div>
            <div className="border rounded-xl p-4 mb-4">
              <div className="font-semibold text-gray-900">{checkoutItem.title}</div>
              <div className="text-sm text-gray-500">Seller: {checkoutItem.freelancerName || 'Freelancer'}</div>
              <div className="mt-2 text-lg font-bold text-gray-900">{formatPrice(checkoutItem.price)}</div>
            </div>

            {checkoutError && (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {checkoutError}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
              {loadingGateways ? (
                <div className="text-sm text-gray-500 flex items-center"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading methods...</div>
              ) : (
                <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
                  {gateways.map((gw) => {
                    const supported = Array.isArray(gw.supported_currencies || gw.supportedCurrencies)
                      ? (gw.supported_currencies || gw.supportedCurrencies)
                      : [];
                    const currencyCode = (currency.code || 'USD').toUpperCase();
                    const walletBalance = Number(walletInfo?.availableBalance ?? walletInfo?.available_balance ?? 0);
                    const requiredAmount = Number(checkoutItem.price ?? 0);
                    const walletCurrency = (walletInfo?.currency || currencyCode).toUpperCase();
                    const isWallet = gw.id === 'wallet';
                    const gatewayDisplayName = getUserFacingPaymentMethodName(gw);
                    const isSupported = isWallet
                      ? walletBalance >= requiredAmount && walletCurrency === currencyCode
                      : supported.length === 0
                        ? true
                        : supported.map((c: string) => c.toUpperCase()).includes(currencyCode);
                    const gatewayStatusText = isWallet
                      ? `Balance: ${formatPrice(walletBalance)}${!isSupported ? ' - Insufficient balance' : ''}`
                      : !isSupported
                        ? `Not available for ${currency.code}`
                        : '';
                    return (
                      <label
                        key={gw.id}
                        className={`flex items-center gap-3 border rounded-lg p-3 hover:border-blue-500 ${
                          isSupported ? 'cursor-pointer' : 'opacity-60'
                        }`}
                      >
                        <input
                          type="radio"
                          name="payment-method"
                          value={gw.id}
                          checked={selectedGateway === gw.id}
                          onChange={() => isSupported && setSelectedGateway(gw.id)}
                          disabled={!isSupported}
                        />
                        <div>
                          <div className="font-semibold text-gray-900">{gatewayDisplayName}</div>
                          {gatewayStatusText && <div className="text-xs text-gray-500">{gatewayStatusText}</div>}
                        </div>
                      </label>
                    );
                  })}
                  {gateways.length === 0 && (
                    <div className="text-sm text-gray-500">No payment methods available.</div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleStartPayment}
              disabled={checkoutLoading || loadingGateways || !gateways.length || !selectedGateway}
              className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-70"
            >
              {checkoutLoading ? 'Processing...' : 'Pay Now'}
            </button>

            <div className="mt-4 text-xs text-gray-500 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Payments are processed securely on Scrolith.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Cart;

