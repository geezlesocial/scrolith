globalThis.localStorage = {
  getItem: (k) => null,
  setItem: (k, v) => {},
  removeItem: (k) => {}
};

(async () => {
  try {
    const { CMSService } = require('./cms_bundle.cjs');
    console.log('Calling CMSService.getHeaderConfig()');
    const header = await CMSService.getHeaderConfig();
    console.log('Header result:', JSON.stringify(header, null, 2).slice(0, 2000));
    console.log('\nCalling CMSService.getHeroSearchConfig()');
    const hero = await CMSService.getHeroSearchConfig();
    console.log('HeroSearch result:', JSON.stringify(hero, null, 2).slice(0, 2000));
  } catch (e) {
    console.error('Runner error:', e && e.stack ? e.stack : e);
    process.exit(2);
  }
})();
