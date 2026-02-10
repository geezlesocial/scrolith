import axios from 'axios';
(async function(){
  try{
    const resp = await axios.get('http://localhost:5000/api/community/admin/config');
    console.log('STATUS', resp.status);
    console.log('DATA', JSON.stringify(resp.data, null, 2));
  }catch(e){
    if (e.response) console.error('ERR', e.response.status, JSON.stringify(e.response.data)); else console.error('ERR', e.message);
    process.exit(1);
  }
})();
