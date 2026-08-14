import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('header configuration has one shared cache key', () => {
  const source = read('src/services/cms.ts');
  assert.match(source, /'cms:header'/);
  assert.match(source, /\(\) => CMSService\.loadHeaderConfig\(\)/);
});

test('hero-search configuration has one shared cache key', () => {
  const source = read('src/services/cms.ts');
  assert.match(source, /'cms:hero-search'/);
  assert.match(source, /\(\) => CMSService\.loadHeroSearchConfig\(\)/);
});

test('ordinary Navbar rerenders do not own a polling loop', () => {
  const source = read('src/components/Navbar.tsx');
  assert.doesNotMatch(source, /setInterval\(\(\) => \{\s*refreshConfigs\(\)/);
});

test('socket events remain the intentional CMS refresh trigger', () => {
  const source = read('src/components/Navbar.tsx');
  assert.match(source, /socket\.on\("cms:header_updated", handleRefresh\)/);
  assert.match(source, /socket\.on\("cms:hero_search_updated", handleRefresh\)/);
});

test('ContentProvider and Navbar share CMSService rather than duplicate fetch wrappers', () => {
  const content = read('src/context/ContentContext.tsx');
  const navbar = read('src/components/Navbar.tsx');
  assert.match(content, /CMSService\.getHeaderConfig\(\)/);
  assert.match(navbar, /CMSService\.getHeaderConfig\(\)/);
  assert.match(content, /ContentProvider/);
});

test('compact mobile home has no separate header or hero hydration path', () => {
  const mobileHome = read('src/mobile/home/MobileHome.tsx');
  assert.doesNotMatch(mobileHome, /CMSService\.get(HeaderConfig|HeroSearchConfig)/);
});

test('CMS cache exposes bounded diagnostics without credentials', () => {
  const source = read('src/services/cms.ts');
  assert.match(source, /__cmsPublicConfigTestHooks/);
  assert.doesNotMatch(source, /snapshot\(\).*Authorization|snapshot\(\).*token/i);
});
