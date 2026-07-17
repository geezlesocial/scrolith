import { Request, Response } from 'express';
import express from 'express';
import request from 'supertest';

const findUnique = jest.fn();

jest.mock('../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    appSetting: {
      findUnique
    }
  }
}));

const loadMiddleware = async () => import('../middleware/maintenance.middleware');

const reqFor = (method: string, baseUrl: string, path: string): Request =>
  ({
    method,
    baseUrl,
    path,
    headers: {}
  }) as Request;

const res = {} as Response;

describe('maintenance middleware protected feedback routing', () => {
  beforeEach(() => {
    jest.resetModules();
    findUnique.mockReset();
  });

  test('does not query Prisma before protected feedback route auth can run', async () => {
    const { maintenanceModeMiddleware } = await loadMiddleware();
    const next = jest.fn();

    await maintenanceModeMiddleware(
      reqFor('POST', '/api', '/intelligence/feedback/events'),
      res,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();
  });

  test('does not query Prisma before protected feedback metrics auth can run', async () => {
    const { maintenanceModeMiddleware } = await loadMiddleware();
    const next = jest.fn();

    await maintenanceModeMiddleware(
      reqFor('GET', '/api', '/intelligence/feedback/metrics'),
      res,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(findUnique).not.toHaveBeenCalled();
  });

  test('fails open for existing non-exempt paths when maintenance lookup times out', async () => {
    const { maintenanceModeMiddleware } = await loadMiddleware();
    findUnique.mockRejectedValueOnce(
      Object.assign(new Error('Timed out fetching a new connection from the connection pool'), {
        code: 'P2024'
      })
    );
    const next = jest.fn();

    await maintenanceModeMiddleware(reqFor('POST', '/api', '/reco/feedback'), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  test('protected feedback POST returns 401 before maintenance storage when lookup would timeout', async () => {
    const { maintenanceModeMiddleware } = await loadMiddleware();
    const { default: intelligenceFeedbackRoutes } = await import('../routes/intelligenceFeedback.routes');
    const app = express();
    app.use(express.json());
    app.use('/api', maintenanceModeMiddleware);
    app.use('/api/intelligence/feedback', intelligenceFeedbackRoutes);

    findUnique.mockRejectedValueOnce(
      Object.assign(new Error('Timed out fetching a new connection from the connection pool'), {
        code: 'P2024'
      })
    );

    const response = await request(app)
      .post('/api/intelligence/feedback/events')
      .send({ entityType: 'post', entityId: 'post-1', action: 'impression' });

    expect(response.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });

  test('malformed unauthenticated feedback POST returns 401 before validation details', async () => {
    const { maintenanceModeMiddleware } = await loadMiddleware();
    const { default: intelligenceFeedbackRoutes } = await import('../routes/intelligenceFeedback.routes');
    const app = express();
    app.use(express.json());
    app.use('/api', maintenanceModeMiddleware);
    app.use('/api/intelligence/feedback', intelligenceFeedbackRoutes);

    const response = await request(app)
      .post('/api/intelligence/feedback/events')
      .send({ malformed: true });

    expect(response.status).toBe(401);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
