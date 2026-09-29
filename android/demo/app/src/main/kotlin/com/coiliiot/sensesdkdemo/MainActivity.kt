package com.coiliiot.sensesdkdemo

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.coiliiot.sensesdk.DiscoveredGateway
import com.coiliiot.sensesdk.ProvisioningStage
import com.coiliiot.sensesdk.SdkSensor
import com.coiliiot.sensesdk.SenseSdk
import com.coiliiot.sensesdk.SenseSdkConfig
import com.coiliiot.sensesdk.connectToGateway
import com.coiliiot.sensesdk.disconnectFromGateway
import com.coiliiot.sensesdk.getCurrentUserId
import com.coiliiot.sensesdk.getLatestSensorData
import com.coiliiot.sensesdk.listenForSensors
import com.coiliiot.sensesdk.onAuthStateChanged
import com.coiliiot.sensesdk.registerGateway
import com.coiliiot.sensesdk.registerSensor
import com.coiliiot.sensesdk.removeGateway
import com.coiliiot.sensesdk.scanForGateways
import com.coiliiot.sensesdk.sendWifiCredentials
import com.coiliiot.sensesdk.signIn
import com.coiliiot.sensesdk.signOut
import com.coiliiot.sensesdk.unregisterSensor
import kotlinx.coroutines.launch

// Coiliiot-provided sandbox config for coiliiot-sense-staging. Not a
// secret — a Firebase Web config, meaningless without a signed-in test
// account, which is what actually gates access (see the Firestore/RTDB
// rules). Same values as the RN demo's App.tsx uses, including the same
// (iOS-registered) appId on both platforms — SenseSdk.init() creates its
// own named Firebase app instance directly from these values rather than
// registering a real native app under this demo's package name, so there
// is no platform-specific appId to switch to here; this exact
// cross-platform reuse is already proven working by the RN demo.
private val SDK_CONFIG = SenseSdkConfig(
    apiKey = "AIzaSyBHg5hFnWY6Ntr7eZ8AvZ5B1sQYazJJWQc",
    appId = "1:293291367046:ios:ed03125d577b01e8d88f07",
    projectId = "coiliiot-sense-staging",
    databaseUrl = "https://coiliiot-sense-staging-default-rtdb.firebaseio.com",
    storageBucket = "coiliiot-sense-staging.firebasestorage.app",
    messagingSenderId = "293291367046",
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SenseSdk.init(applicationContext, SDK_CONFIG)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    DemoScreen()
                }
            }
        }
    }
}

@Composable
private fun DemoScreen() {
    val scope = rememberCoroutineScope()

    var log by remember { mutableStateOf(listOf<String>()) }
    fun logLine(text: String) {
        log = (listOf(text) + log).take(50)
    }

    var signedIn by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    // scanForGateways/onAuthStateChanged both hand back an unsubscribe
    // function synchronously — this holds onto whichever one is currently
    // live so it can be called again later (stop scan, sign out cleanly).
    var stopScan by remember { mutableStateOf<(() -> Unit)?>(null) }
    var scanning by remember { mutableStateOf(false) }
    var scannedDevices by remember { mutableStateOf(listOf<DiscoveredGateway>()) }
    var connectedGatewayId by remember { mutableStateOf<String?>(null) }

    var ssid by remember { mutableStateOf("") }
    var wifiPassword by remember { mutableStateOf("") }

    var activeGatewayId by remember { mutableStateOf<String?>(null) }
    var sensors by remember { mutableStateOf(listOf<SdkSensor>()) }
    var stopListeningForSensors by remember { mutableStateOf<(() -> Unit)?>(null) }

    val blePermissions = remember {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
    }
    val requestBlePermissions = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { granted ->
        if (granted.values.all { it }) {
            startScan(
                onDevices = { scannedDevices = it },
                onStop = { stopScan = null; scanning = false },
                onError = { logLine("Scan error: ${it.message}") },
                onStart = { stop -> stopScan = stop; scanning = true },
            )
        } else {
            logLine("Bluetooth/location permissions were not granted.")
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Coiliiot Sense SDK Demo (Android)", style = MaterialTheme.typography.titleLarge)
        Text("SDK ready — coiliiot-sense-staging", style = MaterialTheme.typography.bodySmall)

        // 1. Sign in
        Section(title = "1. Sign in", done = signedIn) {
            if (!signedIn) {
                OutlinedTextField(email, { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    password,
                    { password = it },
                    label = { Text("Password") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(onClick = {
                    scope.launch {
                        try {
                            signIn(email, password)
                            signedIn = true
                            logLine("Signed in as ${getCurrentUserId()}")
                        } catch (e: Exception) {
                            logLine("Sign in failed: ${e.message}")
                        }
                    }
                }) { Text("Sign In") }
            } else {
                Button(onClick = {
                    signOut()
                    signedIn = false
                    connectedGatewayId = null
                    activeGatewayId = null
                    sensors = emptyList()
                    logLine("Signed out")
                }) { Text("Sign Out") }
            }
        }

        // 2. Scan for a gateway over BLE
        Section(title = "2. Scan for a gateway over BLE", done = connectedGatewayId != null) {
            Button(
                enabled = signedIn && !scanning,
                onClick = { requestBlePermissions.launch(blePermissions) },
            ) { Text(if (scanning) "Scanning…" else "Scan for Gateways") }

            scannedDevices.forEach { device ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text("${device.model} (${device.id})  rssi=${device.rssi}")
                    Button(onClick = {
                        stopScan?.invoke()
                        scope.launch {
                            try {
                                connectToGateway(device.id)
                                connectedGatewayId = device.id
                                logLine("Connected to ${device.id}")
                            } catch (e: Exception) {
                                logLine("Connect failed: ${e.message}")
                            }
                        }
                    }) { Text("Connect") }
                }
            }
        }

        // 3. Send WiFi credentials
        if (connectedGatewayId != null && activeGatewayId == null) {
            Section(title = "3. Send WiFi credentials", done = false) {
                OutlinedTextField(ssid, { ssid = it }, label = { Text("WiFi SSID") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    wifiPassword,
                    { wifiPassword = it },
                    label = { Text("WiFi password") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(onClick = {
                    val gatewayId = connectedGatewayId ?: return@Button
                    scope.launch {
                        try {
                            sendWifiCredentials(gatewayId, ssid, wifiPassword) { stage ->
                                when (stage) {
                                    ProvisioningStage.WIFI_OK -> logLine("Gateway connected to WiFi, reaching cloud…")
                                    ProvisioningStage.OK -> logLine("Provisioning succeeded")
                                    ProvisioningStage.WIFI_FAIL ->
                                        logLine("Wrong WiFi credentials — connection still open, try again")
                                    ProvisioningStage.SERVER_FAIL -> {
                                        logLine("Gateway couldn't reach the cloud — it's rebooting")
                                        connectedGatewayId = null
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            logLine("Send credentials failed: ${e.message}")
                        }
                    }
                }) { Text("Send Credentials") }
            }
        }

        // 4. Register the gateway to your account
        if (connectedGatewayId != null) {
            Section(title = "4. Register the gateway to your account", done = activeGatewayId != null) {
                if (activeGatewayId == null) {
                    Button(onClick = {
                        val gatewayId = connectedGatewayId ?: return@Button
                        scope.launch {
                            try {
                                val gateway = registerGateway(gatewayId)
                                activeGatewayId = gateway.gateway_id
                                logLine("Registered gateway ${gateway.gateway_id}")
                                stopListeningForSensors = listenForSensors(gateway.gateway_id) { sensors = it }
                            } catch (e: Exception) {
                                logLine("Register gateway failed: ${e.message}")
                            }
                        }
                    }) { Text("Register Gateway") }
                } else {
                    Button(onClick = {
                        val gatewayId = activeGatewayId ?: return@Button
                        scope.launch {
                            try {
                                stopListeningForSensors?.invoke()
                                stopListeningForSensors = null
                                removeGateway(gatewayId)
                                activeGatewayId = null
                                connectedGatewayId = null
                                sensors = emptyList()
                                logLine("Removed gateway $gatewayId")
                            } catch (e: Exception) {
                                logLine("Remove gateway failed: ${e.message}")
                            }
                        }
                    }) { Text("Remove Gateway") }
                }
            }
        }

        // 5. Claim a sensor
        if (activeGatewayId != null) {
            Section(title = "5. Claim a sensor", done = sensors.any { it.is_registered }) {
                sensors.forEach { sensor ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("${sensor.sensor_id} (${sensor.model ?: "unknown model"})")
                        Button(onClick = {
                            val gatewayId = activeGatewayId ?: return@Button
                            scope.launch {
                                try {
                                    if (sensor.is_registered) {
                                        unregisterSensor(gatewayId, sensor.sensor_id)
                                        logLine("Unclaimed ${sensor.sensor_id}")
                                    } else {
                                        registerSensor(gatewayId, sensor.sensor_id)
                                        logLine("Claimed ${sensor.sensor_id}")
                                    }
                                } catch (e: Exception) {
                                    logLine("Claim/unclaim failed: ${e.message}")
                                }
                            }
                        }) { Text(if (sensor.is_registered) "Unclaim" else "Claim") }
                        Button(onClick = {
                            val gatewayId = activeGatewayId ?: return@Button
                            scope.launch {
                                try {
                                    val reading = getLatestSensorData(gatewayId, sensor.sensor_id)
                                    logLine("${sensor.sensor_id}: ${reading.current_data}")
                                } catch (e: Exception) {
                                    logLine("Read failed: ${e.message}")
                                }
                            }
                        }) { Text("Read") }
                    }
                }
            }
        }

        HorizontalDivider()
        Text("Log", style = MaterialTheme.typography.titleMedium)
        LazyColumn {
            items(log) { line -> Text(line, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

private fun startScan(
    onDevices: (List<DiscoveredGateway>) -> Unit,
    onStop: () -> Unit,
    onError: (Exception) -> Unit,
    onStart: (() -> Unit) -> Unit,
) {
    val stop = scanForGateways(
        onUpdate = onDevices,
        onError = onError,
        onScanEnd = onStop,
    )
    onStart(stop)
}

@Composable
private fun Section(title: String, done: Boolean, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            if (done) Text("✓ Done")
        }
        content()
    }
}
