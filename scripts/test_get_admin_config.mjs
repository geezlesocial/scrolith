import axios from 'axios';
async function run() {
  try {
    const login = await axios.post('http://localhost:5000/api/auth/login', { email: 'admin@local.test', password: 'adminpass' });
    const token = login.data.token;
    console.log('TOKEN:', token);
    const resp = await axios.get('http://localhost:5000/api/community/admin/config', { headers: { Authorization: `Bearer ${token}` } });
    console.log('STATUS', resp.status);
    console.log('DATA', JSON.stringify(resp.data, null, 2));
  } catch (e) {
    if (e.response) {
      console.error('ERR STATUS', e.response.status);
      console.error('ERR DATA', JSON.stringify(e.response.data, null, 2));
    } else {
      console.error('ERR', e.message);
    }
    process.exit(1);
  }
}
run();
