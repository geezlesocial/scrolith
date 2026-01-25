const prisma = require('../node_modules/.prisma/client').PrismaClient ? new (require('../node_modules/.prisma/client').PrismaClient)() : require('@prisma/client').PrismaClient;
(async ()=>{
  try{
    const id = 'target-user-1';
    const user = await prisma.user.upsert({ where: { id }, update: { email: 'target@example.com', isActive: true }, create: { id, email: 'target@example.com', isActive: true, isVerified: true } });
    console.log('upserted', user.id);
    process.exit(0);
  }catch(e){ console.error(e); process.exit(1);} 
})();
