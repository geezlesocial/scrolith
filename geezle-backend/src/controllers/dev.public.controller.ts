import { Request, Response } from 'express';
import { getOrCreateDeveloperPlatformConfig } from '../services/developerPlatform.service';

export const getPublicDeveloperConfig = async (_req: Request, res: Response) => {
  try {
    const config = await getOrCreateDeveloperPlatformConfig();
    return res.json({
      success: true,
      data: {
        developerBaseUrl: config.developerBaseUrl,
        oauthIssuer: process.env.OAUTH_ISSUER || 'https://api.scrolith.com/api/oauth',
        authorizationCodeTtlSeconds: config.authorizationCodeTtlSeconds,
        accessTokenTtlSeconds: config.accessTokenTtlSeconds
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load developer public config.' });
  }
};
