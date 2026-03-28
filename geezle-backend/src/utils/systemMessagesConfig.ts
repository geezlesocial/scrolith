// C:\Projects\Scrolith-backend\src\utils\systemMessagesConfig.ts
type TemplateChannel = {
  enabled: boolean;
  subject?: string;
  html?: string;
  text?: string;
  title?: string;
  message?: string;
};

export type SystemMessageTemplate = {
  key: string;
  label: string;
  enabled: boolean;
  email: TemplateChannel;
  notification: TemplateChannel;
  push: TemplateChannel;
};

export type SystemMessagesConfig = {
  id: string;
  templates: Record<string, SystemMessageTemplate>;
  updated_at: string;
};

const platformVars = ['platform.name', 'platform.url', 'platform.supportUrl'];

export const SYSTEM_MESSAGE_VARIABLES: Record<string, string[]> = {
  password_reset: ['user.name', 'user.email', 'reset.link', 'reset.expiresMinutes', ...platformVars],
  new_message: ['user.name', 'user.email', 'sender.name', 'sender.email', 'message.preview', 'message.link', ...platformVars],
  order_update: ['user.name', 'user.email', 'order.id', 'order.status', 'order.total', 'order.link', 'currency', ...platformVars],
  contract_update: ['user.name', 'user.email', 'contract.title', 'contract.status', 'contract.link', ...platformVars],
  wallet_withdrawal_update: ['user.name', 'user.email', 'withdrawal.amount', 'withdrawal.currency', 'withdrawal.status', 'withdrawal.link', ...platformVars],
  kyc_status_update: ['user.name', 'user.email', 'kyc.status', 'kyc.link', ...platformVars],
  policy_update: ['user.name', 'user.email', 'policy.type', 'policy.url', 'policy.effectiveDate', ...platformVars],
  system_notification: ['user.name', 'user.email', 'notification.title', 'notification.message', 'notification.link', ...platformVars]
};

const wrapEmailHtml = (title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string) => {
  const ctaBlock = ctaUrl && ctaLabel
    ? `
      <div style="margin:28px 0;text-align:center;">
        <a href="${ctaUrl}" style="background:#2f6fed;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">
          ${ctaLabel}
        </a>
      </div>`
    : '';

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title}</title>
    </head>
    <body style="margin:0;background:#f4f7fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
              <tr>
                <td style="padding:24px 28px;background:linear-gradient(120deg,#0f172a,#1f2a44);color:#fff;">
                  <div style="font-size:20px;font-weight:700;letter-spacing:0.3px;">Scrolith</div>
                  <div style="font-size:13px;opacity:0.8;margin-top:4px;">${title}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:28px;">
                  ${bodyHtml}
                  ${ctaBlock}
                  <p style="margin:32px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
                    You are receiving this email because it relates to your Scrolith account activity.
                    If you did not expect this email, you can safely ignore it.
                  </p>
                </td>
              </tr>
            </table>
            <p style="font-size:12px;color:#94a3b8;margin-top:16px;">© ${new Date().getFullYear()} Scrolith. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `.trim();
};

const textBlock = (lines: string[]) => lines.filter(Boolean).join('\n');

const defaultEmailTemplates = {
  password_reset: {
    subject: 'Reset your Scrolith password',
    html: wrapEmailHtml(
      'Reset your password',
      `
        <h2 style="margin-top:0;font-size:22px;color:#0f172a;">Password reset request</h2>
        <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#334155;">
          Hi {{user.name}}, we received a request to reset your Scrolith password.
          Click the button below to set a new password. This link expires in {{reset.expiresMinutes}} minutes.
        </p>
      `,
      '{{reset.link}}',
      'Reset Password'
    ),
    text: textBlock([
      'Password reset request',
      'Hi {{user.name}}, we received a request to reset your Scrolith password.',
      'Use the link below to set a new password (expires in {{reset.expiresMinutes}} minutes):',
      '{{reset.link}}'
    ])
  },
  new_message: {
    subject: 'You have a new message on Scrolith',
    html: wrapEmailHtml(
      'New message',
      `
        <h2 style="margin-top:0;font-size:22px;color:#0f172a;">New message from {{sender.name}}</h2>
        <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#334155;">
          {{message.preview}}
        </p>
      `,
      '{{message.link}}',
      'Open Conversation'
    ),
    text: textBlock([
      'New message from {{sender.name}}',
      '{{message.preview}}',
      'Open conversation: {{message.link}}'
    ])
  },
  order_update: {
    subject: 'Order update #{{order.id}}',
    html: wrapEmailHtml(
      'Order update',
      `
        <h2 style="margin-top:0;font-size:22px;color:#0f172a;">Order #{{order.id}} update</h2>
        <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#334155;">
          Status: <strong>{{order.status}}</strong><br/>
          Total: <strong>{{order.total}} {{currency}}</strong>
        </p>
      `,
      '{{order.link}}',
      'View Order'
    ),
    text: textBlock([
      'Order update',
      'Order #{{order.id}} status: {{order.status}}',
      'Total: {{order.total}} {{currency}}',
      'View order: {{order.link}}'
    ])
  },
  contract_update: {
    subject: 'Contract update: {{contract.title}}',
    html: wrapEmailHtml(
      'Contract update',
      `
        <h2 style="margin-top:0;font-size:22px;color:#0f172a;">Contract update</h2>
        <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#334155;">
          {{contract.title}} is now <strong>{{contract.status}}</strong>.
        </p>
      `,
      '{{contract.link}}',
      'View Contract'
    ),
    text: textBlock([
      'Contract update',
      '{{contract.title}} status: {{contract.status}}',
      'View contract: {{contract.link}}'
    ])
  },
  wallet_withdrawal_update: {
    subject: 'Withdrawal update',
    html: wrapEmailHtml(
      'Withdrawal update',
      `
        <h2 style="margin-top:0;font-size:22px;color:#0f172a;">Withdrawal status</h2>
        <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#334155;">
          Amount: <strong>{{withdrawal.amount}} {{withdrawal.currency}}</strong><br/>
          Status: <strong>{{withdrawal.status}}</strong>
        </p>
      `,
      '{{withdrawal.link}}',
      'View Withdrawal'
    ),
    text: textBlock([
      'Withdrawal update',
      'Amount: {{withdrawal.amount}} {{withdrawal.currency}}',
      'Status: {{withdrawal.status}}',
      'View: {{withdrawal.link}}'
    ])
  },
  kyc_status_update: {
    subject: 'KYC status update',
    html: wrapEmailHtml(
      'KYC status update',
      `
        <h2 style="margin-top:0;font-size:22px;color:#0f172a;">KYC update</h2>
        <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#334155;">
          Your KYC status is now <strong>{{kyc.status}}</strong>.
        </p>
      `,
      '{{kyc.link}}',
      'View KYC'
    ),
    text: textBlock([
      'KYC update',
      'Status: {{kyc.status}}',
      'View details: {{kyc.link}}'
    ])
  },
  policy_update: {
    subject: '{{platform.name}} policy update',
    html: wrapEmailHtml(
      'Policy update',
      `
        <h2 style="margin-top:0;font-size:22px;color:#0f172a;">{{policy.type}} update</h2>
        <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#334155;">
          We have updated our {{policy.type}}. Effective date: {{policy.effectiveDate}}.
        </p>
      `,
      '{{policy.url}}',
      'Read Update'
    ),
    text: textBlock([
      '{{policy.type}} update',
      'Effective date: {{policy.effectiveDate}}',
      'Read: {{policy.url}}'
    ])
  },
  system_notification: {
    subject: '{{notification.title}}',
    html: wrapEmailHtml(
      'System notification',
      `
        <h2 style="margin-top:0;font-size:22px;color:#0f172a;">{{notification.title}}</h2>
        <p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#334155;">
          {{notification.message}}
        </p>
      `,
      '{{notification.link}}',
      'Open'
    ),
    text: textBlock([
      '{{notification.title}}',
      '{{notification.message}}',
      '{{notification.link}}'
    ])
  }
};

const defaultTemplate = (key: string, label: string): SystemMessageTemplate => ({
  key,
  label,
  enabled: true,
  email: {
    enabled: true,
    subject: defaultEmailTemplates[key as keyof typeof defaultEmailTemplates]?.subject || '',
    html: defaultEmailTemplates[key as keyof typeof defaultEmailTemplates]?.html || '',
    text: defaultEmailTemplates[key as keyof typeof defaultEmailTemplates]?.text || ''
  },
  notification: {
    enabled: true,
    title: label,
    message: `${label} notification`
  },
  push: {
    enabled: false,
    title: label,
    message: `${label} update`
  }
});

export const defaultSystemMessagesConfig: SystemMessagesConfig = {
  id: 'system_messages',
  templates: {
    password_reset: defaultTemplate('password_reset', 'Password Reset'),
    new_message: defaultTemplate('new_message', 'New Message'),
    order_update: defaultTemplate('order_update', 'Order Update'),
    contract_update: defaultTemplate('contract_update', 'Contract Update'),
    wallet_withdrawal_update: defaultTemplate('wallet_withdrawal_update', 'Withdrawal Update'),
    kyc_status_update: defaultTemplate('kyc_status_update', 'KYC Status Update'),
    policy_update: defaultTemplate('policy_update', 'Policy Update'),
    system_notification: defaultTemplate('system_notification', 'System Notification')
  },
  updated_at: new Date().toISOString()
};

const normalizeTemplate = (incoming: any, existing: SystemMessageTemplate, fallback: SystemMessageTemplate) => {
  const source = incoming || {};
  const pick = (value: any, fallbackValue: any) => (value === undefined ? fallbackValue : value);
  return {
    key: existing.key || fallback.key,
    label: pick(source.label, existing.label || fallback.label),
    enabled: Boolean(pick(source.enabled, existing.enabled ?? fallback.enabled)),
    email: {
      enabled: Boolean(pick(source.email?.enabled, existing.email?.enabled ?? fallback.email.enabled)),
      subject: pick(source.email?.subject, existing.email?.subject ?? fallback.email.subject),
      html: pick(source.email?.html, existing.email?.html ?? fallback.email.html),
      text: pick(source.email?.text, existing.email?.text ?? fallback.email.text)
    },
    notification: {
      enabled: Boolean(pick(source.notification?.enabled, existing.notification?.enabled ?? fallback.notification.enabled)),
      title: pick(source.notification?.title, existing.notification?.title ?? fallback.notification.title),
      message: pick(source.notification?.message, existing.notification?.message ?? fallback.notification.message)
    },
    push: {
      enabled: Boolean(pick(source.push?.enabled, existing.push?.enabled ?? fallback.push.enabled)),
      title: pick(source.push?.title, existing.push?.title ?? fallback.push.title),
      message: pick(source.push?.message, existing.push?.message ?? fallback.push.message)
    }
  };
};

export const normalizeSystemMessagesConfig = (input: any, existing?: SystemMessagesConfig): SystemMessagesConfig => {
  const incoming = input || {};
  const currentTemplates = existing?.templates || defaultSystemMessagesConfig.templates;
  const nextTemplates: Record<string, SystemMessageTemplate> = {};

  Object.keys(defaultSystemMessagesConfig.templates).forEach((key) => {
    const fallback = defaultSystemMessagesConfig.templates[key];
    const current = currentTemplates[key] || fallback;
    nextTemplates[key] = normalizeTemplate(incoming?.templates?.[key], current, fallback);
  });

  return {
    id: incoming.id || existing?.id || defaultSystemMessagesConfig.id,
    templates: nextTemplates,
    updated_at: incoming.updated_at || new Date().toISOString()
  };
};

export const sanitizeSystemMessagesConfig = (config: SystemMessagesConfig) => config;

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const HTML_LINK_REGEX = /\b(?:href|src|action)\s*=\s*(["'])(.*?)\1/gi;
const TEXT_LINK_REGEX = /(?:^|[\s(])((?:https?:\/\/|mailto:|tel:|scrolith:\/\/|\/)[^\s<>"']*)/gim;

const normalizeUrlCandidate = (value: string) =>
  String(value || '')
    .trim()
    .replace(/[),.;]+$/g, '');

const isAllowedTemplateUrl = (value: string) => {
  const normalized = normalizeUrlCandidate(value);
  if (!normalized) return true;
  if (normalized.includes('{{')) return true;
  if (normalized.startsWith('#')) return true;
  if (normalized.startsWith('/')) return !normalized.startsWith('//');
  if (/^(https?:\/\/|mailto:|tel:|scrolith:\/\/)/i.test(normalized)) return true;
  return false;
};

const extractTemplateLinkValues = (value: string, mode: 'html' | 'text') => {
  const links = new Set<string>();
  const regex = mode === 'html' ? HTML_LINK_REGEX : TEXT_LINK_REGEX;
  regex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    const candidate = normalizeUrlCandidate(mode === 'html' ? match[2] || '' : match[1] || '');
    if (candidate) links.add(candidate);
  }

  return Array.from(links);
};

export const extractTemplateVariables = (value?: string) => {
  if (!value) return [];
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_REGEX.exec(value)) !== null) {
    if (match[1]) vars.add(match[1]);
  }
  return Array.from(vars);
};

export const validateSystemMessagesConfig = (config: SystemMessagesConfig) => {
  const errors: string[] = [];
  Object.entries(config.templates).forEach(([key, template]) => {
    const allowed = new Set(SYSTEM_MESSAGE_VARIABLES[key] || []);
    const channels: Array<{ label: string; value?: string }> = [
      { label: 'email.subject', value: template.email.subject },
      { label: 'email.html', value: template.email.html },
      { label: 'email.text', value: template.email.text },
      { label: 'notification.title', value: template.notification.title },
      { label: 'notification.message', value: template.notification.message },
      { label: 'push.title', value: template.push.title },
      { label: 'push.message', value: template.push.message }
    ];

    channels.forEach((channel) => {
      extractTemplateVariables(channel.value).forEach((variable) => {
        if (!allowed.has(variable)) {
          errors.push(`Template "${key}" uses unknown variable "${variable}" in ${channel.label}`);
        }
      });
    });

    extractTemplateLinkValues(template.email.html || '', 'html').forEach((link) => {
      if (!isAllowedTemplateUrl(link)) {
        errors.push(`Template "${key}" uses an invalid URL "${link}" in email.html`);
      }
    });

    extractTemplateLinkValues(template.email.text || '', 'text').forEach((link) => {
      if (!isAllowedTemplateUrl(link)) {
        errors.push(`Template "${key}" uses an invalid URL "${link}" in email.text`);
      }
    });
  });
  return errors;
};

export const getSystemMessagesVariableMap = () => SYSTEM_MESSAGE_VARIABLES;


