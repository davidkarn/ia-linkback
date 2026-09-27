// Jest for the backend, running the TypeScript as ES modules (package.json is "type": "module", and code like
// import.meta.dirname only works in ESM). @swc/jest compiles each file; there's no type checking in tests.
// Usage (from src/):  npm test    (npm test -- lib/citation_matching to run matching files only)
export default {
  testEnvironment:        'node',
  testMatch:              ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/web/', '/output/'],
  extensionsToTreatAsEsm: ['.ts'],
  transform:              {
    '^.+\\.ts$': ['@swc/jest', {
      jsc: {
        parser:    { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true },
        target:    'es2022',
      },
      module: { type: 'es6' },
    }],
  },
  // some imports name the compiled file ("../lib.js") for a .ts source
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
