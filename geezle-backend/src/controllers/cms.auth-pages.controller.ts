import { Request, Response } from 'express';
import { PrismaClient, CmsTarget } from '@prisma/client';

const prisma = new PrismaClient();

const defaultAuthPages = {
  id: 'auth_pages',
  branding: {
    show_logo: true,
    logo_url: '',
    logo_link_url: '/'
  },
  login: {
    headline: 'Sign in to your account',
    submit_label: 'Sign in',
    email_placeholder: 'Email address',
    password_placeholder: 'Password',
    footer_text: "Don't have an account?",
    footer_link_label: 'Sign up',
    footer_link_url: '/auth/signup'
  },
  signup: {
    headline: 'Join Our Community',
    submit_label: 'Create Account',
    terms_url: '/p/terms',
    privacy_url: '/p/privacy',
    footer_text: 'Already have an account?',
    footer_link_label: 'Sign in here',
    footer_link_url: '/auth/login'
  }
};

const getOrCreateCMSConfig = async (target: CmsTarget, defaultData: any) => {
  let config = await prisma.cMSConfig.findFirst({
    where: { target },
    orderBy: { version: 'desc' }
  });

  if (!config) {
    config = await prisma.cMSConfig.create({
      data: {
        target,
        version: 1,
        data: defaultData
      }
    });
  }

  return config;
};

const saveCMSConfig = async (target: CmsTarget, data: any, userId?: string) => {
  const existing = await prisma.cMSConfig.findFirst({
    where: { target },
    orderBy: { version: 'desc' }
  });

  const version = existing ? existing.version + 1 : 1;

  return prisma.cMSConfig.create({
    data: {
      target,
      version,
      data,
      updatedById: userId || null
    }
  });
};

const normalizeAuthPagesConfig = (input: any) => {
  const brandingRaw = input?.branding || {};
  const loginRaw = input?.login || {};
  const signupRaw = input?.signup || {};

  return {
    id: input?.id || defaultAuthPages.id,
    branding: {
      show_logo: brandingRaw.show_logo ?? brandingRaw.showLogo ?? defaultAuthPages.branding.show_logo,
      logo_url: brandingRaw.logo_url ?? brandingRaw.logoUrl ?? defaultAuthPages.branding.logo_url,
      logo_file_id: brandingRaw.logo_file_id ?? brandingRaw.logoFileId,
      logo_link_url: brandingRaw.logo_link_url ?? brandingRaw.logoLinkUrl ?? defaultAuthPages.branding.logo_link_url
    },
    login: {
      headline: loginRaw.headline ?? defaultAuthPages.login.headline,
      subheadline: loginRaw.subheadline ?? '',
      email_placeholder:
        loginRaw.email_placeholder ?? loginRaw.emailPlaceholder ?? defaultAuthPages.login.email_placeholder,
      password_placeholder:
        loginRaw.password_placeholder ?? loginRaw.passwordPlaceholder ?? defaultAuthPages.login.password_placeholder,
      submit_label: loginRaw.submit_label ?? loginRaw.submitLabel ?? defaultAuthPages.login.submit_label,
      footer_text: loginRaw.footer_text ?? loginRaw.footerText ?? defaultAuthPages.login.footer_text,
      footer_link_label:
        loginRaw.footer_link_label ?? loginRaw.footerLinkLabel ?? defaultAuthPages.login.footer_link_label,
      footer_link_url:
        loginRaw.footer_link_url ?? loginRaw.footerLinkUrl ?? defaultAuthPages.login.footer_link_url
    },
    signup: {
      headline: signupRaw.headline ?? defaultAuthPages.signup.headline,
      subheadline: signupRaw.subheadline ?? '',
      submit_label: signupRaw.submit_label ?? signupRaw.submitLabel ?? defaultAuthPages.signup.submit_label,
      terms_url: signupRaw.terms_url ?? signupRaw.termsUrl ?? defaultAuthPages.signup.terms_url,
      privacy_url: signupRaw.privacy_url ?? signupRaw.privacyUrl ?? defaultAuthPages.signup.privacy_url,
      footer_text: signupRaw.footer_text ?? signupRaw.footerText ?? defaultAuthPages.signup.footer_text,
      footer_link_label:
        signupRaw.footer_link_label ?? signupRaw.footerLinkLabel ?? defaultAuthPages.signup.footer_link_label,
      footer_link_url:
        signupRaw.footer_link_url ?? signupRaw.footerLinkUrl ?? defaultAuthPages.signup.footer_link_url
    },
    updated_at: input?.updated_at || new Date().toISOString()
  };
};

export const getAuthPagesConfig = async (req: Request, res: Response) => {
  try {
    const config = await getOrCreateCMSConfig(CmsTarget.GLOBAL, { auth_pages: defaultAuthPages });
    const data = config.data as Record<string, unknown> | undefined;
    const authPages =
      (data && (data['auth_pages'] ?? data['authPages'])) ||
      (data && data['id'] === defaultAuthPages.id ? data : null) ||
      defaultAuthPages;

    res.json(normalizeAuthPagesConfig(authPages));
  } catch (error) {
    console.error('Error fetching auth pages config:', error);
    res.json(normalizeAuthPagesConfig(defaultAuthPages));
  }
};

export const saveAuthPagesConfig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const normalized = normalizeAuthPagesConfig(req.body || {});
    const existingConfig = await getOrCreateCMSConfig(CmsTarget.GLOBAL, { auth_pages: defaultAuthPages });
    const existingData = existingConfig.data as Record<string, unknown> | undefined;

    const updatedData = {
      ...(existingData || {}),
      auth_pages: normalized
    } as Record<string, unknown>;

    await saveCMSConfig(CmsTarget.GLOBAL, updatedData, userId);

    res.json({
      success: true,
      data: normalized
    });
  } catch (error) {
    console.error('Error saving auth pages config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
