module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit'],
  testMatch: ['**/g1ReadonlyMemberVerifier*.test.ts', '**/g1ReadonlyVerifier*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }],
  },
};
