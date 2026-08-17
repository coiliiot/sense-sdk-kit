"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listenForSensors = exports.getLatestSensorData = exports.unregisterSensor = exports.registerSensor = exports.removeGateway = exports.registerGateway = void 0;
const firestore_1 = require("@react-native-firebase/firestore");
const database_1 = require("@react-native-firebase/database");
const firebaseApp_1 = require("./firebaseApp");
const auth_1 = require("./auth");
const abbreviateId = (id) => id && id.length >= 8 ? id.substring(0, 8) : id;
/**
 * Claims a gateway for the current signed-in user. The gateway must already
 * exist in gateway_meta (seeded by Coiliiot when the unit was manufactured/
 * shipped) — mirrors addGateway() in the main app.
 */
const registerGateway = async (gatewayId) => {
    const app = (0, firebaseApp_1.getSdkApp)();
    const userId = (0, auth_1.getCurrentUserId)();
    const firestore = (0, firestore_1.getFirestore)(app);
    const database = (0, database_1.getDatabase)(app);
    const gatewayMetaDoc = (0, firestore_1.doc)((0, firestore_1.collection)(firestore, 'gateway_meta'), gatewayId);
    const gatewayOwnershipDoc = (0, firestore_1.doc)((0, firestore_1.collection)(firestore, 'gateway_ownerships'), gatewayId);
    const gatewayMetaSnapshot = await (0, firestore_1.getDoc)(gatewayMetaDoc);
    if (!gatewayMetaSnapshot.exists()) {
        throw new Error(`Gateway ${gatewayId} is not a recognized Coiliiot gateway.`);
    }
    const model = gatewayMetaSnapshot.data()?.model ||
        'Unknown Model';
    const ownershipSnapshot = await (0, firestore_1.getDoc)(gatewayOwnershipDoc);
    if (ownershipSnapshot.exists()) {
        const ownerUserId = ownershipSnapshot.data()?.user_id ||
            '';
        if (ownerUserId !== userId) {
            throw new Error(`Gateway ${gatewayId} is already claimed by another account.`);
        }
        const existing = await (0, database_1.get)((0, database_1.child)((0, database_1.ref)(database), `users/${userId}/gateways/${gatewayId}`));
        if (existing.exists()) {
            return existing.val();
        }
    }
    const newGateway = {
        gateway_id: gatewayId,
        user_id: userId,
        nickname: abbreviateId(gatewayId),
        model,
        created_at: new Date().toISOString(),
        last_seen: 0,
    };
    await (0, database_1.set)((0, database_1.ref)(database, `users/${userId}/gateways/${gatewayId}`), {
        ...newGateway,
        sensor_data: {},
    });
    await (0, firestore_1.setDoc)(gatewayOwnershipDoc, { user_id: userId });
    return newGateway;
};
exports.registerGateway = registerGateway;
/**
 * Releases a gateway (and every sensor currently registered under it) from
 * the current user's account — mirrors removeGateway() in the main app.
 * Deletes the sensor_ownerships for any registered sensors first, then the
 * RTDB gateway subtree, then the gateway_ownerships claim itself.
 */
const removeGateway = async (gatewayId) => {
    const app = (0, firebaseApp_1.getSdkApp)();
    const userId = (0, auth_1.getCurrentUserId)();
    const firestore = (0, firestore_1.getFirestore)(app);
    const database = (0, database_1.getDatabase)(app);
    const userGatewayRef = (0, database_1.ref)(database, `users/${userId}/gateways/${gatewayId}`);
    const gatewayOwnershipDoc = (0, firestore_1.doc)((0, firestore_1.collection)(firestore, 'gateway_ownerships'), gatewayId);
    const ownershipSnapshot = await (0, firestore_1.getDoc)(gatewayOwnershipDoc);
    if (!ownershipSnapshot.exists()) {
        throw new Error(`No ownership record found for gateway ${gatewayId}.`);
    }
    const owner = ownershipSnapshot.data()?.user_id ||
        '';
    if (owner !== userId) {
        throw new Error(`Gateway ${gatewayId} is not owned by the current user.`);
    }
    const sensorDataSnapshot = await (0, database_1.get)((0, database_1.ref)(database, `users/${userId}/gateways/${gatewayId}/sensor_data`));
    const registeredSensorIds = [];
    if (sensorDataSnapshot.exists()) {
        const sensorData = sensorDataSnapshot.val();
        Object.entries(sensorData).forEach(([sensorId, data]) => {
            if (data?.is_registered) {
                registeredSensorIds.push(sensorId);
            }
        });
    }
    await Promise.all(registeredSensorIds.map(sensorId => firestore.collection('sensor_ownerships').doc(sensorId).delete()));
    await (0, database_1.remove)(userGatewayRef);
    await firestore.collection('gateway_ownerships').doc(gatewayId).delete();
};
exports.removeGateway = removeGateway;
/**
 * Claims a sensor for the current user under the given gateway. This is a
 * pure database write — there is no communication with the sensor or
 * gateway hardware involved.
 */
const registerSensor = async (gatewayId, sensorId) => {
    const app = (0, firebaseApp_1.getSdkApp)();
    const userId = (0, auth_1.getCurrentUserId)();
    const firestore = (0, firestore_1.getFirestore)(app);
    const database = (0, database_1.getDatabase)(app);
    const sensorOwnershipDoc = (0, firestore_1.doc)((0, firestore_1.collection)(firestore, 'sensor_ownerships'), sensorId);
    const ownershipSnapshot = await (0, firestore_1.getDoc)(sensorOwnershipDoc);
    if (ownershipSnapshot.exists()) {
        const data = ownershipSnapshot.data();
        if (data?.gateway_id !== gatewayId || data?.user_id !== userId) {
            throw new Error(`Sensor ${sensorId} is already claimed by another gateway or account.`);
        }
    }
    await (0, database_1.update)((0, database_1.ref)(database, `users/${userId}/gateways/${gatewayId}/sensor_data/${sensorId}`), {
        is_registered: true,
    });
    await (0, firestore_1.setDoc)(sensorOwnershipDoc, { user_id: userId, gateway_id: gatewayId });
};
exports.registerSensor = registerSensor;
/**
 * Releases a sensor from the current user's account — mirrors
 * removeRegisteredSensor() in the main app. Clears is_registered rather
 * than deleting the sensor_data node, so its history stays intact; deletes
 * the sensor_ownerships claim.
 */
const unregisterSensor = async (gatewayId, sensorId) => {
    const app = (0, firebaseApp_1.getSdkApp)();
    const userId = (0, auth_1.getCurrentUserId)();
    const firestore = (0, firestore_1.getFirestore)(app);
    const database = (0, database_1.getDatabase)(app);
    await (0, database_1.update)((0, database_1.ref)(database, `users/${userId}/gateways/${gatewayId}/sensor_data/${sensorId}`), { is_registered: false });
    const sensorOwnershipDoc = (0, firestore_1.doc)((0, firestore_1.collection)(firestore, 'sensor_ownerships'), sensorId);
    const ownershipSnapshot = await (0, firestore_1.getDoc)(sensorOwnershipDoc);
    if (!ownershipSnapshot.exists()) {
        throw new Error(`No ownership record found for sensor ${sensorId}.`);
    }
    const data = ownershipSnapshot.data();
    if (data?.gateway_id !== gatewayId || data?.user_id !== userId) {
        throw new Error(`Sensor ${sensorId} is not owned by the current user on this gateway.`);
    }
    await sensorOwnershipDoc.delete();
};
exports.unregisterSensor = unregisterSensor;
// Cached per model for the lifetime of the app — property maps don't change at runtime.
const propertyMapCache = new Map();
const getPropertyMap = async (model) => {
    if (!model) {
        return [];
    }
    if (propertyMapCache.has(model)) {
        return propertyMapCache.get(model);
    }
    const app = (0, firebaseApp_1.getSdkApp)();
    const firestore = (0, firestore_1.getFirestore)(app);
    const modelDoc = await (0, firestore_1.getDoc)((0, firestore_1.doc)((0, firestore_1.collection)(firestore, 'product_models'), model));
    const propertyMap = (modelDoc.data()
        ?.propertyMap || []).map(p => p.name);
    propertyMapCache.set(model, propertyMap);
    return propertyMap;
};
// Shared by getLatestSensorData and listenForSensors, so there's exactly
// one implementation of "compute latest reading" in this SDK — mirrors
// getLatestSensorData in the main app's src/utils/sensorUtils.ts, which
// the main app applies identically to registered and unregistered sensors
// alike; only is_registered decides which bucket a sensor lands in, not
// which computation runs.
const computeLatestReading = async (dataEntries, model) => {
    const entries = dataEntries || {};
    const timestamps = Object.keys(entries)
        .map(Number)
        .sort((a, b) => b - a);
    const latestTimestamp = timestamps[0] || 0;
    const latestEntry = entries[latestTimestamp] || {};
    const propertyMap = await getPropertyMap(model);
    const current_data = {};
    propertyMap.forEach((name, index) => {
        current_data[name] = latestEntry?.data?.[index];
    });
    return {
        last_seen: latestTimestamp,
        current_data,
        rssi: latestEntry?.rssi,
        battery: latestEntry?.battery,
    };
};
/**
 * Reads the most recent reading for a sensor, labeled using the hardware
 * model's property map (e.g. { temperature, humidity }). Works the same
 * whether the sensor is registered or not — the sensor and gateway don't
 * know about ownership, they just relay whatever they measure/receive.
 */
const getLatestSensorData = async (gatewayId, sensorId) => {
    const app = (0, firebaseApp_1.getSdkApp)();
    const userId = (0, auth_1.getCurrentUserId)();
    const database = (0, database_1.getDatabase)(app);
    const snapshot = await (0, database_1.get)((0, database_1.ref)(database, `users/${userId}/gateways/${gatewayId}/sensor_data/${sensorId}`));
    if (!snapshot.exists()) {
        throw new Error(`No data found for sensor ${sensorId} on gateway ${gatewayId}.`);
    }
    const sensorValue = snapshot.val();
    return computeLatestReading(sensorValue.data_entries, sensorValue.model);
};
exports.getLatestSensorData = getLatestSensorData;
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
const listenForSensors = (gatewayId, callback) => {
    const app = (0, firebaseApp_1.getSdkApp)();
    const userId = (0, auth_1.getCurrentUserId)();
    const database = (0, database_1.getDatabase)(app);
    const sensorDataRef = (0, database_1.ref)(database, `users/${userId}/gateways/${gatewayId}/sensor_data`);
    const listener = (0, database_1.onValue)(sensorDataRef, async (snapshot) => {
        const raw = (snapshot.val() || {});
        const sensors = await Promise.all(Object.entries(raw)
            .filter(([, value]) => value?.data_entries)
            .map(async ([sensorId, value]) => {
            const reading = await computeLatestReading(value.data_entries, value.model);
            return {
                sensor_id: sensorId,
                model: value.model,
                is_registered: !!value.is_registered,
                ...reading,
            };
        }));
        callback(sensors);
    });
    return () => sensorDataRef.off('value', listener);
};
exports.listenForSensors = listenForSensors;
