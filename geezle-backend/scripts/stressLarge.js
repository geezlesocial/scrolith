(async () => {
  const base = 'http://localhost:5000';
  const credit = async () => {
    const res = await fetch(`${base}/api/gcoin/admin/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-role': 'admin' },
      body: JSON.stringify({ userId: 'dev-user-id-123', amount: 100000 })
    });
    return res.json().catch(() => ({}));
  };

  const doTransfer = async (i) => {
    try {
      const res = await fetch(`${base}/api/gcoin/transfer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toEmail: 'dev@example.com', amount: 1, note: `stress-large-${i}` })
      });
      const json = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, body: json };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  const doConversion = async (i) => {
    try {
      const res = await fetch(`${base}/api/gcoin/conversions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: 1 })
      });
      const json = await res.json().catch(() => ({ status: res.status }));
      return { ok: res.ok, status: res.status, body: json };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  console.log('Crediting dev user with large balance...');
  console.log(await credit());

  const transferConcurrency = 200;
  const conversionConcurrency = 50;

  console.log(`Starting ${transferConcurrency} concurrent transfers...`);
  const transfers = Array.from({ length: transferConcurrency }, (_, i) => doTransfer(i));
  const tResults = await Promise.all(transfers);
  console.log('Transfer results summary:');
  const tSuccess = tResults.filter(r => r.ok).length;
  const t429 = tResults.filter(r => r.status === 429).length;
  console.log(`success=${tSuccess}, 429=${t429}`);

  console.log(`Starting ${conversionConcurrency} concurrent conversions...`);
  const conversions = Array.from({ length: conversionConcurrency }, (_, i) => doConversion(i));
  const cResults = await Promise.all(conversions);
  console.log('Conversion results summary:');
  const cSuccess = cResults.filter(r => r.ok).length;
  const c429 = cResults.filter(r => r.status === 429).length;
  console.log(`success=${cSuccess}, 429=${c429}`);

  console.log('Done.');
  process.exit(0);
})();
