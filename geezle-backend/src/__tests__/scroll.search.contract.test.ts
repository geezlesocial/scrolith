import fs from 'node:fs';
import path from 'node:path';

const controllerPath = path.join(__dirname, '..', 'controllers', 'scroll.controller.ts');
const routesPath = path.join(__dirname, '..', 'routes', 'scroll.routes.ts');

describe('Scroll search contract', () => {
  const controller = fs.readFileSync(controllerPath, 'utf8');
  const routes = fs.readFileSync(routesPath, 'utf8');

  it('keeps search video-only and reuses server-side visibility protections', () => {
    expect(controller).toContain('export const searchScrollVideos');
    expect(controller).toContain("status: 'active'");
    expect(controller).toContain("fileId: { not: '' }");
    expect(controller).toContain('userBlock.findMany');
    expect(controller).toContain('scrollHidden');
    expect(controller).toContain('fetchScrollPayloadList(req, visibleRows, userId)');
  });

  it('registers search before the dynamic id route', () => {
    expect(routes.indexOf("router.get('/search'" )).toBeGreaterThan(-1);
    expect(routes.indexOf("router.get('/search'")).toBeLessThan(routes.indexOf("router.get('/:id'"));
    expect(routes).toContain('searchScrollVideos');
  });
});
