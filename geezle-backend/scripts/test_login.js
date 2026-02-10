const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

(async () => {
  try {
    const prisma = new PrismaClient();
    const email = 'admin@local';
    const password = 'admin12345';
    const user = await prisma.user.findUnique({ where: { email } });
    console.log('user found:', !!user);
    if (!user) { await prisma.$disconnect(); process.exit(0); }
    console.log('passwordHash (prefix):', user.passwordHash ? user.passwordHash.slice(0,6) : null);
    const match = await bcrypt.compare(password, user.passwordHash);
    console.log('bcrypt.compare result:', match);
    const secret = process.env.JWT_SECRET || 'dev_jwt_secret';
    console.log('JWT secret present:', !!process.env.JWT_SECRET);
    const token = jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn: '1d' });
    console.log('jwt token length:', token.length);
    await prisma.$disconnect();
  } catch (e) {
    console.error('test_login error:', e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();
