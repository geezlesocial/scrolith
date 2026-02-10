const fs=require('fs');
const p='c:\\Projects\\Scrolith-backend\\prisma\\migrations\\20260124_add_social_notifications\\migration.sql';
const b=fs.readFileSync(p);
if(b[0]===0xEF && b[1]===0xBB && b[2]===0xBF){
  fs.writeFileSync(p,b.slice(3));
  console.log('stripped BOM');
}else{
  console.log('no BOM');
}

