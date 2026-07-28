/**
 * Antom (Alipay+ AMS) cashier payment integration.
 * Admin-configured credentials live in Settings.walletFundingProviders.antom.
 *
 * Docs: https://docs.antom.com/ac/ams/payment_cashier
 * Signature: https://docs.antom.com/ac/ams/digital_signature
 */
import crypto from 'crypto';

export type AntomEnvironment = 'sandbox' | 'live';

export type AntomProviderConfig = {
  enabled?: boolean;
  clientId?: string;
  merchantPrivateKey?: string;
  antomPublicKey?: string;
  environment?: AntomEnvironment | string;
  gatewayBaseUrl?: string;
  /** ISO settlement currency when required by contract (e.g. USD, SGD). */
  settlementCurrency?: string;
  /** Default payment method type when not specified per request (e.g. CARD, ALIPAY_CN). */
  defaultPaymentMethodType?: string;
  keyVersion?: string | number;
  logo?: string;
};

const DEFAULT_GATEWAY = {
  sandbox: 'https://open-na-global.alipay.com',
  live: 'https://open-na-global.alipay.com'
};

const normalizePem = (raw: string, kind: 'PRIVATE' | 'PUBLIC'): string => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('BEGIN')) {
    return trimmed.replace(/\\n/g, '\n');
  }
  const body = trimmed.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) || [body];
  if (kind === 'PRIVATE') {
    return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----`;
  }
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
};

export const resolveAntomGatewayBase = (config: AntomProviderConfig): string => {
  const explicit = String(config.gatewayBaseUrl || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const env = String(config.environment || 'sandbox').toLowerCase() === 'live' ? 'live' : 'sandbox';
  return DEFAULT_GATEWAY[env];
};

/** Minor-unit string for Antom amount.value (e.g. 10.50 USD → "1050"). */
export const toAntomAmountValue = (amount: number): string => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid payment amount for Antom');
  }
  return String(Math.round(amount * 100));
};

export const buildAntomSignature = (params: {
  requestUri: string;
  clientId: string;
  requestTime: string;
  requestBody: string;
  merchantPrivateKey: string;
}): string => {
  const content = `POST ${params.requestUri}\n${params.clientId}.${params.requestTime}.${params.requestBody}`;
  const pem = normalizePem(params.merchantPrivateKey, 'PRIVATE');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(content, 'utf8');
  signer.end();
  const signature = signer.sign(pem);
  return encodeURIComponent(signature.toString('base64'));
};

export const verifyAntomSignature = (params: {
  requestUri: string;
  clientId: string;
  responseTime: string;
  responseBody: string;
  targetSignature: string;
  antomPublicKey: string;
}): boolean => {
  try {
    if (!params.targetSignature || !params.antomPublicKey) return false;
    const content = `POST ${params.requestUri}\n${params.clientId}.${params.responseTime}.${params.responseBody}`;
    const pem = normalizePem(params.antomPublicKey, 'PUBLIC');
    const decoded = Buffer.from(decodeURIComponent(params.targetSignature), 'base64');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(content, 'utf8');
    verifier.end();
    return verifier.verify(pem, decoded);
  } catch {
    return false;
  }
};

export const extractAntomSignatureValue = (headerValue: string | undefined | null): string => {
  const raw = String(headerValue || '').trim();
  if (!raw) return '';
  const match = raw.match(/signature=([^,]+)/i);
  return match ? match[1].trim() : raw;
};

export type AntomPayInput = {
  config: AntomProviderConfig;
  paymentRequestId: string;
  amount: number;
  currency: string;
  orderDescription: string;
  referenceOrderId: string;
  referenceBuyerId?: string;
  paymentRedirectUrl: string;
  paymentNotifyUrl: string;
  paymentMethodType?: string;
  terminalType?: 'WEB' | 'WAP' | 'APP';
  userRegion?: string;
};

export type AntomPayResult = {
  ok: boolean;
  paymentId?: string;
  paymentRequestId?: string;
  redirectUrl?: string | null;
  resultStatus?: string;
  resultCode?: string;
  resultMessage?: string;
  raw: any;
};

/**
 * Create a Cashier Payment session and return a redirect URL (normalUrl / applinkUrl / schemeUrl).
 */
export const createAntomCashierPayment = async (input: AntomPayInput): Promise<AntomPayResult> => {
  const clientId = String(input.config.clientId || '').trim();
  const privateKey = String(input.config.merchantPrivateKey || '').trim();
  if (!clientId || !privateKey) {
    throw new Error('Antom is not configured (clientId / merchantPrivateKey required).');
  }

  const gatewayBase = resolveAntomGatewayBase(input.config);
  const requestUri = '/ams/api/v1/payments/pay';
  const requestTime = String(Date.now());
  const currency = String(input.currency || 'USD').toUpperCase();
  const paymentMethodType = String(
    input.paymentMethodType || input.config.defaultPaymentMethodType || 'CARD'
  )
    .trim()
    .toUpperCase();

  const bodyObj: Record<string, any> = {
    productCode: 'CASHIER_PAYMENT',
    paymentRequestId: input.paymentRequestId,
    paymentAmount: {
      currency,
      value: toAntomAmountValue(input.amount)
    },
    paymentMethod: {
      paymentMethodType
    },
    order: {
      referenceOrderId: input.referenceOrderId,
      orderDescription: String(input.orderDescription || 'Scrolith payment').slice(0, 256),
      orderAmount: {
        currency,
        value: toAntomAmountValue(input.amount)
      },
      buyer: {
        referenceBuyerId: String(input.referenceBuyerId || input.paymentRequestId).slice(0, 64)
      }
    },
    env: {
      terminalType: input.terminalType || 'WEB'
    },
    paymentRedirectUrl: input.paymentRedirectUrl,
    paymentNotifyUrl: input.paymentNotifyUrl
  };

  const settlementCurrency = String(input.config.settlementCurrency || '').trim().toUpperCase();
  if (settlementCurrency) {
    bodyObj.settlementStrategy = { settlementCurrency };
  }
  if (input.userRegion) {
    bodyObj.userRegion = String(input.userRegion).slice(0, 2).toUpperCase();
  }

  const requestBody = JSON.stringify(bodyObj);
  const signature = buildAntomSignature({
    requestUri,
    clientId,
    requestTime,
    requestBody,
    merchantPrivateKey: privateKey
  });
  const keyVersion = String(input.config.keyVersion || '1');

  const url = `${gatewayBase}${requestUri}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Client-Id': clientId,
      'Request-Time': requestTime,
      Signature: `algorithm=RSA256, keyVersion=${keyVersion}, signature=${signature}`
    },
    body: requestBody
  });

  const responseBodyText = await response.text();
  let raw: any = null;
  try {
    raw = responseBodyText ? JSON.parse(responseBodyText) : null;
  } catch {
    raw = { parseError: true, body: responseBodyText };
  }

  const antomPublicKey = String(input.config.antomPublicKey || '').trim();
  if (antomPublicKey && responseBodyText) {
    const responseTime =
      response.headers.get('response-time') ||
      response.headers.get('Response-Time') ||
      '';
    const sigHeader =
      response.headers.get('signature') || response.headers.get('Signature') || '';
    const targetSignature = extractAntomSignatureValue(sigHeader);
    if (targetSignature && responseTime) {
      const valid = verifyAntomSignature({
        requestUri,
        clientId: response.headers.get('client-id') || clientId,
        responseTime,
        responseBody: responseBodyText,
        targetSignature,
        antomPublicKey
      });
      if (!valid) {
        throw new Error('Antom response signature verification failed.');
      }
    }
  }

  const resultStatus = String(raw?.result?.resultStatus || '').toUpperCase();
  const resultCode = String(raw?.result?.resultCode || '');
  const resultMessage = String(raw?.result?.resultMessage || '');
  const redirectUrl =
    raw?.normalUrl || raw?.applinkUrl || raw?.schemeUrl || raw?.paymentUrl || null;

  const ok =
    resultStatus === 'S' ||
    (resultStatus === 'U' && Boolean(redirectUrl)) ||
    resultCode === 'PAYMENT_IN_PROCESS' ||
    resultCode === 'SUCCESS';

  if (!response.ok && !ok) {
    throw new Error(resultMessage || `Antom pay failed (${response.status})`);
  }

  return {
    ok,
    paymentId: raw?.paymentId ? String(raw.paymentId) : undefined,
    paymentRequestId: raw?.paymentRequestId ? String(raw.paymentRequestId) : input.paymentRequestId,
    redirectUrl: redirectUrl ? String(redirectUrl) : null,
    resultStatus,
    resultCode,
    resultMessage,
    raw
  };
};

/** Map Antom notify payload payment status to internal settlement. */
export const mapAntomNotifyStatus = (
  payload: any
): 'succeeded' | 'failed' | 'pending' => {
  const status = String(
    payload?.paymentResult?.resultStatus ||
      payload?.result?.resultStatus ||
      payload?.paymentStatus ||
      payload?.status ||
      ''
  ).toUpperCase();
  if (status === 'S' || status === 'SUCCESS' || status === 'PAID') return 'succeeded';
  if (status === 'F' || status === 'FAIL' || status === 'FAILED' || status === 'CANCELLED') {
    return 'failed';
  }
  const paymentStatus = String(payload?.paymentStatus || '').toUpperCase();
  if (paymentStatus === 'SUCCESS' || paymentStatus === 'PAID') return 'succeeded';
  if (paymentStatus === 'FAIL' || paymentStatus === 'FAILED' || paymentStatus === 'CANCELLED') {
    return 'failed';
  }
  return 'pending';
};

export const antomNotifyAckSuccess = () => ({
  result: {
    resultCode: 'SUCCESS',
    resultStatus: 'S',
    resultMessage: 'success'
  }
});

export const antomNotifyAckFailure = (message: string) => ({
  result: {
    resultCode: 'ERROR',
    resultStatus: 'F',
    resultMessage: String(message || 'error').slice(0, 256)
  }
});
