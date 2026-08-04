const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'node_modules.stale/**',
      'coverage/**',
      'expo-env.d.ts',
    ],
  },
  {
    rules: {
      'import/namespace': 'off',
      'import/no-duplicates': 'off',
      'import/no-unresolved': 'off',
    },
  },
];
