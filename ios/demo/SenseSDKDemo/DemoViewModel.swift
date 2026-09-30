import CoiliiotSenseSDK
import Foundation

// Coiliiot-provided sandbox config for coiliiot-sense-staging. Not a
// secret — a Firebase Web config, meaningless without a signed-in test
// account, which is what actually gates access (see the Firestore/RTDB
// rules). Same values as the RN/Android demos use, including the same
// (iOS-registered) appId — SenseSdk.initSdk() creates its own named
// Firebase app instance directly from these values rather than
// registering a real native app under this demo's bundle ID, so there's
// nothing platform-specific to switch to here even though this happens
// to be the actual iOS-registered appId; this cross-platform reuse is
// already proven working by the other two demos.
private let sdkConfig = SenseSdkConfig(
    apiKey: "AIzaSyBHg5hFnWY6Ntr7eZ8AvZ5B1sQYazJJWQc",
    appId: "1:293291367046:ios:ed03125d577b01e8d88f07",
    projectId: "coiliiot-sense-staging",
    databaseURL: "https://coiliiot-sense-staging-default-rtdb.firebaseio.com",
    storageBucket: "coiliiot-sense-staging.firebasestorage.app",
    messagingSenderId: "293291367046"
)

struct LogEntry: Identifiable {
    let id = UUID()
    let text: String
    let isError: Bool
}

// IDs are 20+ characters — nobody needs to read the whole thing to tell
// devices apart in this demo. Same as the other two demos' abbreviateId.
func abbreviateId(_ id: String) -> String {
    id.count > 8 ? String(id.prefix(8)) : id
}

/// Holds everything the UI reads/drives. @MainActor because CoreBluetooth/
/// Firebase's callback-based APIs deliver on arbitrary queues/contexts —
/// every callback below explicitly hops back to the main actor before
/// touching @Published state, rather than assuming it's already there.
@MainActor
final class DemoViewModel: ObservableObject {
    @Published var ready = false
    @Published var signedIn = false

    // Identifies which single action is currently in flight, e.g. "signIn"
    // or "claim:<sensorId>" — drives that one button's spinner while still
    // disabling every button globally to keep actions serialized. Same
    // pattern as the other two demos' busyKey/runStep.
    @Published var busyKey: String?
    var busy: Bool { busyKey != nil }

    @Published var email = ""
    @Published var password = ""
    @Published var ssid = ""
    @Published var wifiPassword = ""

    // Known once connected/provisioned; never hand-typed.
    @Published var gatewayId = ""
    @Published var activeGatewayId = ""

    @Published var allSensors: [SdkSensor] = []
    var unregisteredSensors: [SdkSensor] { allSensors.filter { !$0.is_registered } }
    var registeredSensors: [SdkSensor] { allSensors.filter { $0.is_registered } }
    @Published var sensorReadings: [String: LatestSensorData] = [:]

    // Scanning is its own live, restartable thing, independent of `busy` —
    // it's not "the app doing work you must wait for", it's an ongoing
    // state the user watches and can stop/restart at any point.
    @Published var scanning = false
    @Published var scannedDevices: [DiscoveredGateway] = []
    private var stopScanFn: (() -> Void)?

    // Connecting is separate from sending credentials — the WiFi form only
    // appears once this is set, i.e. once a BLE connection actually exists.
    @Published var connectedGatewayId: String?

    private var stopListeningForSensors: (() -> Void)?
    private var stopListeningForGateways: (() -> Void)?

    @Published var logLines: [LogEntry] = []
    private func log(_ text: String, isError: Bool = false) {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        let stamp = formatter.string(from: Date())
        logLines.insert(LogEntry(text: "\(stamp)  \(text)", isError: isError), at: 0)
        if logLines.count > 50 {
            logLines.removeLast(logLines.count - 50)
        }
    }

    init() {
        SenseSdk.initSdk(config: sdkConfig)
        ready = true
        log("SDK initialized against coiliiot-sense-staging")
    }

    private func runStep(_ key: String, action: @escaping () async throws -> Void) {
        busyKey = key
        Task {
            do {
                try await action()
            } catch {
                log("Error: \(error.localizedDescription)", isError: true)
            }
            busyKey = nil
        }
    }

    func reportPermissionDenied() {
        log("Bluetooth/location permissions were not granted.", isError: true)
    }

    func startScan() {
        stopScanFn?()
        scannedDevices = []
        scanning = true
        stopScanFn = CoiliiotSenseSDK.scanForGateways(
            onUpdate: { [weak self] devices in
                Task { @MainActor in self?.scannedDevices = devices }
            },
            onError: { [weak self] error in
                Task { @MainActor in self?.log("Scan error: \(error.localizedDescription)", isError: true) }
            },
            onEnd: { [weak self] in
                Task { @MainActor in self?.scanning = false }
            }
        )
    }

    func stopScan() {
        stopScanFn?()
        stopScanFn = nil
    }

    func signIn() {
        runStep("signIn") { [weak self] in
            guard let self else { return }
            let user = try await CoiliiotSenseSDK.signIn(email: self.email, password: self.password)
            self.signedIn = true
            self.log("Signed in as \(user.email ?? "unknown")")

            // Nothing else in the SDK remembers what this user already
            // registered — without this, every sign-in (including the
            // very next one after the first successful run) would show a
            // blank slate, forcing the whole scan/connect/provision/
            // register dance again for a gateway that's already claimed.
            // Only adopts a restored gateway if nothing is already active
            // locally, so this doesn't clobber a provisioning flow
            // already in progress in this same session.
            self.stopListeningForGateways = try CoiliiotSenseSDK.listenForGateways { [weak self] gateways in
                Task { @MainActor in
                    guard let self else { return }
                    guard let gateway = gateways.first, self.activeGatewayId.isEmpty else { return }
                    self.activeGatewayId = gateway.gateway_id
                    self.gatewayId = gateway.gateway_id
                    self.log("Restored previously registered gateway \(abbreviateId(gateway.gateway_id))")
                    self.stopListeningForSensors?()
                    self.stopListeningForSensors = try? CoiliiotSenseSDK.listenForSensors(gateway.gateway_id) { [weak self] sensors in
                        Task { @MainActor in self?.allSensors = sensors }
                    }
                }
            }
        }
    }

    func signOut() {
        runStep("signOut") { [weak self] in
            guard let self else { return }
            try CoiliiotSenseSDK.signOut()
            self.stopListeningForGateways?()
            self.stopListeningForGateways = nil
            self.stopListeningForSensors?()
            self.stopListeningForSensors = nil
            self.signedIn = false
            self.connectedGatewayId = nil
            self.gatewayId = ""
            self.activeGatewayId = ""
            self.allSensors = []
            self.sensorReadings = [:]
            self.log("Signed out")
        }
    }

    func connectToDevice(_ device: DiscoveredGateway) {
        runStep("connect:\(device.id)") { [weak self] in
            guard let self else { return }
            self.stopScan()
            try await CoiliiotSenseSDK.connectToGateway(device.id)
            self.connectedGatewayId = device.id
            self.log("Connected to gateway \(abbreviateId(device.id)) — enter WiFi credentials to continue.")
        }
    }

    func disconnectFromDevice(_ deviceId: String) {
        runStep("disconnect:\(deviceId)") { [weak self] in
            guard let self else { return }
            CoiliiotSenseSDK.disconnectFromGateway(deviceId)
            self.connectedGatewayId = nil
            // Gone from the list — reconnecting means scanning again,
            // since we no longer know this is still in range.
            self.scannedDevices.removeAll { $0.id == deviceId }
            self.log("Disconnected from gateway \(abbreviateId(deviceId))")
        }
    }

    func sendCredentials() {
        runStep("sendCredentials") { [weak self] in
            guard let self, let gatewayBeingProvisioned = self.connectedGatewayId else { return }
            try await CoiliiotSenseSDK.sendWifiCredentials(
                gatewayBeingProvisioned,
                ssid: self.ssid,
                password: self.wifiPassword,
                onProgress: { [weak self] stage in
                    Task { @MainActor in
                        guard let self else { return }
                        self.log("Provisioning: \(stage)")
                        if stage == .ok || stage == .serverFail {
                            // The BLE connection is gone either way — ok
                            // means the gateway deinitializes BLE after
                            // success, serverFail means it's rebooting.
                            // Either way the scan entry is now stale.
                            self.scannedDevices.removeAll { $0.id == gatewayBeingProvisioned }
                        }
                        if stage == .serverFail {
                            self.connectedGatewayId = nil
                        }
                    }
                }
            )
            self.log("Gateway \(abbreviateId(gatewayBeingProvisioned)) provisioned and reached the cloud")
            self.gatewayId = gatewayBeingProvisioned
            self.connectedGatewayId = nil // done — hide the WiFi form's editable state again
            // On a .wifiFail rejection, runStep's catch logs the error and
            // we deliberately don't clear connectedGatewayId here — the
            // connection stays open on the gateway's side, so the form
            // stays visible to retry with corrected credentials, same as
            // the main app.
        }
    }

    func registerGateway() {
        runStep("registerGateway") { [weak self] in
            guard let self else { return }
            let gateway = try await CoiliiotSenseSDK.registerGateway(self.gatewayId)
            self.activeGatewayId = gateway.gateway_id
            self.log("Gateway \(abbreviateId(gateway.gateway_id)) registered (model \(gateway.model))")
            self.stopListeningForSensors = try CoiliiotSenseSDK.listenForSensors(gateway.gateway_id) { [weak self] sensors in
                Task { @MainActor in self?.allSensors = sensors }
            }
        }
    }

    func removeGateway() {
        runStep("removeGateway") { [weak self] in
            guard let self else { return }
            self.stopListeningForSensors?()
            self.stopListeningForSensors = nil
            try await CoiliiotSenseSDK.removeGateway(self.activeGatewayId)
            self.log("Gateway \(abbreviateId(self.activeGatewayId)) removed")
            self.activeGatewayId = ""
            self.gatewayId = ""
            self.allSensors = []
            self.sensorReadings = [:]
        }
    }

    func claimSensor(_ sensorId: String) {
        runStep("claim:\(sensorId)") { [weak self] in
            guard let self else { return }
            try await CoiliiotSenseSDK.registerSensor(gatewayId: self.activeGatewayId, sensorId: sensorId)
            self.log("Sensor \(abbreviateId(sensorId)) claimed")
        }
    }

    func unclaimSensor(_ sensorId: String) {
        runStep("unclaim:\(sensorId)") { [weak self] in
            guard let self else { return }
            try await CoiliiotSenseSDK.unregisterSensor(gatewayId: self.activeGatewayId, sensorId: sensorId)
            self.log("Sensor \(abbreviateId(sensorId)) unclaimed")
            self.sensorReadings.removeValue(forKey: sensorId)
        }
    }

    func readLatest(_ sensorId: String) {
        runStep("readLatest:\(sensorId)") { [weak self] in
            guard let self else { return }
            let data = try await CoiliiotSenseSDK.getLatestSensorData(gatewayId: self.activeGatewayId, sensorId: sensorId)
            self.sensorReadings[sensorId] = data
            self.log("Latest reading for \(abbreviateId(sensorId)): \(data.current_data)")
        }
    }
}
