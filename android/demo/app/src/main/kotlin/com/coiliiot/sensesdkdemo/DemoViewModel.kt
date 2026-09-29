package com.coiliiot.sensesdkdemo

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.coiliiot.sensesdk.DiscoveredGateway
import com.coiliiot.sensesdk.LatestSensorData
import com.coiliiot.sensesdk.ProvisioningStage
import com.coiliiot.sensesdk.SdkSensor
import com.coiliiot.sensesdk.SenseSdk
import com.coiliiot.sensesdk.SenseSdkConfig
import com.coiliiot.sensesdk.connectToGateway
import com.coiliiot.sensesdk.disconnectFromGateway
import com.coiliiot.sensesdk.getLatestSensorData
import com.coiliiot.sensesdk.listenForGateways
import com.coiliiot.sensesdk.listenForSensors
import com.coiliiot.sensesdk.registerSensor
import com.coiliiot.sensesdk.scanForGateways
import com.coiliiot.sensesdk.sendWifiCredentials
import com.coiliiot.sensesdk.unregisterSensor
// Aliased: this ViewModel has its own same-named/same-arity wrapper
// methods (signIn(), signOut(), registerGateway(), removeGateway()) for
// the UI to call — without the alias, calling the SDK function from
// inside its own same-named wrapper would recurse into the wrapper
// itself instead, since Kotlin resolves a member function ahead of an
// imported top-level one when both match the call.
import com.coiliiot.sensesdk.registerGateway as sdkRegisterGateway
import com.coiliiot.sensesdk.removeGateway as sdkRemoveGateway
import com.coiliiot.sensesdk.signIn as sdkSignIn
import com.coiliiot.sensesdk.signOut as sdkSignOut
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.launch

// Coiliiot-provided sandbox config for coiliiot-sense-staging. Not a
// secret — a Firebase Web config, meaningless without a signed-in test
// account, which is what actually gates access (see the Firestore/RTDB
// rules). Same values as the RN demo's App.tsx uses, including the same
// (iOS-registered) appId on both platforms — SenseSdk.init() creates its
// own named Firebase app instance directly from these values rather than
// registering a real native app under this demo's package name, so there
// is no platform-specific appId to switch to here; this cross-platform
// reuse is already proven working by the RN demo.
private val SDK_CONFIG = SenseSdkConfig(
    apiKey = "AIzaSyBHg5hFnWY6Ntr7eZ8AvZ5B1sQYazJJWQc",
    appId = "1:293291367046:ios:ed03125d577b01e8d88f07",
    projectId = "coiliiot-sense-staging",
    databaseUrl = "https://coiliiot-sense-staging-default-rtdb.firebaseio.com",
    storageBucket = "coiliiot-sense-staging.firebasestorage.app",
    messagingSenderId = "293291367046",
)

data class LogEntry(val text: String, val isError: Boolean)

// IDs are 20+ characters — nobody needs to read the whole thing to tell
// devices apart in this demo. Same as the RN demo's abbreviateId.
fun abbreviateId(id: String): String = if (id.length > 8) id.substring(0, 8) else id

/**
 * Holds everything the UI reads/drives, surviving configuration changes
 * (rotation, multi-window resize, etc.) the way plain remember{} in
 * MainActivity did not. This does NOT and cannot survive the process
 * being killed outright (e.g. the OS reclaiming memory while the app is
 * backgrounded for a while) — a live BLE/GATT connection is gone the
 * moment the process dies regardless of what holds the UI state, so a
 * fresh scan/connect is genuinely required after that, same as the RN
 * app would need after an RN process restart. What this fixes is the far
 * more common case of state resetting on ordinary recreation.
 */
class DemoViewModel(application: Application) : AndroidViewModel(application) {

    var ready by mutableStateOf(false); private set
    var signedIn by mutableStateOf(false); private set

    // Identifies which single action is currently in flight, e.g. "signIn"
    // or "claim:<sensorId>" — drives that one button's spinner while still
    // disabling every button globally to keep actions serialized. Same
    // pattern as the RN demo's busyKey/runStep.
    var busyKey by mutableStateOf<String?>(null); private set
    val busy: Boolean get() = busyKey != null

    var email by mutableStateOf(""); private set
    var password by mutableStateOf(""); private set

    var ssid by mutableStateOf(""); private set
    var wifiPassword by mutableStateOf(""); private set

    // Known once connected/provisioned; never hand-typed.
    var gatewayId by mutableStateOf(""); private set
    var activeGatewayId by mutableStateOf(""); private set

    var allSensors by mutableStateOf(listOf<SdkSensor>()); private set
    val unregisteredSensors get() = allSensors.filter { !it.is_registered }
    val registeredSensors get() = allSensors.filter { it.is_registered }
    var sensorReadings by mutableStateOf(mapOf<String, LatestSensorData>()); private set

    // Scanning is its own live, restartable thing, independent of `busy` —
    // it's not "the app doing work you must wait for", it's an ongoing
    // state the user watches and can stop/restart at any point.
    var scanning by mutableStateOf(false); private set
    var scannedDevices by mutableStateOf(listOf<DiscoveredGateway>()); private set
    private var stopScanFn: (() -> Unit)? = null

    // Connecting is separate from sending credentials — the WiFi form only
    // appears once this is set, i.e. once a BLE connection actually exists.
    var connectedGatewayId by mutableStateOf<String?>(null); private set

    private var stopListeningForSensors: (() -> Unit)? = null
    private var stopListeningForGateways: (() -> Unit)? = null

    var logLines by mutableStateOf(listOf<LogEntry>()); private set
    private fun log(text: String, isError: Boolean = false) {
        val stamp = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
        logLines = (listOf(LogEntry("$stamp  $text", isError)) + logLines).take(50)
    }

    init {
        SenseSdk.init(application.applicationContext, SDK_CONFIG)
        ready = true
        log("SDK initialized against coiliiot-sense-staging")
    }

    private fun runStep(key: String, action: suspend () -> Unit) {
        busyKey = key
        viewModelScope.launch {
            try {
                action()
            } catch (e: Exception) {
                log("Error: ${e.message ?: e.toString()}", isError = true)
            } finally {
                busyKey = null
            }
        }
    }

    fun updateEmail(value: String) { email = value }
    fun updatePassword(value: String) { password = value }
    fun updateSsid(value: String) { ssid = value }
    fun updateWifiPassword(value: String) { wifiPassword = value }

    fun reportPermissionDenied() {
        log("Bluetooth/location permissions were not granted.", isError = true)
    }

    fun startScan() {
        stopScanFn?.invoke()
        scannedDevices = emptyList()
        scanning = true
        stopScanFn = scanForGateways(
            onUpdate = { devices -> scannedDevices = devices },
            onError = { e -> log("Scan error: ${e.message}", isError = true) },
            onScanEnd = { scanning = false },
        )
    }

    fun stopScan() {
        stopScanFn?.invoke()
        stopScanFn = null
    }

    fun signIn() = runStep("signIn") {
        val user = sdkSignIn(email, password)
        signedIn = true
        log("Signed in as ${user.email}")

        // Nothing else in the SDK remembers what this user already
        // registered — without this, every sign-in (including the very
        // next one after the first successful run) would show a totally
        // blank slate, forcing the whole scan/connect/provision/register
        // dance again for a gateway that's already claimed. Only adopts a
        // restored gateway if nothing is already active locally, so this
        // doesn't clobber a provisioning flow already in progress in this
        // same session.
        stopListeningForGateways = listenForGateways { gateways ->
            val gateway = gateways.firstOrNull() ?: return@listenForGateways
            if (activeGatewayId.isNotEmpty()) return@listenForGateways

            activeGatewayId = gateway.gateway_id
            gatewayId = gateway.gateway_id
            log("Restored previously registered gateway ${abbreviateId(gateway.gateway_id)}")
            stopListeningForSensors?.invoke()
            stopListeningForSensors = listenForSensors(gateway.gateway_id) { sensors -> allSensors = sensors }
        }
    }

    fun signOut() = runStep("signOut") {
        sdkSignOut()
        stopListeningForGateways?.invoke()
        stopListeningForGateways = null
        stopListeningForSensors?.invoke()
        stopListeningForSensors = null
        signedIn = false
        connectedGatewayId = null
        gatewayId = ""
        activeGatewayId = ""
        allSensors = emptyList()
        sensorReadings = emptyMap()
        log("Signed out")
    }

    fun connectToDevice(device: DiscoveredGateway) = runStep("connect:${device.id}") {
        stopScan()
        connectToGateway(device.id)
        connectedGatewayId = device.id
        log("Connected to gateway ${abbreviateId(device.id)} — enter WiFi credentials to continue.")
    }

    fun disconnectFromDevice(deviceId: String) = runStep("disconnect:$deviceId") {
        disconnectFromGateway(deviceId)
        connectedGatewayId = null
        // Gone from the list — reconnecting means scanning again, since we
        // no longer know this is still in range.
        scannedDevices = scannedDevices.filter { it.id != deviceId }
        log("Disconnected from gateway ${abbreviateId(deviceId)}")
    }

    fun sendCredentials() = runStep("sendCredentials") {
        val gatewayBeingProvisioned = connectedGatewayId ?: return@runStep
        sendWifiCredentials(gatewayBeingProvisioned, ssid, wifiPassword) { stage ->
            log("Provisioning: $stage")
            if (stage == ProvisioningStage.OK || stage == ProvisioningStage.SERVER_FAIL) {
                // The BLE connection is gone either way — OK means the
                // gateway deinitializes BLE after success, SERVER_FAIL
                // means it's rebooting. Either way the scan entry is now
                // stale.
                scannedDevices = scannedDevices.filter { it.id != gatewayBeingProvisioned }
            }
            if (stage == ProvisioningStage.SERVER_FAIL) {
                connectedGatewayId = null
            }
        }
        log("Gateway ${abbreviateId(gatewayBeingProvisioned)} provisioned and reached the cloud")
        gatewayId = gatewayBeingProvisioned
        connectedGatewayId = null // done — hide the WiFi form's editable state again
        // On a WIFI_FAIL rejection, runStep's catch logs the error and we
        // deliberately don't clear connectedGatewayId here — the
        // connection stays open on the gateway's side, so the form stays
        // visible to retry with corrected credentials, same as the main
        // app.
    }

    fun registerGateway() = runStep("registerGateway") {
        val gateway = sdkRegisterGateway(gatewayId)
        activeGatewayId = gateway.gateway_id
        log("Gateway ${abbreviateId(gateway.gateway_id)} registered (model ${gateway.model})")
        stopListeningForSensors = listenForSensors(gateway.gateway_id) { sensors -> allSensors = sensors }
    }

    fun removeGateway() = runStep("removeGateway") {
        stopListeningForSensors?.invoke()
        stopListeningForSensors = null
        sdkRemoveGateway(activeGatewayId)
        log("Gateway ${abbreviateId(activeGatewayId)} removed")
        activeGatewayId = ""
        gatewayId = ""
        allSensors = emptyList()
        sensorReadings = emptyMap()
    }

    fun claimSensor(sensorId: String) = runStep("claim:$sensorId") {
        registerSensor(activeGatewayId, sensorId)
        log("Sensor ${abbreviateId(sensorId)} claimed")
    }

    fun unclaimSensor(sensorId: String) = runStep("unclaim:$sensorId") {
        unregisterSensor(activeGatewayId, sensorId)
        log("Sensor ${abbreviateId(sensorId)} unclaimed")
        sensorReadings = sensorReadings - sensorId
    }

    fun readLatest(sensorId: String) = runStep("readLatest:$sensorId") {
        val data = getLatestSensorData(activeGatewayId, sensorId)
        sensorReadings = sensorReadings + (sensorId to data)
        log("Latest reading for ${abbreviateId(sensorId)}: ${data.current_data}")
    }

    override fun onCleared() {
        stopScanFn?.invoke()
        stopListeningForSensors?.invoke()
        stopListeningForGateways?.invoke()
    }
}
