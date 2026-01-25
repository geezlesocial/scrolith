const express = require('express');
const app = express();
const PORT = 5003;

app.get('/api/cms/test', (req, res) => {
  console.log('✅ GET /api/cms/test');
  res.json({ message: 'CMS test works!' });
});

app.get('/api/cms/header', (req, res) => {
  console.log('✅ GET /api/cms/header');
  res.json({ header: 'test' });
});

app.get('/api/admin/test', (req, res) => {
  console.log('✅ GET /api/admin/test');
  res.json({ message: 'Admin test works!' });
});

app.get('/api/admin/platform/settings', (req, res) => {
  console.log('✅ GET /api/admin/platform/settings');
  res.json({ settings: 'test' });
});

app.listen(PORT, () => {
  console.log(`Minimal test server on port ${PORT}`);
  console.log(`Test: http://localhost:${PORT}/api/cms/test`);
  console.log(`Test: http://localhost:${PORT}/api/admin/platform/settings`);
});