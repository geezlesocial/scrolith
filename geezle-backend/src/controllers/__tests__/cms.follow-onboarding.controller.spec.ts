const mockPrisma = { appSetting: { findUnique: jest.fn(), upsert: jest.fn() } };
const mockRecordGovernedAdminAction = jest.fn();

jest.mock('../../utils/prismaClient', () => ({ __esModule: true, default: mockPrisma }));
jest.mock('../../services/enterpriseGovernance.service', () => ({
  recordGovernedAdminAction: (...args: unknown[]) => mockRecordGovernedAdminAction(...args)
}));

import { getFollowOnboardingContent, saveFollowOnboardingContent } from '../cms.follow-onboarding.controller';
import { DEFAULT_FOLLOW_ONBOARDING_CONTENT } from '../../utils/followOnboardingContent';
import fs from 'fs';
import path from 'path';

const response = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.setHeader = jest.fn();
  return res;
};

const request = () => {
  const io = { emit: jest.fn() };
  const communityIo = { emit: jest.fn() };
  return {
    req: { app: { get: (key: string) => key === 'io' ? io : communityIo } } as any,
    io,
    communityIo
  };
};

describe('follow onboarding CMS controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('serves current content without cache and falls back only when no setting exists', async () => {
    mockPrisma.appSetting.findUnique.mockResolvedValue(null);
    const res = response();
    await getFollowOnboardingContent({} as any, res);
    expect(mockPrisma.appSetting.findUnique).toHaveBeenCalledWith({ where: { scope: 'cms_follow_onboarding' } });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, max-age=0');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: DEFAULT_FOLLOW_ONBOARDING_CONTENT });
  });

  it('fails visibly rather than masking a corrupt persisted configuration as defaults', async () => {
    mockPrisma.appSetting.findUnique.mockResolvedValue({ data: { unexpected: true } });
    const res = response();
    await getFollowOnboardingContent({} as any, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Saved onboarding content is invalid' });
  });

  it('rejects invalid content without persisting it', async () => {
    const res = response();
    await saveFollowOnboardingContent({ body: { hero: { title: 'bad' } } } as any, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.appSetting.upsert).not.toHaveBeenCalled();
  });

  it('persists validated content, records an admin audit event, and broadcasts the published version', async () => {
    mockPrisma.appSetting.upsert.mockResolvedValue({});
    mockRecordGovernedAdminAction.mockResolvedValue({});
    const { req, io, communityIo } = request();
    const res = response();
    const body = { ...DEFAULT_FOLLOW_ONBOARDING_CONTENT, hero: { ...DEFAULT_FOLLOW_ONBOARDING_CONTENT.hero, title: 'Updated onboarding' } };

    await saveFollowOnboardingContent({ ...req, body } as any, res);

    expect(mockPrisma.appSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { scope: 'cms_follow_onboarding' },
      create: expect.objectContaining({ scope: 'cms_follow_onboarding' }),
      update: expect.objectContaining({ data: expect.objectContaining({ hero: body.hero }) })
    }));
    expect(mockRecordGovernedAdminAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actionKey: 'follow_onboarding.content.update', entityId: 'cms_follow_onboarding'
    }));
    expect(io.emit).toHaveBeenCalledWith('cms:follow_onboarding_updated', expect.objectContaining({ hero: body.hero }));
    expect(communityIo.emit).toHaveBeenCalledWith('cms:follow_onboarding_updated', expect.anything());
    expect(res.json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({ hero: body.hero, updatedAt: expect.any(String) }) });
  });

  it('does not turn a committed content save into a false failure if audit storage is unavailable', async () => {
    mockPrisma.appSetting.upsert.mockResolvedValue({});
    mockRecordGovernedAdminAction.mockRejectedValue(new Error('audit store unavailable'));
    const { req, io } = request();
    const res = response();
    await saveFollowOnboardingContent({ ...req, body: DEFAULT_FOLLOW_ONBOARDING_CONTENT } as any, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(io.emit).toHaveBeenCalled();
  });

  it('keeps the public endpoint read-only and protects admin read/write routes with CMS permissions', () => {
    const routes = fs.readFileSync(path.resolve(__dirname, '../../routes/cms.ts'), 'utf8');
    expect(routes).toMatch(/router\.get\('\/follow-onboarding\/content'/);
    expect(routes).toMatch(/adminRouter\.get\('\/admin\/follow-onboarding\/content',\s*requirePermission\('cms\.read'\)/);
    expect(routes).toMatch(/adminRouter\.put\('\/admin\/follow-onboarding\/content',\s*requirePermission\('cms\.manage'\)/);
    expect(routes).not.toMatch(/router\.(?:post|put|patch|delete)\('\/follow-onboarding\/content'/);
  });
});
