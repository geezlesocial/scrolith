const fs=require('fs'); const path=require('path'); const dir='c:\\Projects\\Scrolith-backend\\prisma\\migrations';
fs.readdirSync(dir).forEach(folder=>{
  const p=path.join(dir,folder,'migration.sql');
  if(fs.existsSync(p)){
    const b=fs.readFileSync(p);
    console.log(folder, b.slice(0,4));
  }
});

