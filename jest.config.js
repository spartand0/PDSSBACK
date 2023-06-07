module.exports = {
  testEnvironment: 'node',
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },
  restoreMocks: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['lcov', 'cobertura'],
};
