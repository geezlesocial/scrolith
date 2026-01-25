(async () => {
  const base = 'http://localhost:5000';
  const credit = async () => {
    const res = await fetch(`${base}/api/gcoin/admin/credit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-role': 'admin' },
      body: JSON.stringify({ userId: 'dev-user-id-123', amount: 10000 })
    });
    return res.json().catch(() => ({}));
  };

  const doTransfer = async (i) => {
    try {
      const res = await fetch(`${base}/api/gcoin/transfer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ toEmail: 'dev@example.com', amount: 1, note: `stress-${i}` })
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

  console.log('Crediting dev user...');
  console.log(await credit());

  const transferConcurrency = 30;
  const conversionConcurrency = 10;

  console.log(`Starting ${transferConcurrency} concurrent transfers...`);
  const transfers = Array.from({ length: transferConcurrency }, (_, i) => doTransfer(i));
  const tResults = await Promise.all(transfers);
  console.log('Transfer results:');
  console.table(tResults.map((r, i) => ({ i, ok: r.ok, status: r.status, error: r.error || '' })));

  console.log(`Starting ${conversionConcurrency} concurrent conversions...`);
  const conversions = Array.from({ length: conversionConcurrency }, (_, i) => doConversion(i));
  const cResults = await Promise.all(conversions);
  console.log('Conversion results:');
  console.table(cResults.map((r, i) => ({ i, ok: r.ok, status: r.status, error: r.error || '' })));

  // Summarize failures
  const tFails = tResults.filter(r => !r.ok).length;
  const cFails = cResults.filter(r => !r.ok).length;
  console.log(`Summary: transfers failed=${tFails}/${transferConcurrency}, conversions failed=${cFails}/${conversionConcurrency}`);

  process.exit(0);
})();
