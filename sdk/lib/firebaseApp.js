"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSdkApp = exports.initSdk = exports.SDK_APP_NAME = void 0;
const app_1 = require("@react-native-firebase/app");
// A named (non-default) Firebase app, so this SDK never collides with a
// Firebase project the host app may already have initialized for its own use.
exports.SDK_APP_NAME = 'coiliiot-sense';
let initPromise = null;
/**
 * Initializes the SDK's own Firebase app instance. Call this once, before
 * any other SDK function, with the config values Coiliiot gives you for the
 * sandbox project.
 */
const initSdk = (config) => {
    if (!initPromise) {
        initPromise = (async () => {
            try {
                return (0, app_1.getApp)(exports.SDK_APP_NAME);
            }
            catch {
                return (0, app_1.initializeApp)(config, exports.SDK_APP_NAME);
            }
        })();
    }
    return initPromise;
};
exports.initSdk = initSdk;
const getSdkApp = () => {
    try {
        return (0, app_1.getApp)(exports.SDK_APP_NAME);
    }
    catch {
        throw new Error('Coiliiot Sense SDK is not initialized. Call initSdk(config) once before using any other SDK function.');
    }
};
exports.getSdkApp = getSdkApp;
