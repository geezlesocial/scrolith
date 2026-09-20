const nodeTestSpecs = [
  'src/__tests__/pushFirebaseDefaultApp.unit.test.ts',
  'src/__tests__/intelligence.contract.unit.test.ts',
  'src/__tests__/phase221.messagingCore.test.ts',
  'src/services/messaging/__tests__/lastMessagePreview.spec.ts',
  'src/services/messaging/__tests__/messagingPrivacyPolicy.spec.ts',
  'src/services/scrolitha/__tests__/scrolitha.messagingBridge.spec.ts',
  'src/services/scrolitha/__tests__/scrolitha.phase2071.spec.ts',
  'src/services/scrolitha/__tests__/scrolitha.phase2072.responseRecovery.spec.ts',
  'src/services/scrolitha/__tests__/scrolitha.phase2073.intentRouting.spec.ts',
  'src/services/scrolitha/__tests__/scrolitha.phase2074.responseFormat.spec.ts',
  'src/services/scrolitha/__tests__/scrolitha.phase2075.dedupeSearch.spec.ts',
  'src/services/scrolitha/__tests__/scrolitha.phase2076.fileIntelligence.spec.ts',
  'src/services/scrolitha/__tests__/scrolitha.phase2078.publicProfile.spec.ts',
  'src/services/scrolitha/__tests__/scrolitha.phase2079.capabilityActivation.spec.ts'
].map((path) => `<rootDir>/${path}`);

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts?(x)'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  setupFiles: ['<rootDir>/jest.setup.cjs'],
  globalTeardown: '<rootDir>/jest.global-teardown.cjs',
  moduleNameMapper: {
    '^vitest$': '<rootDir>/src/__tests__/vitestShim.ts'
  },
  moduleFileExtensions: ['ts','tsx','js','jsx','json','node'],
  testPathIgnorePatterns: [
    '/dist/',
    '/node_modules/',
    ...nodeTestSpecs.map((path) => path.replace('<rootDir>', '').replace(/\\/g, '/'))
  ],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  }
};
