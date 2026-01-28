globalThis.localStorage = {
    getItem: (k) => null,
    setItem: (k, v) => {},
    removeItem: (k) => {}
};

// ensure fetch is available (Node 18+ has it)
if (!globalThis.fetch) {
    console.error('fetch is not available in this Node; please use Node 18+');
    process.exit(1);
}

(async () => {
    try {
        // import the bundled CMSService
        const { CMSService } = await import('./cms_bundle.mjs');
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
