export type ProvisioningStage = 'wifi_ok' | 'ok' | 'wifi_fail' | 'server_fail';
export interface DiscoveredGateway {
    /**
     * The gateway's hardware id — the same value the main app displays and
     * later passes to registerGateway(). NOT the BLE connection handle
     * (react-native-ble-plx's Device.id, a CoreBluetooth UUID on iOS / MAC on
     * Android) — that's a platform/session-scoped identifier the rest of the
     * system never sees. This is decoded from the advertisement's
     * manufacturerData the same way src/slices/bleSlice.ts's
     * connectBLEDevice does in the main app, so a gateway shows up with the
     * same id here as it would there.
     */
    id: string;
    /** The gateway's advertised model name, e.g. "Coiliiot RW10". */
    model: string;
    rssi: number | null;
}
export interface SendWifiCredentialsOptions {
    /**
     * Called with every stage the gateway reports, including the final one —
     * 'wifi_fail' and 'server_fail' fire here too, alongside the promise
     * rejecting, specifically so callers can tell them apart: 'wifi_fail'
     * means the connection is still open (safe to call
     * sendWifiCredentials() again), 'server_fail' means the gateway is
     * rebooting and the connection is already gone.
     */
    onProgress?: (stage: ProvisioningStage) => void;
}
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
export declare const scanForGateways: (onUpdate: (devices: DiscoveredGateway[]) => void, onError?: (error: Error) => void, onScanEnd?: () => void) => (() => void);
/**
 * Connects to a gateway already found by scanForGateways() and discovers
 * its BLE services. Resolves once connected — no WiFi credentials are sent
 * yet; call sendWifiCredentials() next. Rejects if the gateway doesn't
 * respond within 10 seconds (e.g. it went out of range between scanning
 * and connecting).
 */
export declare const connectToGateway: (gatewayId: string) => Promise<void>;
/**
 * Disconnects a gateway previously connected via connectToGateway(), if
 * WiFi credentials were never sent (or you just changed your mind). Safe to
 * call even if already disconnected.
 */
export declare const disconnectFromGateway: (gatewayId: string) => Promise<void>;
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
export declare const sendWifiCredentials: (gatewayId: string, ssid: string, password: string, options?: SendWifiCredentialsOptions) => Promise<void>;
