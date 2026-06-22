import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { initiateHostedCheckout } from '../services/payments/providers/payoneer';
import { createFxLock } from '../services/fxLock.service';
import { computeCommissionBreakdown } from '../utils/commission';
import { notifyAdmins } from '../utils/notify';
import { sendSystemMessage } from '../services/systemMessaging';
import { maybeDecryptSecret } from '../utils/secretCipher';
import { getStripeClient } from '../services/stripeConfig.service';
import { awardAffiliateFirstPurchaseCommission } from '../services/affiliateProgram.service';
import { publishIntegrationEvent } from '../services/talentCloud.service';

const nowIso = () => new Date().toISOString();

const ok = <T>(res: Response, data: T) => res.json({ success: true, data, timestamp: nowIso() });
const fail = (res: Response, status: number, message: string, code = 'ERR_ORDER_PAYMENT') =>
  res.status(status).json({ success: false, error: message, code, timestamp: nowIso() });

const serializePayload = (p: unknown) => {
  try {
    return JSON.parse(JSON.stringify(p));
  } catch {
    return null;
  }
};

const buildClientOrderLink = (orderId: string) =>
  `/client/dashboard?tab=orders&order_id=${encodeURIComponent(orderId)}`;

const buildFreelancerOrderLink = (orderId: string) =>
  `/freelancer/dashboard?tab=orders&order_id=${encodeURIComponent(orderId)}`;

const getOrCreateSettings = async () => {
  let settings = await prisma.settings.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!settings) {
    settings = await prisma.settings.create({ data: {} });
  }
  return settings;
};

const getAdminRevenueUserId = async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  return admin?.id || null;
};

const normalizeRouting = (routing: any) => {
  if (Array.isArray(routing)) return routing;
  return [{ country: '*', currency: '*', providers: ['stripe', 'paypal'] }];
};

const normalizeProvidersConfig = (settings: any) => {
  if (settings?.walletFundingProviders && typeof settings.walletFundingProviders === 'object') {
    return settings.walletFundingProviders as Record<string, any>;
  }
  return {};
};

const getOrCreateWallet = async (userId: string) => {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.wallet.create({
    data: {
      userId,
      balance: 0,
      pendingClearance: 0,
      escrowBalance: 0,
      frozen: false,
      currency: 'USD'
    }
  });
};

const getProviderConfig = (provider: string, settings: any) => {
  const config = normalizeProvidersConfig(settings);
  const entry = config?.[provider] || {};

  if (provider === 'stripe') {
    return {
      enabled: entry?.enabled ?? true,
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.STRIPE_SECRET_KEY),
      webhookSecret: maybeDecryptSecret(entry?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET)
    };
  }

  if (provider === 'paypal') {
    return {
      enabled: entry?.enabled ?? false,
      clientId: entry?.clientId || settings?.paymentPaypalClientId || process.env.PAYPAL_CLIENT_ID,
      clientSecret: maybeDecryptSecret(entry?.clientSecret || settings?.paymentPaypalSecret || process.env.PAYPAL_SECRET),
      environment: entry?.environment || process.env.PAYPAL_ENV || 'sandbox'
    };
  }

  if (provider === 'paystack') {
    return {
      enabled: entry?.enabled ?? false,
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.PAYSTACK_SECRET_KEY)
    };
  }

  if (provider === 'flutterwave') {
    return {
      enabled: entry?.enabled ?? false,
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.FLUTTERWAVE_SECRET_KEY)
    };
  }

  if (provider === 'paymongo') {
    return {
      enabled: entry?.enabled ?? false,
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.PAYMONGO_SECRET_KEY)
    };
  }

  if (provider === 'xendit') {
    return {
      enabled: entry?.enabled ?? false,
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.XENDIT_SECRET_KEY),
      callbackToken: maybeDecryptSecret(entry?.callbackToken || process.env.XENDIT_CALLBACK_TOKEN)
    };
  }

  if (provider === 'monnify') {
    return {
      enabled: entry?.enabled ?? false,
      apiKey: maybeDecryptSecret(entry?.apiKey || process.env.MONNIFY_API_KEY),
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.MONNIFY_SECRET_KEY),
      contractCode: maybeDecryptSecret(entry?.contractCode || process.env.MONNIFY_CONTRACT_CODE)
    };
  }

  if (provider === 'opay') {
    return {
      enabled: entry?.enabled ?? false,
      merchantId: maybeDecryptSecret(entry?.merchantId || process.env.OPAY_MERCHANT_ID),
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.OPAY_SECRET_KEY)
    };
  }

  if (provider === 'dragonpay') {
    return {
      enabled: entry?.enabled ?? false,
      merchantId: maybeDecryptSecret(entry?.merchantId || process.env.DRAGONPAY_MERCHANT_ID),
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.DRAGONPAY_SECRET_KEY)
    };
  }

  if (provider === 'payoneer') {
    return {
      enabled: entry?.enabled ?? false,
      clientId: entry?.clientId || process.env.PAYONEER_CLIENT_ID,
      clientSecret: maybeDecryptSecret(entry?.clientSecret || process.env.PAYONEER_CLIENT_SECRET),
      programId: entry?.programId || process.env.PAYONEER_PROGRAM_ID,
      apiBaseUrl: entry?.apiBaseUrl || process.env.PAYONEER_API_BASE_URL,
      authToken: maybeDecryptSecret(entry?.authToken || process.env.PAYONEER_AUTH_TOKEN),
      notificationSecret: maybeDecryptSecret(entry?.notificationSecret || process.env.PAYONEER_NOTIFICATION_SECRET),
      createSessionPath: entry?.createSessionPath || process.env.PAYONEER_CREATE_SESSION_PATH || '/checkout/hosted/session'
    };
  }

  return {
    enabled: entry?.enabled ?? false
  };
};

const isProviderEnabled = (provider: string, settings: any) => {
  if (provider === 'wallet' || provider === 'balance') return true;
  const config = getProviderConfig(provider, settings);
  if (config?.enabled === false) return false;
  if (config?.enabled === true) return true;
  if (provider === 'stripe') return Boolean(config?.secretKey || settings?.paymentStripeSecret);
  if (provider === 'paypal') return Boolean(config?.clientId && config?.clientSecret);
  if (provider === 'paystack') return Boolean(config?.secretKey);
  if (provider === 'flutterwave') return Boolean(config?.secretKey);
  if (provider === 'paymongo') return Boolean(config?.secretKey);
  if (provider === 'xendit') return Boolean(config?.secretKey);
  if (provider === 'monnify') return Boolean(config?.apiKey && config?.secretKey && config?.contractCode);
  if (provider === 'opay') return Boolean(config?.merchantId && config?.secretKey);
  if (provider === 'dragonpay') return Boolean(config?.merchantId && config?.secretKey);
  if (provider === 'payoneer') return Boolean(config?.clientId && config?.clientSecret);
  return false;
};

const selectProvider = (country: string, currency: string, settings: any) => {
  const routing = normalizeRouting(settings?.walletFundingRouting);
  const normalizedCountry = (country || '*').toUpperCase();
  const normalizedCurrency = (currency || '*').toUpperCase();

  const candidates = routing.filter((rule: any) => {
    const ruleCountry = (rule.country || '*').toUpperCase();
    const ruleCurrency = (rule.currency || '*').toUpperCase();
    const countryMatch = ruleCountry === '*' || ruleCountry === normalizedCountry;
    const currencyMatch = ruleCurrency === '*' || ruleCurrency === normalizedCurrency;
    return countryMatch && currencyMatch;
  });

  for (const rule of candidates) {
    const providers = Array.isArray(rule.providers) ? rule.providers : [];
    for (const provider of providers) {
      if (isProviderEnabled(provider, settings)) {
        return provider;
      }
    }
  }
  return null;
};

const getPaypalBaseUrl = (environment: string) =>
  environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const getPaymongoBaseUrl = () => 'https://api.paymongo.com';
const getXenditBaseUrl = () => 'https://api.xendit.co';
const getMonnifyBaseUrl = () => 'https://api.monnify.com';
const getOpayBaseUrl = () => process.env.OPAY_BASE_URL || 'https://api.opaycheckout.com';
const getDragonpayBaseUrl = () => process.env.DRAGONPAY_BASE_URL || 'https://gw.dragonpay.ph/Pay.aspx';

const fetchJson = async (url: string, options: any) => {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
};

const resolvePackagePricing = (gig: any, packageIndex: number) => {
  const packages = Array.isArray(gig?.packages) ? gig.packages : [];
  if (packages.length === 0) {
    return {
      price: Number(gig?.price ?? 0),
      deliveryDays: Number(gig?.deliveryTime ?? 1),
      packageName: undefined
    };
  }
  const safeIndex = Number.isFinite(packageIndex) && packageIndex >= 0 ? packageIndex : 0;
  const pkg = packages[safeIndex] || packages[0];
  return {
    price: Number(pkg?.price ?? gig?.price ?? 0),
    deliveryDays: Number(pkg?.deliveryDays ?? pkg?.delivery_days ?? gig?.deliveryTime ?? 1),
    packageName: pkg?.name
  };
};

const resolveExtrasTotal = (gig: any, selectedExtras: any[]) => {
  const extras = Array.isArray(gig?.extras) ? gig.extras : [];
  if (!extras.length || !selectedExtras.length) return 0;
  const indices = selectedExtras
    .map((extra) => {
      if (typeof extra === 'number') return extra;
      if (typeof extra === 'string' && /^\d+$/.test(extra)) return Number(extra);
      const found = extras.findIndex((e: any) => e?.id === extra || e?.title === extra || e?.name === extra);
      return found;
    })
    .filter((idx) => Number.isFinite(idx) && idx >= 0);
  return indices.reduce((sum, idx) => {
    const extra = extras[idx];
    const price = Number(extra?.price ?? 0);
    return Number.isFinite(price) ? sum + price : sum;
  }, 0);
};

export const purchaseGig = async (req: Request, res: Response) => {
  try {
    const user = req.user as { id: string; role?: string; email?: string; country?: string | null } | undefined;
    if (!user?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');

    const gig = await prisma.gig.findUnique({
      where: { id: req.params.id },
      include: { user: true }
    });
    if (!gig || !gig.isActive || gig.adminStatus !== 'APPROVED' || gig.status !== 'ACTIVE') {
      return fail(res, 404, 'Gig not available', 'ERR_GIG_NOT_AVAILABLE');
    }
    if (gig.userId === user.id) {
      return fail(res, 400, 'You cannot purchase your own gig', 'ERR_SELF_PURCHASE');
    }

    const packageIndex = Number(req.body?.packageIndex ?? 0);
    const { price, deliveryDays, packageName } = resolvePackagePricing(gig, Number.isFinite(packageIndex) ? packageIndex : 0);
    const extras = Array.isArray(req.body?.extras) ? req.body.extras : [];
    const extrasTotal = resolveExtrasTotal(gig, extras);
    const baseAmount = price + extrasTotal;

    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      return fail(res, 400, 'Invalid pricing for this gig', 'ERR_INVALID_PRICING');
    }

    const settings = await getOrCreateSettings();
    const commissionBreakdown = computeCommissionBreakdown(baseAmount, settings);
    const employerFee = commissionBreakdown.employerFee;
    const freelancerCommission = commissionBreakdown.freelancerFee;
    const totalCharged = Number((baseAmount + employerFee).toFixed(2));
    const adminRevenueUserId = employerFee > 0 ? await getAdminRevenueUserId() : null;
    const currency = (req.body?.currency || settings.paymentCurrency || settings.currency || 'USD').toString().toUpperCase();
    const country = (req.body?.country || user.country || 'US').toString().toUpperCase();
    const requestedProvider = (req.body?.provider || 'auto').toString().toLowerCase();

    let provider = requestedProvider;
    if (requestedProvider === 'auto') {
      provider = selectProvider(country, currency, settings) || '';
    }
    if (!provider) {
      return fail(res, 400, 'No payment provider available for this region/currency', 'ERR_NO_PROVIDER');
    }

    const safeDeliveryDays = Number.isFinite(deliveryDays) ? deliveryDays : 1;
    const deliveryDate = new Date(Date.now() + Math.max(1, safeDeliveryDays) * 86400000);

    if (provider === 'wallet' || provider === 'balance') {
      const wallet = await getOrCreateWallet(user.id);
      const walletCurrency = (wallet.currency || 'USD').toString().toUpperCase();
      if (walletCurrency !== currency) {
        return fail(res, 400, `Wallet currency ${walletCurrency} does not match ${currency}`, 'ERR_WALLET_CURRENCY');
      }
      if (wallet.frozen) {
        return fail(res, 403, 'Wallet is frozen', 'ERR_WALLET_FROZEN');
      }
      if (Number(wallet.balance) < totalCharged) {
        return fail(res, 400, 'Insufficient wallet balance', 'ERR_WALLET_INSUFFICIENT');
      }

      const result = await prisma.$transaction(async (tx) => {
        const freshWallet = await tx.wallet.findUnique({ where: { id: wallet.id } });
        if (!freshWallet) throw new Error('Wallet not found');
        if (freshWallet.frozen) throw new Error('Wallet is frozen');
        if (Number(freshWallet.balance) < totalCharged) throw new Error('Insufficient wallet balance');

        const order = await tx.order.create({
          data: {
            gigId: gig.id,
            clientId: user.id,
            freelancerId: gig.userId,
            amount: baseAmount,
            status: 'PAID',
            deliveryDate
          }
        });

        await tx.escrow.create({
          data: {
            orderId: order.id,
            clientId: user.id,
            freelancerId: gig.userId,
            amount: baseAmount,
            commission: freelancerCommission,
            status: 'FUNDED',
            fundedAt: new Date()
          }
        });

        const createdIntent = await tx.orderPaymentIntent.create({
          data: {
            orderId: order.id,
            clientId: user.id,
            provider: 'wallet',
            amount: totalCharged,
            currency,
            country,
            status: 'succeeded',
            providerReferenceId: `wallet-${order.id}`
          }
        });

        const fxLock = await createFxLock(
          {
            entityType: 'ORDER_PAYMENT_INTENT',
            entityId: createdIntent.id,
            fromCurrency: currency,
            toCurrency: currency,
            sourceAmount: totalCharged,
            metadata: {
              orderId: order.id,
              gigId: gig.id,
              clientId: user.id,
              provider: 'wallet',
              baseAmount,
              employerFee
            }
          },
          tx
        );

        const intent = await tx.orderPaymentIntent.update({
          where: { id: createdIntent.id },
          data: { fxLockId: fxLock.id }
        });

        await tx.wallet.update({
          where: { id: freshWallet.id },
          data: {
            balance: Number(freshWallet.balance) - totalCharged,
            escrowBalance: Number(freshWallet.escrowBalance) + baseAmount
          }
        });

        await tx.transaction.create({
          data: {
            userId: user.id,
            walletId: freshWallet.id,
            type: 'PAYMENT',
            amount: totalCharged * -1,
            status: 'COMPLETED',
            description: `Gig purchase: ${gig.title}`,
            referenceId: order.id,
            metadata: {
              orderId: order.id,
              gigId: gig.id,
              provider: 'wallet',
              currency,
              amount: baseAmount,
              employerFee,
              freelancerCommission,
              totalCharged
            }
          }
        });

        if (adminRevenueUserId && employerFee > 0) {
          await tx.transaction.create({
            data: {
              userId: adminRevenueUserId,
              type: 'COMMISSION',
              amount: employerFee,
              status: 'COMPLETED',
              description: `Employer processing fee for order ${order.id}`,
              referenceId: order.id,
              metadata: {
                orderId: order.id,
                sourceUserId: user.id,
                employerFee,
                currency
              }
            }
          });
        }

        return { order, intent };
      });

      try {
        const ns = (req.app.get('communityNs') || req.app.get('communityIo')) as any;
        if (ns && typeof ns.to === 'function') {
          ns.to(`community:user:${user.id}`).emit('orders:updated', { orderId: result.order.id, status: 'PAID' });
          ns.to(`community:user:${gig.userId}`).emit('orders:updated', { orderId: result.order.id, status: 'PAID' });
        }
      } catch {
        // ignore socket failures
      }
      notifyAdmins({
        type: 'order',
        title: 'Order paid',
        body: `Order ${result.order.id} was paid.`,
        link: '/admin/dashboard?tab=overview',
        meta: { orderId: result.order.id, status: 'PAID' }
      });

      try {
        const clientOrderLink = buildClientOrderLink(result.order.id);
        const freelancerOrderLink = buildFreelancerOrderLink(result.order.id);
        void sendSystemMessage({
          templateKey: 'order_update',
          userId: user.id,
          context: {
            order: { id: result.order.id, status: 'PAID', total: baseAmount, link: clientOrderLink },
            currency
          },
          actionUrl: clientOrderLink,
          typeOverride: 'order'
        });
        void sendSystemMessage({
          templateKey: 'order_update',
          userId: gig.userId,
          context: {
            order: { id: result.order.id, status: 'PAID', total: baseAmount, link: freelancerOrderLink },
            currency
          },
          actionUrl: freelancerOrderLink,
          typeOverride: 'order'
        });
      } catch (notifyError) {
        console.warn('Order paid notification failed', notifyError);
      }

      try {
        await awardAffiliateFirstPurchaseCommission({
          referredUserId: user.id,
          orderId: result.order.id,
          orderAmount: baseAmount,
          currency
        });
      } catch (affiliateError) {
        console.warn('Affiliate first purchase commission failed', affiliateError);
      }

      return ok(res, {
        order_id: result.order.id,
        intent_id: result.intent.id,
        provider: 'wallet',
        amount: totalCharged,
        currency,
        status: 'paid',
        fx_lock_id: result.intent.fxLockId || null
      });
    }

    if (!isProviderEnabled(provider, settings)) {
      return fail(res, 400, 'Selected provider is not enabled', 'ERR_PROVIDER_DISABLED');
    }

    const { order, intent } = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          gigId: gig.id,
          clientId: user.id,
          freelancerId: gig.userId,
          amount: baseAmount,
          status: 'PENDING',
          deliveryDate
        }
      });

      await tx.escrow.create({
        data: {
          orderId: order.id,
          clientId: user.id,
          freelancerId: gig.userId,
          amount: baseAmount,
          commission: freelancerCommission,
          status: 'PENDING'
        }
      });

      const createdIntent = await tx.orderPaymentIntent.create({
        data: {
          orderId: order.id,
          clientId: user.id,
          provider,
          amount: totalCharged,
          currency,
          country,
          status: 'initiated'
        }
      });

      const fxLock = await createFxLock(
        {
          entityType: 'ORDER_PAYMENT_INTENT',
          entityId: createdIntent.id,
          fromCurrency: currency,
          toCurrency: currency,
          sourceAmount: totalCharged,
          metadata: {
            orderId: order.id,
            gigId: gig.id,
            clientId: user.id,
            provider,
            baseAmount,
            employerFee
          }
        },
        tx
      );

      const intent = await tx.orderPaymentIntent.update({
        where: { id: createdIntent.id },
        data: { fxLockId: fxLock.id }
      });

      return { order, intent };
    });

    try {
      const ns = (req.app.get('communityNs') || req.app.get('communityIo')) as any;
      if (ns && typeof ns.to === 'function') {
        ns.to(`community:user:${user.id}`).emit('orders:updated', { orderId: order.id, status: 'PENDING' });
        ns.to(`community:user:${gig.userId}`).emit('orders:updated', { orderId: order.id, status: 'PENDING' });
      }
    } catch {
      // ignore socket failures
    }
    notifyAdmins({
      type: 'order',
      title: 'Order pending',
      body: `Order ${order.id} was created and is pending payment.`,
      link: '/admin/dashboard?tab=overview',
      meta: { orderId: order.id, status: 'PENDING' }
    });

    try {
      const clientOrderLink = buildClientOrderLink(order.id);
      const freelancerOrderLink = buildFreelancerOrderLink(order.id);
      void sendSystemMessage({
        templateKey: 'order_update',
        userId: user.id,
        context: {
          order: { id: order.id, status: 'PENDING', total: baseAmount, link: clientOrderLink },
          currency
        },
        actionUrl: clientOrderLink,
        typeOverride: 'order'
      });
      void sendSystemMessage({
        templateKey: 'order_update',
        userId: gig.userId,
        context: {
          order: { id: order.id, status: 'PENDING', total: baseAmount, link: freelancerOrderLink },
          currency
        },
        actionUrl: freelancerOrderLink,
        typeOverride: 'order'
      });
    } catch (notifyError) {
      console.warn('Order pending notification failed', notifyError);
    }

    await publishIntegrationEvent('order.created', {
      orderId: order.id,
      gigId: gig.id,
      clientId: user.id,
      freelancerId: gig.userId,
      status: order.status,
      amount: order.amount,
      provider,
      orderPaymentIntentId: intent.id,
      currency
    });

    const frontendBase = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
    const role = (user.role || '').toString().toLowerCase();
    const dashboardPath = role.includes('freelancer') || role.includes('seller')
      ? '/freelancer/dashboard'
      : '/client/dashboard';
    const successUrl = `${frontendBase}${dashboardPath}?tab=orders&order_id=${order.id}&payment_status=success`;
    const cancelUrl = `${frontendBase}${dashboardPath}?tab=orders&order_id=${order.id}&payment_status=cancel`;
    const orderIntentResponseMeta = {
      fx_lock_id: intent.fxLockId || null
    };

    if (provider === 'stripe') {
      const stripeClient = await getStripeClient();
      if (!stripeClient) {
        return fail(res, 400, 'Stripe is not configured', 'ERR_PROVIDER_CONFIG');
      }
      const session = await stripeClient.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: Math.round(totalCharged * 100),
              product_data: {
                name: gig.title,
                description: packageName ? `Package: ${packageName}` : undefined
              }
            }
          }
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: order.id,
        metadata: {
          orderId: order.id,
          orderPaymentIntentId: intent.id
        }
      });

      await prisma.orderPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: session.id,
          providerCheckoutUrl: session.url,
          providerPayload: serializePayload(session)
        }
      });

      return ok(res, {
        order_id: order.id,
        intent_id: intent.id,
        provider,
        redirect_url: session.url,
        amount: totalCharged,
        currency,
        ...orderIntentResponseMeta
      });
    }

    if (provider === 'paypal') {
      const config = getProviderConfig('paypal', settings);
      if (!config?.clientId || !config?.clientSecret) {
        return fail(res, 400, 'PayPal is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const baseUrl = getPaypalBaseUrl(config.environment || 'sandbox');
      const token = await fetchJson(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      const orderResp = await fetchJson(`${baseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              amount: {
                currency_code: currency,
                value: totalCharged.toFixed(2)
              },
              custom_id: intent.id,
              invoice_id: order.id,
              description: `Gig: ${gig.title}`
            }
          ],
          application_context: {
            return_url: successUrl,
            cancel_url: cancelUrl
          }
        })
      });

      const approveLink = (orderResp.links || []).find((link: any) => link.rel === 'approve');

      await prisma.orderPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: orderResp.id,
          providerCheckoutUrl: approveLink?.href || null,
          providerPayload: serializePayload(orderResp)
        }
      });

      return ok(res, {
        order_id: order.id,
        intent_id: intent.id,
        provider,
        redirect_url: approveLink?.href || null,
        amount: totalCharged,
        currency,
        ...orderIntentResponseMeta
      });
    }

    if (provider === 'paystack') {
      const config = getProviderConfig('paystack', settings);
      if (!config?.secretKey) {
        return fail(res, 400, 'Paystack is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const init = await fetchJson('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: Math.round(totalCharged * 100),
          email: user.email || 'user@example.com',
          reference: intent.id,
          currency,
          callback_url: successUrl
        })
      });

      const checkoutUrl = init?.data?.authorization_url || null;
      const referenceId = init?.data?.reference || intent.id;

      await prisma.orderPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: referenceId,
          providerCheckoutUrl: checkoutUrl,
          providerPayload: serializePayload(init)
        }
      });

      return ok(res, {
        order_id: order.id,
        intent_id: intent.id,
        provider,
        redirect_url: checkoutUrl,
        amount: totalCharged,
        currency,
        ...orderIntentResponseMeta
      });
    }

    if (provider === 'flutterwave') {
      const config = getProviderConfig('flutterwave', settings);
      if (!config?.secretKey) {
        return fail(res, 400, 'Flutterwave is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const init = await fetchJson('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tx_ref: intent.id,
          amount: totalCharged,
          currency,
          redirect_url: successUrl,
          customer: {
            email: user.email || 'user@example.com',
            name: user.email ? user.email.split('@')[0] : 'Scrolith User'
          },
          customizations: {
            title: 'Scrolith Gig Purchase',
            description: gig.title
          }
        })
      });

      const checkoutUrl = init?.data?.link || init?.data?.checkoutUrl || null;
      const referenceId = init?.data?.tx_ref || intent.id;

      await prisma.orderPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: referenceId,
          providerCheckoutUrl: checkoutUrl,
          providerPayload: serializePayload(init)
        }
      });

      return ok(res, {
        order_id: order.id,
        intent_id: intent.id,
        provider,
        redirect_url: checkoutUrl,
        amount: totalCharged,
        currency,
        ...orderIntentResponseMeta
      });
    }

    if (provider === 'paymongo') {
      const config = getProviderConfig('paymongo', settings);
      if (!config?.secretKey) {
        return fail(res, 400, 'PayMongo is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const init = await fetchJson(`${getPaymongoBaseUrl()}/v1/links`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {
            attributes: {
              amount: Math.round(totalCharged * 100),
              description: `Gig: ${gig.title}`,
              remarks: `Order ${order.id}`
            }
          }
        })
      });

      const checkoutUrl = init?.data?.attributes?.checkout_url || null;
      const referenceId = init?.data?.id || intent.id;

      await prisma.orderPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: referenceId,
          providerCheckoutUrl: checkoutUrl,
          providerPayload: serializePayload(init)
        }
      });

      return ok(res, {
        order_id: order.id,
        intent_id: intent.id,
        provider,
        redirect_url: checkoutUrl,
        amount: totalCharged,
        currency,
        ...orderIntentResponseMeta
      });
    }

    if (provider === 'xendit') {
      const config = getProviderConfig('xendit', settings);
      if (!config?.secretKey) {
        return fail(res, 400, 'Xendit is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const init = await fetchJson(`${getXenditBaseUrl()}/v2/invoices`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          external_id: intent.id,
          amount: totalCharged,
          payer_email: user.email || 'user@example.com',
          description: `Gig: ${gig.title}`,
          currency
        })
      });

      const checkoutUrl = init?.invoice_url || null;
      const referenceId = init?.id || null;

      await prisma.orderPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: referenceId,
          providerCheckoutUrl: checkoutUrl,
          providerPayload: serializePayload(init)
        }
      });

      return ok(res, {
        order_id: order.id,
        intent_id: intent.id,
        provider,
        redirect_url: checkoutUrl,
        amount: totalCharged,
        currency,
        ...orderIntentResponseMeta
      });
    }

    if (provider === 'monnify') {
      const config = getProviderConfig('monnify', settings);
      if (!config?.apiKey || !config?.secretKey || !config?.contractCode) {
        return fail(res, 400, 'Monnify is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const token = await fetchJson(`${getMonnifyBaseUrl()}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.secretKey}`).toString('base64')}`
        }
      });

      const init = await fetchJson(`${getMonnifyBaseUrl()}/api/v1/merchant/transactions/init-transaction`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.responseBody?.accessToken || token.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: totalCharged,
          customerName: user.email ? user.email.split('@')[0] : 'Scrolith User',
          customerEmail: user.email || 'user@example.com',
          paymentReference: intent.id,
          currencyCode: currency,
          contractCode: config.contractCode,
          redirectUrl: successUrl
        })
      });

      const checkoutUrl = init?.responseBody?.checkoutUrl || init?.responseBody?.paymentUrl || null;
      const referenceId = init?.responseBody?.transactionReference || intent.id;

      await prisma.orderPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: referenceId,
          providerCheckoutUrl: checkoutUrl,
          providerPayload: serializePayload(init)
        }
      });

      return ok(res, {
        order_id: order.id,
        intent_id: intent.id,
        provider,
        redirect_url: checkoutUrl,
        amount: totalCharged,
        currency,
        ...orderIntentResponseMeta
      });
    }

    if (provider === 'opay') {
      const config = getProviderConfig('opay', settings);
      if (!config?.merchantId || !config?.secretKey) {
        return fail(res, 400, 'OPay is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const init = await fetchJson(`${getOpayBaseUrl()}/api/v1/international/cashier`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          merchantId: config.merchantId,
          amount: totalCharged,
          currency,
          reference: intent.id,
          callbackUrl: successUrl,
          customerEmail: user.email || 'user@example.com'
        })
      });

      const checkoutUrl = init?.data?.cashierUrl || init?.data?.checkoutUrl || null;
      const referenceId = init?.data?.reference || intent.id;

      await prisma.orderPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: referenceId,
          providerCheckoutUrl: checkoutUrl,
          providerPayload: serializePayload(init)
        }
      });

      return ok(res, {
        order_id: order.id,
        intent_id: intent.id,
        provider,
        redirect_url: checkoutUrl,
        amount: totalCharged,
        currency,
        ...orderIntentResponseMeta
      });
    }

    if (provider === 'dragonpay') {
      const config = getProviderConfig('dragonpay', settings);
      if (!config?.merchantId || !config?.secretKey) {
        return fail(res, 400, 'Dragonpay is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const email = user.email || 'user@example.com';
      const description = encodeURIComponent('Scrolith Gig Purchase');
      const redirectUrl = `${getDragonpayBaseUrl()}?merchantid=${encodeURIComponent(config.merchantId)}&txnid=${encodeURIComponent(intent.id)}&amount=${encodeURIComponent(totalCharged.toFixed(2))}&ccy=${encodeURIComponent(currency)}&description=${description}&email=${encodeURIComponent(email)}`;

      await prisma.orderPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: intent.id,
          providerCheckoutUrl: redirectUrl,
          providerPayload: serializePayload({
            merchantId: config.merchantId,
            txnid: intent.id,
            amount: totalCharged,
            currency
          })
        }
      });

      return ok(res, {
        order_id: order.id,
        intent_id: intent.id,
        provider,
        redirect_url: redirectUrl,
        amount: totalCharged,
        currency,
        ...orderIntentResponseMeta
      });
    }

    if (provider === 'payoneer') {
      const config = getProviderConfig('payoneer', settings);
      if (!config?.apiBaseUrl || !config?.authToken) {
        return fail(res, 400, 'Payoneer is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const notifyUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payments/payoneer/notify?token=${encodeURIComponent(config.notificationSecret || '')}`;

      const session = await initiateHostedCheckout({
        amount: totalCharged,
        currency,
        country,
        customerEmail: user.email || 'user@example.com',
        intentId: intent.id,
        successUrl,
        cancelUrl,
        notifyUrl,
        apiBaseUrl: config.apiBaseUrl,
        authToken: config.authToken,
        createSessionPath: config.createSessionPath
      });

      await prisma.orderPaymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: session.providerReferenceId,
          providerCheckoutUrl: session.redirectUrl,
          providerPayload: serializePayload(session.raw)
        }
      });

      return ok(res, {
        order_id: order.id,
        intent_id: intent.id,
        provider,
        redirect_url: session.redirectUrl,
        amount: totalCharged,
        currency,
        ...orderIntentResponseMeta
      });
    }

    return fail(res, 400, `Provider ${provider} is not implemented yet`, 'ERR_PROVIDER_UNSUPPORTED');
  } catch (error: any) {
    console.error('Purchase gig error:', error);
    return fail(res, 500, error?.message || 'Failed to initiate payment', 'ERR_INTERNAL');
  }
};

