import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');
const readSource = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

describe('shared-IP rate limiting and login approval transport contracts', () => {
  const serverSource = readSource('server.ts');
  const deviceSecurityRoutesSource = readSource('routes/deviceSecurity.routes.ts');
  const deviceSecurityControllerSource = readSource('controllers/deviceSecurity.controller.ts');
  const genericRateLimitSource = readSource('middlewares/rateLimit.ts');

  test('public boot/config traffic is isolated from the global API bucket', () => {
    expect(serverSource).toContain('const isPublicBootPath');
    expect(serverSource).toContain('const publicBootLimiter = rateLimit');
    expect(serverSource).toContain("app.use('/api/', (req: Request, res: Response, next)");
    expect(serverSource).toContain('if (isPublicBootPath(req)) return true;');
    expect(serverSource).toContain('/api/cms');
    expect(serverSource).toContain('/api/homepage');
    expect(serverSource).toContain('/api/currencies');
    expect(serverSource).toContain('/api/i18n');
    expect(serverSource).toContain('/api/public/preloader');
    expect(serverSource).toContain('/api/payments/methods/active');
    expect(serverSource).toContain('/api/apps/track');
  });

  test('security-sensitive routes keep dedicated limiters and do not share public boot quota', () => {
    expect(serverSource).toContain('/auth/login');
    expect(serverSource).toContain('/auth/register');
    expect(serverSource).toContain('/auth/forgot-password');
    expect(serverSource).toContain('/auth/reset-password');
    expect(serverSource).toContain('/security/login-approvals');
    expect(serverSource).toContain('/human-verification');
    expect(genericRateLimitSource).toContain("standardHeaders: 'draft-7'");
    expect(genericRateLimitSource).toContain('legacyHeaders: false');
    expect(genericRateLimitSource).toContain("req?.method === 'OPTIONS'");
  });

  test('rate-limit responses expose backoff metadata and CORS preflights do not consume quota', () => {
    expect(serverSource).toContain('const jsonRateLimitHandler');
    expect(serverSource).toContain("res.setHeader('Retry-After'");
    expect(serverSource).toContain('retryAfterSeconds');
    expect(serverSource).toContain("if (req.method === 'OPTIONS') return true;");
    expect(serverSource).toContain("standardHeaders: 'draft-7'");
  });

  test('approval status uses POST body or scoped header, never URL query parameters', () => {
    expect(deviceSecurityRoutesSource).toContain("router.post('/login-approvals/:attemptId/status'");
    expect(deviceSecurityRoutesSource).toContain("Use POST for login approval status checks.");
    expect(deviceSecurityControllerSource).toContain('req.body?.approvalToken');
    expect(deviceSecurityControllerSource).toContain("req.headers['x-scrolith-login-approval-token']");
    expect(deviceSecurityControllerSource).not.toContain('req.query.approvalToken');
    expect(deviceSecurityControllerSource).not.toContain('req.query.approval_token');
  });

  test('request logging redacts legacy approvalToken query attempts', () => {
    expect(serverSource).toContain('const sanitizeRequestUrlForLogs');
    expect(serverSource).toContain("'approvalToken'");
    expect(serverSource).toContain("'approval_token'");
    expect(serverSource).toContain("set(key, '[redacted]')");
    expect(serverSource).toContain('sanitizeRequestUrlForLogs(req.originalUrl)');
  });

  test('Azure proxy trust remains bounded instead of trusting arbitrary forwarded chains', () => {
    expect(serverSource).toContain("app.set('trust proxy', 1)");
    expect(serverSource).not.toContain("app.set('trust proxy', true)");
  });
});
