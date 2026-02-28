import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { oauthAuthorize, oauthRevokeToken, oauthToken, oauthUserInfo } from '../controllers/dev.oauth.controller';

const router = express.Router();

router.post('/authorize', authMiddleware, oauthAuthorize);
router.post('/token', oauthToken);
router.get('/userinfo', oauthUserInfo);
router.post('/revoke', oauthRevokeToken);

export default router;
