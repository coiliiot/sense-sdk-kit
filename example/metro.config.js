const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // @coiliiot/sense-sdk is a symlink (file:../sdk) pointing outside this
  // project root — Metro won't watch it without this.
  watchFolders: [path.resolve(__dirname, '../sdk')],
  resolver: {
    // Metro resolves the symlink to its real path (sdk/lib/*.js), so the
    // normal node_modules walk-up never reaches this project's
    // node_modules (sdk/ is a sibling of example/, not an ancestor).
    // Add it explicitly so deps like @babel/runtime still resolve.
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
