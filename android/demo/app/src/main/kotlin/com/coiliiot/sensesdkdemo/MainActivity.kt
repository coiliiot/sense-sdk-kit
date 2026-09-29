package com.coiliiot.sensesdkdemo

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.coiliiot.sensesdk.DiscoveredGateway
import com.coiliiot.sensesdk.SdkSensor

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val darkTheme = isSystemInDarkTheme()
            MaterialTheme(
                colorScheme = if (darkTheme) darkColorScheme() else lightColorScheme(),
            ) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val viewModel: DemoViewModel = viewModel()
                    DemoScreen(viewModel)
                }
            }
        }
    }
}

private val DoneGreen = Color(0xFF16A34A)
private val ConnectingAmber = Color(0xFFB45309)
private val ErrorRed = Color(0xFFDC2626)

@Composable
private fun DemoScreen(vm: DemoViewModel) {
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
        if (granted.values.all { it }) vm.startScan() else vm.reportPermissionDenied()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Coiliiot Sense SDK Demo", fontSize = 20.sp, fontWeight = FontWeight.Bold)
        Text(
            if (vm.ready) "SDK ready — coiliiot-sense-staging" else "Initializing…",
            style = MaterialTheme.typography.bodySmall,
        )

        if (!vm.signedIn) {
            Section(title = "1. Sign in") {
                OutlinedTextField(
                    vm.email,
                    vm::updateEmail,
                    label = { Text("Email") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    vm.password,
                    vm::updatePassword,
                    label = { Text("Password") },
                    modifier = Modifier.fillMaxWidth(),
                )
                DemoButton(
                    "Sign In",
                    onClick = vm::signIn,
                    enabled = vm.ready && !vm.busy,
                    loading = vm.busyKey == "signIn",
                )
            }
        } else {
            Section(title = "Signed in", done = true) {
                DemoButton("Sign Out", onClick = vm::signOut, enabled = !vm.busy, loading = vm.busyKey == "signOut")
            }

            Section(
                title = "2. Scan for a gateway over BLE",
                done = vm.connectedGatewayId != null || vm.gatewayId.isNotEmpty(),
            ) {
                if (vm.scanning) {
                    DemoButton("Stop Scan", onClick = vm::stopScan)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(
                            modifier = Modifier.padding(end = 8.dp).size(14.dp),
                            strokeWidth = 2.dp,
                        )
                        Hint("Scanning…")
                    }
                } else {
                    DemoButton(
                        "Scan for Gateways",
                        onClick = { requestBlePermissions.launch(blePermissions) },
                        enabled = !vm.busy,
                    )
                }
                if (!vm.scanning && vm.scannedDevices.isEmpty()) {
                    Hint("None found.")
                }
                vm.scannedDevices.forEach { device ->
                    DeviceRow(device, vm)
                }
            }

            if (vm.connectedGatewayId != null || vm.gatewayId.isNotEmpty()) {
                Section(
                    title = "3. Send WiFi credentials",
                    done = vm.connectedGatewayId == null && vm.gatewayId.isNotEmpty(),
                ) {
                    Hint(
                        vm.connectedGatewayId?.let { "Connected to ${abbreviateId(it)}." }
                            ?: "Credentials already sent for ${abbreviateId(vm.gatewayId)}.",
                    )
                    OutlinedTextField(
                        vm.ssid,
                        vm::updateSsid,
                        label = { Text("WiFi SSID") },
                        enabled = vm.connectedGatewayId != null,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        vm.wifiPassword,
                        vm::updateWifiPassword,
                        label = { Text("WiFi password") },
                        enabled = vm.connectedGatewayId != null,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    DemoButton(
                        "Send Credentials",
                        onClick = vm::sendCredentials,
                        enabled = !vm.busy && vm.connectedGatewayId != null && vm.ssid.isNotEmpty() && vm.wifiPassword.isNotEmpty(),
                        loading = vm.busyKey == "sendCredentials",
                    )
                }
            }

            if (vm.gatewayId.isNotEmpty()) {
                Section(title = "4. Register the gateway to your account", done = vm.activeGatewayId.isNotEmpty()) {
                    Hint("Gateway: ${abbreviateId(vm.gatewayId)}")
                    if (vm.activeGatewayId.isNotEmpty()) {
                        DemoButton(
                            "Remove Gateway",
                            onClick = vm::removeGateway,
                            enabled = !vm.busy,
                            loading = vm.busyKey == "removeGateway",
                        )
                    } else {
                        DemoButton(
                            "Register Gateway",
                            onClick = vm::registerGateway,
                            enabled = !vm.busy,
                            loading = vm.busyKey == "registerGateway",
                        )
                    }
                }
            }

            if (vm.activeGatewayId.isNotEmpty()) {
                Section(title = "5. Claim a sensor", done = vm.registeredSensors.isNotEmpty()) {
                    if (vm.unregisteredSensors.isEmpty()) {
                        Hint("No unclaimed sensors seen yet.")
                    } else {
                        vm.unregisteredSensors.forEach { sensor -> ClaimSensorRow(sensor, vm) }
                    }
                }

                Section(title = "6. Your claimed sensors") {
                    if (vm.registeredSensors.isEmpty()) {
                        Hint("No sensors claimed yet.")
                    } else {
                        vm.registeredSensors.forEach { sensor -> ClaimedSensorRow(sensor, vm) }
                    }
                }
            }
        }

        HorizontalDivider()
        Section(title = "Activity log") {
            if (vm.logLines.isEmpty()) {
                Hint("Nothing yet.")
            } else {
                vm.logLines.forEach { line ->
                    Text(
                        line.text,
                        fontSize = 11.sp,
                        color = if (line.isError) ErrorRed else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun DeviceRow(device: DiscoveredGateway, vm: DemoViewModel) {
    val isConnected = device.id == vm.connectedGatewayId
    val isConnecting = vm.busyKey == "connect:${device.id}"
    val isDisconnecting = vm.busyKey == "disconnect:${device.id}"
    val statusColor = when {
        isConnected -> DoneGreen
        isConnecting -> ConnectingAmber
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val statusLabel = when {
        isConnected -> "Connected"
        isConnecting -> "Connecting…"
        else -> "Not connected"
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text("${device.model}\n${abbreviateId(device.id)} (rssi: ${device.rssi ?: "—"})", fontSize = 13.sp)
            Text("● $statusLabel", fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = statusColor)
        }
        if (isConnected) {
            DemoButton(
                "Disconnect",
                onClick = { vm.disconnectFromDevice(device.id) },
                enabled = !vm.busy,
                loading = isDisconnecting,
            )
        } else {
            DemoButton(
                "Connect",
                onClick = { vm.connectToDevice(device) },
                enabled = !vm.busy && !vm.scanning,
                loading = isConnecting,
            )
        }
    }
}

@Composable
private fun ClaimSensorRow(sensor: SdkSensor, vm: DemoViewModel) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            "${abbreviateId(sensor.sensor_id)} (${sensor.model ?: "unknown model"})",
            fontSize = 13.sp,
            modifier = Modifier.weight(1f),
        )
        DemoButton(
            "Claim",
            onClick = { vm.claimSensor(sensor.sensor_id) },
            enabled = !vm.busy,
            loading = vm.busyKey == "claim:${sensor.sensor_id}",
        )
    }
}

@Composable
private fun ClaimedSensorRow(sensor: SdkSensor, vm: DemoViewModel) {
    val reading = vm.sensorReadings[sensor.sensor_id]
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                "${abbreviateId(sensor.sensor_id)} (${sensor.model ?: "unknown model"})",
                fontSize = 13.sp,
                modifier = Modifier.weight(1f),
            )
            DemoButton(
                "Read Latest",
                onClick = { vm.readLatest(sensor.sensor_id) },
                enabled = !vm.busy,
                loading = vm.busyKey == "readLatest:${sensor.sensor_id}",
            )
            DemoButton(
                "Unclaim",
                onClick = { vm.unclaimSensor(sensor.sensor_id) },
                enabled = !vm.busy,
                loading = vm.busyKey == "unclaim:${sensor.sensor_id}",
            )
        }
        if (reading != null) {
            Hint(
                "last_seen: ${reading.last_seen}\n" +
                    "current_data: ${reading.current_data}\n" +
                    "rssi: ${reading.rssi ?: "—"}  battery: ${reading.battery ?: "—"}",
            )
        }
    }
}

@Composable
private fun Section(title: String, done: Boolean = false, content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                Modifier.border(
                    width = if (done) 1.5.dp else 0.5.dp,
                    color = if (done) DoneGreen else MaterialTheme.colorScheme.outline,
                    shape = RoundedCornerShape(8.dp),
                ),
            )
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(title, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
            if (done) Text("✓ Done", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = DoneGreen)
        }
        content()
    }
}

@Composable
private fun DemoButton(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2563EB)),
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.padding(2.dp).size(16.dp),
                color = Color.White,
                strokeWidth = 2.dp,
            )
        } else {
            Text(text, color = Color.White, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun Hint(text: String) {
    Text(text, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
