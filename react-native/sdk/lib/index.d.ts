export { initSdk } from './firebaseApp';
export type { CoiliiotSdkConfig } from './config';
export { signIn, signOut, onAuthStateChanged, getCurrentUserId } from './auth';
export { scanForGateways, connectToGateway, disconnectFromGateway, sendWifiCredentials, } from './ble';
export type { SendWifiCredentialsOptions, ProvisioningStage, DiscoveredGateway, } from './ble';
export { registerGateway, removeGateway, listenForSensors, registerSensor, unregisterSensor, getLatestSensorData, } from './device';
export type { SdkGateway, SdkSensor, LatestSensorData, } from './device';
