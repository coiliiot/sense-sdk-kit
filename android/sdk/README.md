# @coiliiot/sense-sdk (Android)

A minimal SDK for integrating with the Coiliiot Sense platform: BLE
gateway provisioning, gateway/sensor registration, and reading sensor
data. This is a sandbox SDK backed by Coiliiot's staging environment —
not production, and not the full Coiliiot Sense app or cloud.

A working reference app using every function below lives in the sibling
[`demo/`](../demo) directory of this repo.

## Install

Drop the `.aar` into your project (e.g. an `libs/` folder) and reference
it directly:

```kotlin
// app/build.gradle.kts
dependencies {
    implementation(files("libs/coiliiot-sense-sdk-0.1.0.aar"))
}
```

A raw `.aar` file dependency doesn't carry transitive dependency
metadata the way a published Maven artifact would, so declare these
yourself too:

```kotlin
dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.19.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-database")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
}
```

Minimum SDK 24.

## Usage

```kotlin
import com.coiliiot.sensesdk.*

// 1. Initialize once, with the config Coiliiot gives you for the sandbox
//    project. Call this from Application.onCreate() or your first Activity.
SenseSdk.init(
    context = applicationContext,
    config = SenseSdkConfig(
        apiKey = "...",
        appId = "...",
        projectId = "coiliiot-sense-staging",
        databaseUrl = "https://coiliiot-sense-staging-default-rtdb.firebaseio.com",
        messagingSenderId = "...", // required, despite the name — Firebase rejects init without it
    ),
)

// 2. Sign in with the test account Coiliiot created for you.
//    There is no sign-up — accounts are provisioned per OEM, not self-serve.
signIn("your-test-account@example.com", "password")

// 3. Request Bluetooth/location permissions from your Activity BEFORE
//    scanning — this SDK cannot request them on your app's behalf (see
//    "Why scanForGateways() doesn't request permissions itself" below).
//    BLUETOOTH_SCAN + BLUETOOTH_CONNECT on API 31+, ACCESS_FINE_LOCATION below.

// 4. Scan for gateways in BLE range. Every RG-RW10 unit advertises the same
//    name, so if more than one is nearby, this list — updated live as each
//    is found — is the only way to tell them apart (e.g. by signal
//    strength). Stops automatically after 3s; call again to restart.
val stopScan = scanForGateways(
    onUpdate = { devices -> println("found so far: $devices") }, // List<DiscoveredGateway>
    onError = { e -> println("scan error: $e") },
    onScanEnd = { println("scan finished") },
)

// 5. Connect to the one the user picked. No WiFi credentials are sent yet.
connectToGateway("AABBCCDDEEFF")

// 6. Send WiFi credentials to the connected gateway and wait for it to
//    reach the cloud.
sendWifiCredentials("AABBCCDDEEFF", "my-wifi-ssid", "my-wifi-password") { stage ->
    println("provisioning: $stage") // WIFI_OK, OK, WIFI_FAIL, or SERVER_FAIL
}
// A WIFI_FAIL result means the connection is still open — call
// sendWifiCredentials() again with corrected credentials. A SERVER_FAIL
// result means the gateway is rebooting and the connection is gone —
// scan and connect again once it's back.

// 7. Claim the gateway for your account.
val gateway = registerGateway("AABBCCDDEEFF")

// 8. Watch for sensors under the gateway — every sensor shows up here,
//    tagged is_registered, not just unclaimed ones:
val stopListening = listenForSensors("AABBCCDDEEFF") { sensors ->
    val unclaimed = sensors.filter { !it.is_registered }
    println("sensors not yet claimed: $unclaimed")
}

// 9. Claim one.
registerSensor("AABBCCDDEEFF", "1122334455")

// 10. Read its latest value (works the same whether claimed or not).
val reading = getLatestSensorData("AABBCCDDEEFF", "1122334455")
println(reading) // LatestSensorData(last_seen=..., current_data={temperature=..., humidity=...}, rssi=..., battery=...)
```

### Undoing things

- `disconnectFromGateway(gatewayId)` — disconnect before sending credentials, if you change your mind.
- `removeGateway(gatewayId)` — releases the gateway and every sensor currently registered under it.
- `unregisterSensor(gatewayId, sensorId)` — releases a single sensor; its history is kept, not deleted.

## What this SDK does not do

No historical/aggregated data beyond the latest reading, no alerts or
notifications, no firmware OTA control, no fleet management, no access to
the hardware catalog beyond what's needed to label a sensor's own
readings. If you need any of that, talk to Coiliiot about your own
backend integration.

## Why `scanForGateways()` doesn't request permissions itself

Unlike some cross-platform SDKs, a native Android library has no clean
way to request runtime permissions on your app's behalf — only an
Activity can own that request flow and its result callback. Request
`BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` (API 31+) or `ACCESS_FINE_LOCATION`
(below API 31) from your own Activity before calling `scanForGateways()`;
it throws a clear `SecurityException` if they're missing rather than
silently finding nothing.

## Why there's no `pairSensor()`

Sensors and gateways don't know anything about ownership — a sensor just
transmits (on its own schedule, or immediately if you hold its button),
and any gateway in range relays whatever it hears. Ownership is decided
entirely by which account calls `registerSensor()`. `listenForSensors`
just reflects what's already arrived, tagged with whether anyone's
claimed it yet.

## Why gateway ids come from `scanForGateways`, not the BLE connection itself

Android's own BLE device identifier (`BluetoothDevice.address`) is a
platform-scoped MAC address — it's not the gateway's real hardware id,
and nothing else in the system ever sees it. `scanForGateways` decodes
the actual gateway id from the advertisement's manufacturer-specific
data, the same way the main Coiliiot Sense app and the React Native SDK
do, so the id you get here is the same one you'd see anywhere else — and
the one `registerGateway()` expects.
