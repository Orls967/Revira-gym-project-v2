const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['dist/**', 'build/**', '.expo/**', 'web-build/**'],
  },
];
