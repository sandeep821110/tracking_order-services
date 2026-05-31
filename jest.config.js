export default {
  testEnvironment: "node",
  transform: {},
  setupFiles: ["./tests/setup.js"],
  testTimeout: 30000,
  clearMocks: true,
  injectGlobals: true,
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/src/config/",
  ],
  testMatch: ["<rootDir>/tests/**/*.test.js"],
};
