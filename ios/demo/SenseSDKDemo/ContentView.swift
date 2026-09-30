import CoiliiotSenseSDK
import SwiftUI

private let doneGreen = Color(red: 0.086, green: 0.639, blue: 0.290)
private let connectingAmber = Color(red: 0.706, green: 0.325, blue: 0.035)
private let errorRed = Color(red: 0.863, green: 0.149, blue: 0.149)

struct ContentView: View {
    @ObservedObject var viewModel: DemoViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Coiliiot Sense SDK Demo")
                    .font(.title2.bold())
                Text(viewModel.ready ? "SDK ready — coiliiot-sense-staging" : "Initializing…")
                    .font(.footnote)
                    .foregroundColor(.secondary)

                if !viewModel.signedIn {
                    Section(title: "1. Sign in") {
                        TextField("Email", text: $viewModel.email)
                            .textInputAutocapitalization(.never)
                            .textFieldStyle(.roundedBorder)
                        SecureField("Password", text: $viewModel.password)
                            .textFieldStyle(.roundedBorder)
                        DemoButton(
                            "Sign In",
                            enabled: viewModel.ready && !viewModel.busy,
                            loading: viewModel.busyKey == "signIn",
                            action: viewModel.signIn
                        )
                    }
                } else {
                    Section(title: "Signed in", done: true) {
                        DemoButton(
                            "Sign Out",
                            enabled: !viewModel.busy,
                            loading: viewModel.busyKey == "signOut",
                            action: viewModel.signOut
                        )
                    }

                    Section(
                        title: "2. Scan for a gateway over BLE",
                        done: viewModel.connectedGatewayId != nil || !viewModel.gatewayId.isEmpty
                    ) {
                        if viewModel.scanning {
                            DemoButton("Stop Scan", action: viewModel.stopScan)
                            HStack {
                                ProgressView().scaleEffect(0.7)
                                Text("Scanning…").font(.footnote).foregroundColor(.secondary)
                            }
                        } else {
                            DemoButton("Scan for Gateways", enabled: !viewModel.busy, action: viewModel.startScan)
                        }
                        if !viewModel.scanning && viewModel.scannedDevices.isEmpty {
                            Hint("None found.")
                        }
                        ForEach(viewModel.scannedDevices, id: \.id) { device in
                            DeviceRow(device: device, viewModel: viewModel)
                        }
                    }

                    if viewModel.connectedGatewayId != nil || !viewModel.gatewayId.isEmpty {
                        Section(
                            title: "3. Send WiFi credentials",
                            done: viewModel.connectedGatewayId == nil && !viewModel.gatewayId.isEmpty
                        ) {
                            Hint(
                                viewModel.connectedGatewayId.map { "Connected to \(abbreviateId($0))." }
                                    ?? "Credentials already sent for \(abbreviateId(viewModel.gatewayId))."
                            )
                            TextField("WiFi SSID", text: $viewModel.ssid)
                                .textFieldStyle(.roundedBorder)
                                .disabled(viewModel.connectedGatewayId == nil)
                            SecureField("WiFi password", text: $viewModel.wifiPassword)
                                .textFieldStyle(.roundedBorder)
                                .disabled(viewModel.connectedGatewayId == nil)
                            DemoButton(
                                "Send Credentials",
                                enabled: !viewModel.busy && viewModel.connectedGatewayId != nil
                                    && !viewModel.ssid.isEmpty && !viewModel.wifiPassword.isEmpty,
                                loading: viewModel.busyKey == "sendCredentials",
                                action: viewModel.sendCredentials
                            )
                        }
                    }

                    if !viewModel.gatewayId.isEmpty {
                        Section(title: "4. Register the gateway to your account", done: !viewModel.activeGatewayId.isEmpty) {
                            Hint("Gateway: \(abbreviateId(viewModel.gatewayId))")
                            if viewModel.activeGatewayId.isEmpty {
                                DemoButton(
                                    "Register Gateway",
                                    enabled: !viewModel.busy,
                                    loading: viewModel.busyKey == "registerGateway",
                                    action: viewModel.registerGateway
                                )
                            } else {
                                DemoButton(
                                    "Remove Gateway",
                                    enabled: !viewModel.busy,
                                    loading: viewModel.busyKey == "removeGateway",
                                    action: viewModel.removeGateway
                                )
                            }
                        }
                    }

                    if !viewModel.activeGatewayId.isEmpty {
                        Section(title: "5. Claim a sensor", done: !viewModel.registeredSensors.isEmpty) {
                            if viewModel.unregisteredSensors.isEmpty {
                                Hint("No unclaimed sensors seen yet.")
                            } else {
                                ForEach(viewModel.unregisteredSensors, id: \.sensor_id) { sensor in
                                    ClaimSensorRow(sensor: sensor, viewModel: viewModel)
                                }
                            }
                        }

                        Section(title: "6. Your claimed sensors") {
                            if viewModel.registeredSensors.isEmpty {
                                Hint("No sensors claimed yet.")
                            } else {
                                ForEach(viewModel.registeredSensors, id: \.sensor_id) { sensor in
                                    ClaimedSensorRow(sensor: sensor, viewModel: viewModel)
                                }
                            }
                        }
                    }
                }

                Divider()
                Section(title: "Activity log") {
                    if viewModel.logLines.isEmpty {
                        Hint("Nothing yet.")
                    } else {
                        ForEach(viewModel.logLines) { line in
                            Text(line.text)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(line.isError ? errorRed : .secondary)
                        }
                    }
                }
            }
            .padding(16)
        }
    }
}

private struct DeviceRow: View {
    let device: DiscoveredGateway
    @ObservedObject var viewModel: DemoViewModel

    var body: some View {
        let isConnected = device.id == viewModel.connectedGatewayId
        let isConnecting = viewModel.busyKey == "connect:\(device.id)"
        let isDisconnecting = viewModel.busyKey == "disconnect:\(device.id)"
        let statusColor = isConnected ? doneGreen : (isConnecting ? connectingAmber : .secondary)
        let statusLabel = isConnected ? "Connected" : (isConnecting ? "Connecting…" : "Not connected")
        let rssiText: String = device.rssi.map { String($0) } ?? "—"

        HStack(alignment: .center, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(device.model)\n\(abbreviateId(device.id)) (rssi: \(rssiText))")
                    .font(.footnote)
                Text("● \(statusLabel)")
                    .font(.caption.bold())
                    .foregroundColor(statusColor)
            }
            Spacer(minLength: 8)
            if isConnected {
                DemoButton("Disconnect", enabled: !viewModel.busy, loading: isDisconnecting) {
                    viewModel.disconnectFromDevice(device.id)
                }
            } else {
                DemoButton("Connect", enabled: !viewModel.busy && !viewModel.scanning, loading: isConnecting) {
                    viewModel.connectToDevice(device)
                }
            }
        }
    }
}

private struct ClaimSensorRow: View {
    let sensor: SdkSensor
    @ObservedObject var viewModel: DemoViewModel

    var body: some View {
        HStack(spacing: 8) {
            Text("\(abbreviateId(sensor.sensor_id)) (\(sensor.model ?? "unknown model"))")
                .font(.footnote)
            Spacer(minLength: 8)
            DemoButton("Claim", enabled: !viewModel.busy, loading: viewModel.busyKey == "claim:\(sensor.sensor_id)") {
                viewModel.claimSensor(sensor.sensor_id)
            }
        }
    }
}

private struct ClaimedSensorRow: View {
    let sensor: SdkSensor
    @ObservedObject var viewModel: DemoViewModel

    private var readingText: String? {
        guard let reading = viewModel.sensorReadings[sensor.sensor_id] else { return nil }
        let rssiText: String = reading.rssi.map { String($0) } ?? "—"
        let batteryText: String = reading.battery.map { String($0) } ?? "—"
        return "last_seen: \(reading.last_seen)\ncurrent_data: \(reading.current_data)\nrssi: \(rssiText)  battery: \(batteryText)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 8) {
                Text("\(abbreviateId(sensor.sensor_id)) (\(sensor.model ?? "unknown model"))")
                    .font(.footnote)
                Spacer(minLength: 8)
                DemoButton("Read Latest", enabled: !viewModel.busy, loading: viewModel.busyKey == "readLatest:\(sensor.sensor_id)") {
                    viewModel.readLatest(sensor.sensor_id)
                }
                DemoButton("Unclaim", enabled: !viewModel.busy, loading: viewModel.busyKey == "unclaim:\(sensor.sensor_id)") {
                    viewModel.unclaimSensor(sensor.sensor_id)
                }
            }
            if let readingText {
                Hint(readingText)
            }
        }
    }
}

private struct Section<Content: View>: View {
    let title: String
    var done: Bool = false
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title).font(.headline)
                Spacer()
                if done {
                    Text("✓ Done").font(.caption.bold()).foregroundColor(doneGreen)
                }
            }
            content
        }
        .padding(12)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(done ? doneGreen : Color.secondary.opacity(0.4), lineWidth: done ? 1.5 : 0.5)
        )
    }
}

private struct DemoButton: View {
    let title: String
    var enabled: Bool = true
    var loading: Bool = false
    let action: () -> Void

    init(_ title: String, enabled: Bool = true, loading: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.enabled = enabled
        self.loading = loading
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            if loading {
                ProgressView()
                    .tint(.white)
                    .scaleEffect(0.8)
                    .frame(minWidth: 44)
            } else {
                Text(title).fontWeight(.semibold).fixedSize()
            }
        }
        .buttonStyle(.borderedProminent)
        .disabled(!enabled || loading)
    }
}

private struct Hint: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(.caption).foregroundColor(.secondary)
    }
}
