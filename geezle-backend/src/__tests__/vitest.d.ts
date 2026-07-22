declare module 'vitest' {
  export const describe: typeof import('@jest/globals').describe;
  export const it: typeof import('@jest/globals').it;
  export const test: typeof import('@jest/globals').test;
  export const expect: typeof import('@jest/globals').expect;
  export const beforeAll: typeof import('@jest/globals').beforeAll;
  export const beforeEach: typeof import('@jest/globals').beforeEach;
  export const afterAll: typeof import('@jest/globals').afterAll;
  export const afterEach: typeof import('@jest/globals').afterEach;
  export const vi: typeof import('@jest/globals').jest;
}
