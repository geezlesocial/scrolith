const mockPrisma = {
  conversation: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  conversationParticipant: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    upsert: jest.fn()
  },
  conversationInvite: {
    findFirst: jest.fn()
  },
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn()
  },
  userBlock: {
    findFirst: jest.fn()
  },
  notification: {
    create: jest.fn()
  }
};

jest.mock('../utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma
}));

import {
  addGroupMembers,
  listGroupMemberCandidates,
  resolveGroupMember
} from '../controllers/groupMessaging.controller';

const group = {
  id: 'conv1',
  type: 'GROUP',
  title: 'Scrolith family',
  maxMembers: null,
  participants: []
};

const ownerMembership = {
  id: 'cp-owner',
  conversationId: 'conv1',
  userId: 'owner1',
  role: 'OWNER',
  deletedAt: null
};

const targetUser = {
  id: 'cmrsb0f0s05xgs601xduk3asn',
  name: 'Jima Ahamad',
  username: 'jima',
  avatar: 'avatar.png',
  profilePhotoFileId: 'file1',
  isActive: true
};

const makeReq = (overrides: any = {}) =>
  ({
    params: { id: 'conv1', ...(overrides.params || {}) },
    query: overrides.query || {},
    body: overrides.body || {},
    user: overrides.user || { id: 'owner1', role: 'USER' }
  }) as any;

const makeRes = () => {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const allowOwner = () => {
  mockPrisma.conversation.findUnique.mockResolvedValue(group);
  mockPrisma.conversationParticipant.findFirst.mockResolvedValue(ownerMembership);
};

describe('groupMessaging member identifier resolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    allowOwner();
    mockPrisma.userBlock.findFirst.mockResolvedValue(null);
    mockPrisma.conversationParticipant.findUnique.mockResolvedValue(null);
    mockPrisma.conversationParticipant.count.mockResolvedValue(1);
    mockPrisma.conversationInvite.findFirst.mockResolvedValue(null);
  });

  test('resolves a username with leading @ without exposing email', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(targetUser);
    const res = makeRes();

    await resolveGroupMember(makeReq({ body: { identifier: '@jima' } }), res);

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: { equals: 'jima', mode: 'insensitive' } }
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        match: expect.objectContaining({
          userId: targetUser.id,
          username: 'jima',
          matchedBy: 'USERNAME',
          membershipStatus: 'NOT_MEMBER'
        }),
        matchedBy: 'USERNAME'
      }
    });
    expect(res.json.mock.calls[0][0].data.match.email).toBeUndefined();
  });

  test('resolves exact email by lowercased lookup without returning email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(targetUser);
    const res = makeRes();

    await resolveGroupMember(makeReq({ body: { identifier: 'JIMA@EXAMPLE.COM' } }), res);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'jima@example.com' }
      })
    );
    expect(res.json.mock.calls[0][0].data.match).toEqual(
      expect.objectContaining({ userId: targetUser.id, matchedBy: 'EMAIL' })
    );
    expect(res.json.mock.calls[0][0].data.match.email).toBeUndefined();
  });

  test('resolves user ID before falling back to username', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(targetUser);
    const res = makeRes();

    await resolveGroupMember(makeReq({ body: { identifier: targetUser.id } }), res);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: targetUser.id } })
    );
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data.match).toEqual(
      expect.objectContaining({ userId: targetUser.id, matchedBy: 'USER_ID' })
    );
  });

  test('rejects unauthorized member lookup', async () => {
    mockPrisma.conversationParticipant.findFirst.mockResolvedValue(null);
    const res = makeRes();

    await resolveGroupMember(makeReq({ body: { identifier: '@jima' }, user: { id: 'member1', role: 'USER' } }), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'GROUP_ACCESS_DENIED' })
    );
  });

  test('marks an existing active participant as MEMBER', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(targetUser);
    mockPrisma.conversationParticipant.findUnique.mockResolvedValue({
      userId: targetUser.id,
      deletedAt: null
    });
    const res = makeRes();

    await resolveGroupMember(makeReq({ body: { identifier: 'jima' } }), res);

    expect(res.json.mock.calls[0][0].data.match).toEqual(
      expect.objectContaining({ membershipStatus: 'MEMBER' })
    );
  });

  test('does not autocomplete partial email identifiers', async () => {
    const res = makeRes();

    await listGroupMemberCandidates(makeReq({ query: { q: 'jim@example' } }), res);

    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { results: [] } });
  });

  test('limits username suggestions and excludes blocked targets', async () => {
    mockPrisma.user.findMany.mockResolvedValue([targetUser]);
    mockPrisma.userBlock.findFirst.mockResolvedValue({ id: 'block1' });
    const res = makeRes();

    await listGroupMemberCandidates(makeReq({ query: { q: '@ji' } }), res);

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          username: { startsWith: 'ji', mode: 'insensitive' }
        }),
        take: 10
      })
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { results: [] } });
  });

  test('prevents duplicate direct member addition', async () => {
    mockPrisma.user.findMany.mockResolvedValue([targetUser]);
    mockPrisma.conversationParticipant.findMany.mockResolvedValue([{ userId: targetUser.id }]);
    const res = makeRes();

    await addGroupMembers(makeReq({ body: { userIds: [targetUser.id], role: 'MEMBER' } }), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'USER_ALREADY_MEMBER' })
    );
    expect(mockPrisma.conversationParticipant.upsert).not.toHaveBeenCalled();
  });

  test('rate limits excessive resolver requests per actor', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const req = makeReq({ body: { identifier: 'unknown_user' }, user: { id: 'rate-owner', role: 'USER' } });
    const responses = [];

    for (let index = 0; index < 61; index += 1) {
      const res = makeRes();
      await resolveGroupMember(req, res);
      responses.push(res);
    }

    expect(responses[60].status).toHaveBeenCalledWith(429);
    expect(responses[60].json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, code: 'RATE_LIMITED' })
    );
  });
});
