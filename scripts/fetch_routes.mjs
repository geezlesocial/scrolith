import axios from 'axios';
(async ()=>{
  try{
    const r = await axios.get('http://localhost:5000/api/_routes');
    console.log(JSON.stringify(r.data, null, 2));
  }catch(e){
    if (e.response) console.error('ERR', e.response.status, JSON.stringify(e.response.data, null,2)); else console.error('ERR', e.message);
    process.exit(1);
  }
})();
