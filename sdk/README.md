# @coiliiot/sense-sdk

A minimal SDK for integrating with the Coiliiot Sense platform: BLE gateway
provisioning, gateway/sensor registration, and reading sensor data. This is
a sandbox SDK backed by Coiliiot's staging environment — not production,
and not the full Coiliiot Sense app or cloud.

A working reference app using every function below lives in the sibling
[`example/`](../example) directory of this repo.

## Install

Download the tarball from the [v0.1.0 release](https://github.com/coiliiot/sense-sdk-kit/releases/tag/v0.1.0), then:

```
npm install ./coiliiot-sense-sdk-0.1.0.tgz
```

Or install directly from the release URL without downloading it first:

```
npm install https://github.com/coiliiot/sense-sdk-kit/releases/download/v0.1.0/coiliiot-sense-sdk-0.1.0.tgz
```

Peer dependencies (install in your own app if not already present):
`@react-native-firebase/app`, `@react-native-firebase/auth`,
`@react-native-firebase/database`, `@react-native-firebase/firestore`,
`react-native-ble-plx`.

## Usage

```ts
import {
  initSdk,
  signIn,
  scanForGateways,
  connectToGateway,
  sendWifiCredentials,
  registerGateway,
  listenForSensors,
  registerSensor,
  getLatestSensorData,
} from '@coiliiot/sense-sdk';

// 1. Initialize once, with the config Coiliiot gives you for the sandbox project.
await initSdk({
  apiKey: '...',
  appId: '...',
  projectId: 'coiliiot-sense-staging',
  databaseURL: 'https://coiliiot-sense-staging-default-rtdb.firebaseio.com',
  messagingSenderId: '...', // required, despite the name — Firebase rejects init without it
});

// 2. Sign in with the test account Coiliiot created for you.
//    There is no sign-up — accounts are provisioned per OEM, not self-serve.
await signIn('your-test-account@example.com', 'password');

// 3. Scan for gateways in BLE range. Every RG-RW10 unit advertises the same
//    name, so if more than one is nearby, this list — updated live as each
//    is found — is the only way to tell them apart (e.g. by signal
//    strength). Stops automatically after 3s; call again to restart.
const stopScan = scanForGateways(
  devices => console.log('found so far:', devices), // [{ id, model, rssi }, ...]
  err => console.error('scan error:', err),
  () => console.log('scan finished'),
);

// 4. Connect to the one the user picked. No WiFi credentials are sent yet.
await connectToGateway('AABBCCDDEEFF');

// 5. Send WiFi credentials to the connected gateway and wait for it to
//    reach the cloud.
await sendWifiCredentials('AABBCCDDEEFF', 'my-wifi-ssid', 'my-wifi-password', {
  onProgress: stage => console.log('provisioning:', stage), // wifi_ok, ok, wifi_fail, or server_fail
});
// A 'wifi_fail' rejection means the connection is still open — call
// sendWifiCredentials() again with corrected credentials. A 'server_fail'
// rejection means the gateway is rebooting and the connection is gone —
// scan and connect again once it's back.

// 6. Claim the gateway for your account.
await registerGateway('AABBCCDDEEFF');

// 7. Hold the button on a physical sensor for a few seconds to force it to
//    transmit, then watch for it in the live list — every sensor under the
//    gateway shows up here, tagged is_registered, not just unclaimed ones:
const unsubscribe = listenForSensors('AABBCCDDEEFF', sensors => {
  const unclaimed = sensors.filter(s => !s.is_registered);
  console.log('sensors not yet claimed:', unclaimed);
});

// 8. Claim one.
await registerSensor('AABBCCDDEEFF', '1122334455');

// 9. Read its latest value (works the same whether claimed or not).
const reading = await getLatestSensorData('AABBCCDDEEFF', '1122334455');
console.log(reading); // { last_seen, current_data: { temperature, humidity, ... }, rssi, battery }
```

### Undoing things

- `disconnectFromGateway(gatewayId)` — disconnect before sending credentials, if you change your mind.
- `removeGateway(gatewayId)` — releases the gateway and every sensor currently registered under it.
- `unregisterSensor(gatewayId, sensorId)` — releases a single sensor; its history is kept, not deleted.

## What this SDK does not do

No historical/aggregated data beyond the latest reading, no alerts or
notifications, no firmware OTA control, no fleet management, no access to
the hardware catalog beyond what's needed to label a sensor's own readings.
If you need any of that, talk to Coiliiot about your own backend
integration.

## Why there's no `pairSensor()`

Sensors and gateways don't know anything about ownership — a sensor just
transmits (on its own schedule, or immediately if you hold its button), and
any gateway in range relays whatever it hears. Ownership is decided entirely
by which account calls `registerSensor()`. `listenForSensors` just reflects
what's already arrived, tagged with whether anyone's claimed it yet.

## Why gateway ids come from `scanForGateways`, not the BLE connection itself

The BLE library's own device identifier (`Device.id`) is a
platform/session-scoped value (a CoreBluetooth UUID on iOS, a MAC address on
Android) — it's not the gateway's real hardware id, and nothing else in the
system ever sees it. `scanForGateways` decodes the actual gateway id from
the advertisement's `manufacturerData`, the same way the main Coiliiot Sense
app does, so the id you get here is the same one you'd see anywhere else —
and the one `registerGateway()` expects.
