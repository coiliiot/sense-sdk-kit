"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendWifiCredentials = exports.disconnectFromGateway = exports.connectToGateway = exports.scanForGateways = void 0;
const react_native_ble_plx_1 = require("react-native-ble-plx");
const react_native_1 = require("react-native");
const buffer_1 = require("buffer");
const auth_1 = require("./auth");
const manager = new react_native_ble_plx_1.BleManager();
const BLE_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const BLE_WIFI_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';
const BLE_RESULT_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef2';
const GATEWAY_DEVICE_NAME = 'Coiliiot RW10';
// Exact strings the gateway notifies with — see provision_via_ble() in
// Sense-RG-RW10-firmware/src/sys/sys.cpp. Do not change without checking
// the firmware side stays in sync.
const BLE_RESULT_WIFI_OK = 'wifi_ok';
const BLE_RESULT_OK = 'ok';
const BLE_RESULT_WIFI_FAIL = 'wifi_fail';
const BLE_RESULT_SERVER_FAIL = 'server_fail';
const SCAN_DURATION_MS = 3000;
const CONNECT_TIMEOUT_MS = 10000;
// gatewayId -> BLE connection handle. Populated by scanForGateways,
// accumulated across scan sessions (not cleared on stop/restart) since a
// gateway found earlier is still connectable later as long as it's in range.
const knownBleDeviceIds = new Map();
// gatewayId -> connected Device. Populated by connectToGateway, read by
// sendWifiCredentials. Removed once provisioning succeeds or the gateway is
// known to have gone away (server_fail reboots it) — but deliberately left
// in place after a wifi_fail, since the gateway stays connected and waiting
// for another attempt on the same connection.
const connectedDevices = new Map();
// CoreBluetooth (iOS) and the Android BLE stack both take a moment to
// finish initializing after the manager is created — scanning before the
// adapter reaches PoweredOn silently finds nothing, rather than erroring.
const waitForPoweredOn = () => new Promise((resolve, reject) => {
    manager.state().then(currentState => {
        if (currentState === react_native_ble_plx_1.State.PoweredOn) {
            resolve();
            return;
        }
        const subscription = manager.onStateChange(newState => {
            if (newState === react_native_ble_plx_1.State.PoweredOn) {
                subscription.remove();
                resolve();
            }
            else if (newState === react_native_ble_plx_1.State.PoweredOff ||
                newState === react_native_ble_plx_1.State.Unauthorized ||
                newState === react_native_ble_plx_1.State.Unsupported) {
                subscription.remove();
                reject(new Error(`Bluetooth is not available (state: ${newState}). Make sure Bluetooth is on and permission is granted.`));
            }
        }, true);
    });
});
const requestPermissions = async () => {
    if (react_native_1.Platform.OS !== 'android') {
        return true;
    }
    const granted = await react_native_1.PermissionsAndroid.requestMultiple([
        react_native_1.PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        react_native_1.PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        react_native_1.PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return (granted['android.permission.ACCESS_FINE_LOCATION'] ===
        react_native_1.PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.BLUETOOTH_SCAN'] ===
            react_native_1.PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.BLUETOOTH_CONNECT'] ===
            react_native_1.PermissionsAndroid.RESULTS.GRANTED);
};
// Same decoding as connectBLEDevice in the main app's src/slices/bleSlice.ts
// — the gateway's real hardware id is packed into the BLE advertisement's
// manufacturerData, not its name or its BLE connection handle.
const decodeGatewayId = (manufacturerData) => {
    if (!manufacturerData) {
        return null;
    }
    const decoded = buffer_1.Buffer.from(manufacturerData, 'base64');
    const hex = Array.from(decoded)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
    return hex || null;
};
/**
 * Starts scanning for Coiliiot gateways and calls onUpdate every time the
 * list of distinct gateways seen so far changes — the list grows live as
 * gateways are found, it isn't a single batch delivered after a fixed
 * window. Stops automatically after 3 seconds, calling onScanEnd — the same
 * callback fires if you stop it early via the returned function. Call
 * scanForGateways() again any time to restart.
 *
 * Every RG-RW10 unit advertises the identical BLE name, so if more than one
 * gateway is in range this list is the only way to tell them apart — show
 * it to the user (e.g. by signal strength) and pass the id they pick to
 * connectToGateway().
 */
const scanForGateways = (onUpdate, onError, onScanEnd) => {
    let stopped = false;
    const found = new Map();
    const stop = () => {
        if (stopped) {
            return;
        }
        stopped = true;
        manager.stopDeviceScan();
        onScanEnd?.();
    };
    (async () => {
        try {
            const granted = await requestPermissions();
            if (!granted) {
                onError?.(new Error('Bluetooth/location permissions were not granted.'));
                return;
            }
            await waitForPoweredOn();
            if (stopped) {
                return;
            }
            manager.startDeviceScan(null, null, (error, device) => {
                if (stopped) {
                    return;
                }
                if (error) {
                    onError?.(error);
                    return;
                }
                if (!device || device.name !== GATEWAY_DEVICE_NAME) {
                    return;
                }
                const gatewayId = decodeGatewayId(device.manufacturerData);
                if (!gatewayId) {
                    return;
                }
                knownBleDeviceIds.set(gatewayId, device.id);
                found.set(gatewayId, {
                    id: gatewayId,
                    model: device.name,
                    rssi: device.rssi,
                });
                onUpdate(Array.from(found.values()));
            });
            setTimeout(stop, SCAN_DURATION_MS);
        }
        catch (err) {
            onError?.(err);
        }
    })();
    return stop;
};
exports.scanForGateways = scanForGateways;
/**
 * Connects to a gateway already found by scanForGateways() and discovers
 * its BLE services. Resolves once connected — no WiFi credentials are sent
 * yet; call sendWifiCredentials() next. Rejects if the gateway doesn't
 * respond within 10 seconds (e.g. it went out of range between scanning
 * and connecting).
 */
const connectToGateway = async (gatewayId) => {
    const bleDeviceId = knownBleDeviceIds.get(gatewayId);
    if (!bleDeviceId) {
        throw new Error(`Gateway ${gatewayId} wasn't found by a prior scanForGateways() call — scan again before connecting.`);
    }
    manager.stopDeviceScan();
    const connectedDevice = await manager.connectToDevice(bleDeviceId, {
        timeout: CONNECT_TIMEOUT_MS,
    });
    await connectedDevice.discoverAllServicesAndCharacteristics();
    connectedDevices.set(gatewayId, connectedDevice);
};
exports.connectToGateway = connectToGateway;
/**
 * Disconnects a gateway previously connected via connectToGateway(), if
 * WiFi credentials were never sent (or you just changed your mind). Safe to
 * call even if already disconnected.
 */
const disconnectFromGateway = async (gatewayId) => {
    const connectedDevice = connectedDevices.get(gatewayId);
    connectedDevices.delete(gatewayId);
    if (connectedDevice) {
        await connectedDevice.cancelConnection();
    }
};
exports.disconnectFromGateway = disconnectFromGateway;
/**
 * Sends WiFi credentials to a gateway already connected via
 * connectToGateway(), and waits for its result. Resolves once the gateway
 * confirms it reached the cloud (the "ok" notification).
 *
 * On a "wifi_fail" result (wrong WiFi credentials) the gateway stays
 * connected and waiting — this function can simply be called again with
 * corrected credentials, no need to reconnect. On "server_fail" the gateway
 * reboots itself, so the connection is gone; you'll need to scan and
 * connect again from scratch.
 *
 * Requires signIn() to already have been called: the current user's id is
 * sent to the gateway as part of provisioning, since that's what tells the
 * gateway which users/{uid}/gateways/{id} path to write its data into.
 */
const sendWifiCredentials = async (gatewayId, ssid, password, options = {}) => {
    const { onProgress } = options;
    const userId = (0, auth_1.getCurrentUserId)();
    const connectedDevice = connectedDevices.get(gatewayId);
    if (!connectedDevice) {
        throw new Error(`Gateway ${gatewayId} isn't connected — call connectToGateway() first.`);
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        let resultSubscription = null;
        const finish = (err, terminal) => {
            if (settled) {
                return;
            }
            settled = true;
            resultSubscription?.remove();
            if (terminal) {
                connectedDevices.delete(gatewayId);
            }
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        };
        (async () => {
            try {
                resultSubscription = connectedDevice.monitorCharacteristicForService(BLE_SERVICE_UUID, BLE_RESULT_CHAR_UUID, (charError, characteristic) => {
                    if (settled || charError || !characteristic?.value) {
                        return;
                    }
                    const result = buffer_1.Buffer.from(characteristic.value, 'base64').toString('utf-8');
                    switch (result) {
                        case BLE_RESULT_WIFI_OK:
                            onProgress?.('wifi_ok');
                            break;
                        case BLE_RESULT_OK:
                            onProgress?.('ok');
                            finish(null, true);
                            break;
                        case BLE_RESULT_WIFI_FAIL:
                            onProgress?.('wifi_fail');
                            finish(new Error('Gateway could not connect to that WiFi network. The connection is still open — call sendWifiCredentials() again with corrected credentials.'), false);
                            break;
                        case BLE_RESULT_SERVER_FAIL:
                            onProgress?.('server_fail');
                            finish(new Error("Gateway connected to WiFi but could not reach the cloud. It's restarting itself — scan and connect again once it's back."), true);
                            break;
                        default:
                            break;
                    }
                });
                const configString = `${ssid}\n${password}\n${userId}`;
                await connectedDevice.writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_WIFI_CHAR_UUID, buffer_1.Buffer.from(configString, 'utf-8').toString('base64'));
            }
            catch (err) {
                finish(err, true);
            }
        })();
    });
};
exports.sendWifiCredentials = sendWifiCredentials;
