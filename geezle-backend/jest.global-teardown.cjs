module.exports = async () => {
  try {
    require('ts-node/register/transpile-only');
    const prisma = require('./src/utils/prismaClient').default;
    await prisma.$disconnect();
  } catch {
    // Tests that do not initialize Prisma still receive deterministic teardown.
  }

  try {
    require('ts-node/register/transpile-only');
    const { shutdown } = require('./src/middleware/gcoinLimits');
    await shutdown();
  } catch {
    // The Gcoin protection client is optional in non-Gcoin test groups.
  }
};
