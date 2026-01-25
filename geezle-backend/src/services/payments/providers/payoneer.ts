import { randomUUID } from 'crypto';

export interface PayoneerHostedSessionInput {
  amount: number;
  currency: string;
  country?: string;
  customerEmail: string;
  intentId: string;
  successUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  apiBaseUrl: string;
  authToken: string;
  createSessionPath: string;
}

export interface PayoneerHostedSessionResult {
  providerReferenceId: string;
  redirectUrl: string;
  raw: any;
}

export interface PayoneerNotificationResult {
  providerReferenceId: string;
  intentId: string;
  status: 'succeeded' | 'failed' | 'pending';
  raw: any;
}

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

export const initiateHostedCheckout = async (input: PayoneerHostedSessionInput): Promise<PayoneerHostedSessionResult> => {
  const {
    amount,
    currency,
    country,
    customerEmail,
    intentId,
    successUrl,
    cancelUrl,
    notifyUrl,
    apiBaseUrl,
    authToken,
    createSessionPath
  } = input;

  if (!apiBaseUrl || !authToken || !createSessionPath) {
    throw new Error('Payoneer configuration missing');
  }

  const requestPayload = {
    clientReferenceId: intentId,
    customer: {
      email: customerEmail
    },
    country,
    amount: {
      value: Number(amount.toFixed(2)),
      currency
    },
    returnUrls: {
      success: successUrl,
      cancel: cancelUrl
    },
    notificationUrl: notifyUrl
  };

  const response = await fetchJson(`${apiBaseUrl}${createSessionPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
      'X-Request-Id': randomUUID()
    },
    body: JSON.stringify(requestPayload)
  });

  const redirectUrl =
    response?.redirectUrl ||
    response?.redirect_url ||
    response?.links?.find?.((link: any) => link.rel === 'redirect')?.href ||
    response?.links?.[0]?.href;

  const providerReferenceId =
    response?.id ||
    response?.sessionId ||
    response?.checkoutId ||
    response?.referenceId ||
    intentId;

  if (!redirectUrl) {
    throw new Error('Payoneer did not return a redirect URL');
  }

  return {
    providerReferenceId,
    redirectUrl,
    raw: response
  };
};

export const parseNotification = (payload: any): PayoneerNotificationResult => {
  const intentId =
    payload?.clientReferenceId ||
    payload?.merchantReference ||
    payload?.referenceId ||
    payload?.intentId ||
    payload?.transactionId;

  const providerReferenceId =
    payload?.id ||
    payload?.paymentId ||
    payload?.sessionId ||
    payload?.transactionId ||
    intentId;

  const statusRaw = (payload?.status || payload?.paymentStatus || '').toString().toLowerCase();
  let status: 'succeeded' | 'failed' | 'pending' = 'pending';
  if (['success', 'succeeded', 'completed', 'paid'].includes(statusRaw)) status = 'succeeded';
  if (['failed', 'cancelled', 'canceled', 'declined'].includes(statusRaw)) status = 'failed';

  if (!intentId || !providerReferenceId) {
    throw new Error('Missing Payoneer notification reference');
  }

  return {
    providerReferenceId,
    intentId,
    status,
    raw: payload
  };
};
