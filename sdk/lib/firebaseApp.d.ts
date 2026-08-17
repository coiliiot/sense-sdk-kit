import { FirebaseApp } from '@react-native-firebase/app';
import { CoiliiotSdkConfig } from './config';
export declare const SDK_APP_NAME = "coiliiot-sense";
/**
 * Initializes the SDK's own Firebase app instance. Call this once, before
 * any other SDK function, with the config values Coiliiot gives you for the
 * sandbox project.
 */
export declare const initSdk: (config: CoiliiotSdkConfig) => Promise<FirebaseApp>;
export declare const getSdkApp: () => FirebaseApp;
