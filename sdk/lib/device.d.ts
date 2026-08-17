export interface SdkGateway {
    gateway_id: string;
    user_id: string;
    nickname: string;
    model: string;
    created_at: string;
    last_seen: number;
}
/**
 * Claims a gateway for the current signed-in user. The gateway must already
 * exist in gateway_meta (seeded by Coiliiot when the unit was manufactured/
 * shipped) — mirrors addGateway() in the main app.
 */
export declare const registerGateway: (gatewayId: string) => Promise<SdkGateway>;
/**
 * Releases a gateway (and every sensor currently registered under it) from
 * the current user's account — mirrors removeGateway() in the main app.
 * Deletes the sensor_ownerships for any registered sensors first, then the
 * RTDB gateway subtree, then the gateway_ownerships claim itself.
 */
export declare const removeGateway: (gatewayId: string) => Promise<void>;
/**
 * Claims a sensor for the current user under the given gateway. This is a
 * pure database write — there is no communication with the sensor or
 * gateway hardware involved.
 */
export declare const registerSensor: (gatewayId: string, sensorId: string) => Promise<void>;
/**
 * Releases a sensor from the current user's account — mirrors
 * removeRegisteredSensor() in the main app. Clears is_registered rather
 * than deleting the sensor_data node, so its history stays intact; deletes
 * the sensor_ownerships claim.
 */
export declare const unregisterSensor: (gatewayId: string, sensorId: string) => Promise<void>;
export interface LatestSensorData {
    last_seen: number;
    current_data: Record<string, number>;
    rssi?: number;
    battery?: number;
}
/**
 * Reads the most recent reading for a sensor, labeled using the hardware
 * model's property map (e.g. { temperature, humidity }). Works the same
 * whether the sensor is registered or not — the sensor and gateway don't
 * know about ownership, they just relay whatever they measure/receive.
 */
export declare const getLatestSensorData: (gatewayId: string, sensorId: string) => Promise<LatestSensorData>;
export interface SdkSensor extends LatestSensorData {
    sensor_id: string;
    model?: string;
    is_registered: boolean;
}
/**
 * Subscribes to every sensor under a gateway — registered or not — each
 * tagged with is_registered and the same computed reading
 * getLatestSensorData produces. There's no separate "unregistered sensors"
 * bucket in the database (see sensor_data in Firebase RTDB): every sensor
 * lives at the same path with an is_registered flag, exactly mirroring
 * processSensorData in the main app's src/utils/sensorUtils.ts. Filter
 * client-side for !is_registered if you want a "sensors to claim" list.
 * Returns an unsubscribe function.
 */
export declare const listenForSensors: (gatewayId: string, callback: (sensors: SdkSensor[]) => void) => (() => void);
