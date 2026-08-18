/**
 * Coiliiot Sense SDK demo.
 *
 * Walks through the whole SDK surface in order: sign in, scan for a
 * gateway over BLE, connect, send WiFi credentials, register it to your
 * account, claim sensors it hears over RF, then read/unclaim them. See
 * README.md for setup.
 *
 * @format
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  initSdk,
  signIn,
  signOut,
  scanForGateways,
  connectToGateway,
  disconnectFromGateway,
  sendWifiCredentials,
  registerGateway,
  removeGateway,
  listenForSensors,
  registerSensor,
  unregisterSensor,
  getLatestSensorData,
  ProvisioningStage,
  DiscoveredGateway,
  SdkSensor,
  LatestSensorData,
} from '@coiliiot/sense-sdk';

// Coiliiot-provided sandbox config for coiliiot-sense-staging. This is not
// a secret — it's a Firebase Web config, meaningless without a signed-in
// test account, which is what actually gates access (see the rules).
const SDK_CONFIG = {
  apiKey: 'AIzaSyBHg5hFnWY6Ntr7eZ8AvZ5B1sQYazJJWQc',
  appId: '1:293291367046:ios:ed03125d577b01e8d88f07',
  projectId: 'coiliiot-sense-staging',
  databaseURL: 'https://coiliiot-sense-staging-default-rtdb.firebaseio.com',
  storageBucket: 'coiliiot-sense-staging.firebasestorage.app',
  messagingSenderId: '293291367046',
};

// IDs are 20+ characters — nobody needs to read the whole thing to tell
// devices apart in this demo.
const abbreviateId = (id: string): string =>
  id.length > 8 ? id.substring(0, 8) : id;

// Applied to every log line so error messages (which come straight from the
// SDK and may embed a full, unabbreviated id) stay consistent with
// everything else on screen, without needing to special-case every place an
// error could mention one.
const abbreviateIdsInText = (text: string): string =>
  text.replace(/\b[0-9A-Za-z]{9,}\b/g, match => abbreviateId(match));

type Theme = {
  background: string;
  text: string;
  subtext: string;
  border: string;
  placeholder: string;
  errorText: string;
  doneText: string;
  connectingText: string;
};

const LIGHT_THEME: Theme = {
  background: '#ffffff',
  text: '#111111',
  subtext: '#666666',
  border: '#999999',
  placeholder: '#999999',
  errorText: '#dc2626',
  doneText: '#16a34a',
  connectingText: '#b45309',
};

const DARK_THEME: Theme = {
  background: '#0f0f0f',
  text: '#f2f2f2',
  subtext: '#a5a5a5',
  border: '#4a4a4a',
  placeholder: '#8a8a8a',
  errorText: '#f87171',
  doneText: '#4ade80',
  connectingText: '#fbbf24',
};

const useTheme = (): Theme =>
  useColorScheme() === 'dark' ? DARK_THEME : LIGHT_THEME;

interface LogEntry {
  text: string;
  isError: boolean;
}

function useLog() {
  const [lines, setLines] = useState<LogEntry[]>([]);
  const log = useCallback((line: string, isError = false) => {
    const stamp = new Date().toLocaleTimeString();
    setLines(prev =>
      [
        { text: `${stamp}  ${abbreviateIdsInText(line)}`, isError },
        ...prev,
      ].slice(0, 50),
    );
  }, []);
  return { lines, log };
}

function Section({
  title,
  done,
  children,
}: {
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.section,
        { borderColor: done ? theme.doneText : theme.border },
        done && styles.sectionDoneBorder,
      ]}
    >
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {title}
        </Text>
        {done ? (
          <Text style={[styles.doneBadge, { color: theme.doneText }]}>
            ✓ Done
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Button({
  title,
  onPress,
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Text style={[styles.hint, { color: theme.subtext }]}>{children}</Text>
  );
}

function ThemedInput(props: React.ComponentProps<typeof TextInput>) {
  const theme = useTheme();
  return (
    <TextInput
      {...props}
      placeholderTextColor={theme.placeholder}
      style={[
        styles.input,
        { color: theme.text, borderColor: theme.border },
        props.editable === false && styles.inputDisabled,
        props.style,
      ]}
    />
  );
}

function App() {
  const theme = useTheme();
  const { lines, log } = useLog();

  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  // Identifies which single action is currently in flight, e.g.
  // 'signIn' or 'claim:<sensorId>' — drives that one button's spinner while
  // still disabling every button globally to keep actions serialized.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey !== null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [ssid, setSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');

  const [gatewayId, setGatewayId] = useState(''); // known once connected/provisioned; never hand-typed
  const [activeGatewayId, setActiveGatewayId] = useState('');

  const [allSensors, setAllSensors] = useState<SdkSensor[]>([]);
  const unregisteredSensors = allSensors.filter(s => !s.is_registered);
  const registeredSensors = allSensors.filter(s => s.is_registered);
  const [sensorReadings, setSensorReadings] = useState<
    Record<string, LatestSensorData>
  >({});

  // Scanning is its own live, restartable thing, independent of `busy` —
  // it's not "the app doing work you must wait for", it's an ongoing state
  // the user watches and can stop/restart at any point. It also auto-stops
  // after 3s on its own (onScanEnd), which is why `scanning` isn't just set
  // by the button handlers.
  const [scanning, setScanning] = useState(false);
  const [scannedDevices, setScannedDevices] = useState<DiscoveredGateway[]>([]);
  const stopScanRef = useRef<(() => void) | null>(null);

  const handleStartScan = () => {
    stopScanRef.current?.();
    setScannedDevices([]);
    setScanning(true);
    stopScanRef.current = scanForGateways(
      devices => setScannedDevices(devices),
      err => log(`Scan error: ${err.message}`, true),
      () => setScanning(false),
    );
  };

  const handleStopScan = () => {
    stopScanRef.current?.();
    stopScanRef.current = null;
  };

  useEffect(() => {
    // Stop any in-flight scan if the component unmounts mid-scan.
    return () => stopScanRef.current?.();
  }, []);

  // Connecting is separate from sending credentials — the WiFi form only
  // appears once this is set, i.e. once a BLE connection actually exists.
  const [connectedGatewayId, setConnectedGatewayId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    initSdk(SDK_CONFIG)
      .then(() => {
        setReady(true);
        log('SDK initialized against coiliiot-sense-staging');
      })
      .catch(err => log(`initSdk failed: ${err.message}`, true));
  }, [log]);

  useEffect(() => {
    if (!activeGatewayId) {
      return;
    }
    // Every sensor under the gateway, registered or not — there's no
    // separate "unregistered" bucket in the database, just an is_registered
    // flag on each one. Filtered client-side above for each list.
    const unsubscribe = listenForSensors(activeGatewayId, sensors =>
      setAllSensors(sensors),
    );
    return unsubscribe;
  }, [activeGatewayId]);

  const runStep = async (key: string, action: () => Promise<void>) => {
    setBusyKey(key);
    try {
      await action();
    } catch (err: any) {
      log(`Error: ${err.message ?? String(err)}`, true);
    } finally {
      setBusyKey(null);
    }
  };

  const handleSignIn = () =>
    runStep('signIn', async () => {
      const user = await signIn(email, password);
      setSignedIn(true);
      log(`Signed in as ${user.email}`);
    });

  const handleSignOut = () =>
    runStep('signOut', async () => {
      await signOut();
      setSignedIn(false);
      setConnectedGatewayId(null);
      setGatewayId('');
      setActiveGatewayId('');
      setAllSensors([]);
      setSensorReadings({});
      log('Signed out');
    });

  const handleConnectDevice = (device: DiscoveredGateway) =>
    runStep(`connect:${device.id}`, async () => {
      handleStopScan();
      await connectToGateway(device.id);
      setConnectedGatewayId(device.id);
      log(
        `Connected to gateway ${abbreviateId(
          device.id,
        )} — enter WiFi credentials to continue.`,
      );
    });

  const handleDisconnectDevice = (deviceId: string) =>
    runStep(`disconnect:${deviceId}`, async () => {
      await disconnectFromGateway(deviceId);
      setConnectedGatewayId(null);
      // Gone from the list — reconnecting means scanning again, since we no
      // longer know this is still in range.
      setScannedDevices(prev => prev.filter(d => d.id !== deviceId));
      log(`Disconnected from gateway ${abbreviateId(deviceId)}`);
    });

  const handleSendCredentials = () =>
    runStep('sendCredentials', async () => {
      if (!connectedGatewayId) {
        return;
      }
      const gatewayBeingProvisioned = connectedGatewayId;
      await sendWifiCredentials(gatewayBeingProvisioned, ssid, wifiPassword, {
        onProgress: (stage: ProvisioningStage) => {
          log(`Provisioning: ${stage}`);
          if (stage === 'ok' || stage === 'server_fail') {
            // The BLE connection is gone either way — "ok" means the
            // gateway deinitializes BLE after success, "server_fail" means
            // it's rebooting. Either way the scan entry is now stale.
            setScannedDevices(prev =>
              prev.filter(d => d.id !== gatewayBeingProvisioned),
            );
          }
          if (stage === 'server_fail') {
            setConnectedGatewayId(null);
          }
        },
      });
      log(
        `Gateway ${abbreviateId(
          gatewayBeingProvisioned,
        )} provisioned and reached the cloud`,
      );
      setGatewayId(gatewayBeingProvisioned);
      setConnectedGatewayId(null); // done — hide the WiFi form again
      // On a wifi_fail rejection, runStep's catch logs the error and we
      // deliberately don't clear connectedGatewayId here — the connection
      // stays open on the gateway's side, so the form stays visible to
      // retry with corrected credentials, same as the main app.
    });

  const handleRegisterGateway = () =>
    runStep('registerGateway', async () => {
      const gateway = await registerGateway(gatewayId);
      setActiveGatewayId(gateway.gateway_id);
      log(
        `Gateway ${abbreviateId(gateway.gateway_id)} registered (model ${
          gateway.model
        })`,
      );
    });

  const handleRemoveGateway = () =>
    runStep('removeGateway', async () => {
      await removeGateway(activeGatewayId);
      log(`Gateway ${abbreviateId(activeGatewayId)} removed`);
      setActiveGatewayId('');
      setGatewayId('');
      setAllSensors([]);
      setSensorReadings({});
    });

  const handleClaimSensor = (sensorId: string) =>
    runStep(`claim:${sensorId}`, async () => {
      await registerSensor(activeGatewayId, sensorId);
      log(`Sensor ${abbreviateId(sensorId)} claimed`);
    });

  const handleUnclaimSensor = (sensorId: string) =>
    runStep(`unclaim:${sensorId}`, async () => {
      await unregisterSensor(activeGatewayId, sensorId);
      log(`Sensor ${abbreviateId(sensorId)} unclaimed`);
      setSensorReadings(prev => {
        const next = { ...prev };
        delete next[sensorId];
        return next;
      });
    });

  const handleReadLatest = (sensorId: string) =>
    runStep(`readLatest:${sensorId}`, async () => {
      const data = await getLatestSensorData(activeGatewayId, sensorId);
      setSensorReadings(prev => ({ ...prev, [sensorId]: data }));
      log(
        `Latest reading for ${abbreviateId(sensorId)}: ${JSON.stringify(
          data.current_data,
        )}`,
      );
    });

  return (
    <SafeAreaProvider>
      <SafeAreaView
        style={[styles.safe, { backgroundColor: theme.background }]}
      >
        <StatusBar
          barStyle={theme === DARK_THEME ? 'light-content' : 'dark-content'}
        />
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={[styles.title, { color: theme.text }]}>
            Coiliiot Sense SDK Demo
          </Text>
          <Text style={[styles.subtitle, { color: theme.subtext }]}>
            {ready ? 'SDK ready — coiliiot-sense-staging' : 'Initializing…'}
          </Text>

          {!signedIn ? (
            <Section title="1. Sign in">
              <ThemedInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                placeholder="Email"
              />
              <ThemedInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Password"
              />
              <Button
                title="Sign In"
                onPress={handleSignIn}
                disabled={!ready || busy}
                loading={busyKey === 'signIn'}
              />
            </Section>
          ) : (
            <>
              <Section title="Signed in" done>
                <Button
                  title="Sign Out"
                  onPress={handleSignOut}
                  disabled={busy}
                  loading={busyKey === 'signOut'}
                />
              </Section>

              <Section
                title="2. Scan for a gateway over BLE"
                done={!!connectedGatewayId || !!gatewayId}
              >
                {scanning ? (
                  <Button title="Stop Scan" onPress={handleStopScan} />
                ) : (
                  <Button
                    title="Scan for Gateways"
                    onPress={handleStartScan}
                    disabled={busy}
                  />
                )}
                {scanning ? (
                  <View style={styles.scanningRow}>
                    <ActivityIndicator size="small" color={theme.subtext} />
                    <Hint>Scanning…</Hint>
                  </View>
                ) : null}
                {!scanning && scannedDevices.length === 0 ? (
                  <Hint>None found.</Hint>
                ) : null}
                {scannedDevices.length > 0
                  ? scannedDevices.map(device => {
                      const isConnected = device.id === connectedGatewayId;
                      const isConnecting = busyKey === `connect:${device.id}`;
                      const isDisconnecting =
                        busyKey === `disconnect:${device.id}`;
                      const statusColor = isConnected
                        ? theme.doneText
                        : isConnecting
                        ? theme.connectingText
                        : theme.subtext;
                      const statusLabel = isConnected
                        ? 'Connected'
                        : isConnecting
                        ? 'Connecting…'
                        : 'Not connected';
                      return (
                        <View key={device.id} style={styles.row}>
                          <View style={styles.rowText}>
                            <Text
                              style={[styles.deviceText, { color: theme.text }]}
                            >
                              {device.model}
                              {'\n'}
                              {abbreviateId(device.id)} (rssi:{' '}
                              {device.rssi ?? '—'})
                            </Text>
                            <Text
                              style={[
                                styles.statusText,
                                { color: statusColor },
                              ]}
                            >
                              ● {statusLabel}
                            </Text>
                          </View>
                          {isConnected ? (
                            <Button
                              title="Disconnect"
                              onPress={() => handleDisconnectDevice(device.id)}
                              disabled={busy}
                              loading={isDisconnecting}
                            />
                          ) : (
                            <Button
                              title="Connect"
                              onPress={() => handleConnectDevice(device)}
                              disabled={busy || scanning}
                              loading={isConnecting}
                            />
                          )}
                        </View>
                      );
                    })
                  : null}
              </Section>

              {connectedGatewayId || gatewayId ? (
                <Section
                  title="3. Send WiFi credentials"
                  done={!connectedGatewayId && !!gatewayId}
                >
                  <Hint>
                    {connectedGatewayId
                      ? `Connected to ${abbreviateId(connectedGatewayId)}.`
                      : `Credentials already sent for ${abbreviateId(
                          gatewayId,
                        )}.`}
                  </Hint>
                  <ThemedInput
                    value={ssid}
                    onChangeText={setSsid}
                    placeholder="WiFi SSID"
                    editable={!!connectedGatewayId}
                  />
                  <ThemedInput
                    value={wifiPassword}
                    onChangeText={setWifiPassword}
                    secureTextEntry
                    placeholder="WiFi password"
                    editable={!!connectedGatewayId}
                  />
                  <Button
                    title="Send Credentials"
                    onPress={handleSendCredentials}
                    disabled={
                      busy || !connectedGatewayId || !ssid || !wifiPassword
                    }
                    loading={busyKey === 'sendCredentials'}
                  />
                </Section>
              ) : null}

              {gatewayId ? (
                <Section
                  title="4. Register the gateway to your account"
                  done={!!activeGatewayId}
                >
                  <Hint>Gateway: {abbreviateId(gatewayId)}</Hint>
                  {activeGatewayId ? (
                    <Button
                      title="Remove Gateway"
                      onPress={handleRemoveGateway}
                      disabled={busy}
                      loading={busyKey === 'removeGateway'}
                    />
                  ) : (
                    <Button
                      title="Register Gateway"
                      onPress={handleRegisterGateway}
                      disabled={busy}
                      loading={busyKey === 'registerGateway'}
                    />
                  )}
                </Section>
              ) : null}

              {activeGatewayId ? (
                <>
                  <Section
                    title="5. Claim a sensor"
                    done={registeredSensors.length > 0}
                  >
                    {unregisteredSensors.length === 0 ? (
                      <Hint>No unclaimed sensors seen yet.</Hint>
                    ) : (
                      unregisteredSensors.map(sensor => (
                        <View key={sensor.sensor_id} style={styles.row}>
                          <Text style={[styles.rowText, { color: theme.text }]}>
                            {abbreviateId(sensor.sensor_id)} (
                            {sensor.model ?? 'unknown model'})
                          </Text>
                          <Button
                            title="Claim"
                            onPress={() => handleClaimSensor(sensor.sensor_id)}
                            disabled={busy}
                            loading={busyKey === `claim:${sensor.sensor_id}`}
                          />
                        </View>
                      ))
                    )}
                  </Section>

                  <Section title="6. Your claimed sensors">
                    {registeredSensors.length === 0 ? (
                      <Hint>No sensors claimed yet.</Hint>
                    ) : (
                      registeredSensors.map(sensor => {
                        const reading = sensorReadings[sensor.sensor_id];
                        return (
                          <View
                            key={sensor.sensor_id}
                            style={styles.sensorEntry}
                          >
                            <View style={styles.row}>
                              <Text
                                style={[styles.rowText, { color: theme.text }]}
                              >
                                {abbreviateId(sensor.sensor_id)} (
                                {sensor.model ?? 'unknown model'})
                              </Text>
                              <View style={styles.buttonGroup}>
                                <Button
                                  title="Read Latest"
                                  onPress={() =>
                                    handleReadLatest(sensor.sensor_id)
                                  }
                                  disabled={busy}
                                  loading={
                                    busyKey === `readLatest:${sensor.sensor_id}`
                                  }
                                />
                                <Button
                                  title="Unclaim"
                                  onPress={() =>
                                    handleUnclaimSensor(sensor.sensor_id)
                                  }
                                  disabled={busy}
                                  loading={
                                    busyKey === `unclaim:${sensor.sensor_id}`
                                  }
                                />
                              </View>
                            </View>
                            {reading ? (
                              <Hint>
                                last_seen: {reading.last_seen}
                                {'\n'}current_data:{' '}
                                {JSON.stringify(reading.current_data)}
                                {'\n'}rssi: {reading.rssi ?? '—'} battery:{' '}
                                {reading.battery ?? '—'}
                              </Hint>
                            ) : null}
                          </View>
                        );
                      })
                    )}
                  </Section>
                </>
              ) : null}
            </>
          )}

          <Section title="Activity log">
            {lines.length === 0 ? (
              <Hint>Nothing yet.</Hint>
            ) : (
              lines.map((line, i) => (
                <Text
                  key={i}
                  style={[
                    styles.logLine,
                    { color: line.isError ? theme.errorText : theme.subtext },
                  ]}
                >
                  {line.text}
                </Text>
              ))
            )}
          </Section>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 13, marginBottom: 8 },
  section: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  sectionDoneBorder: { borderWidth: 1.5 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  doneBadge: { fontSize: 12, fontWeight: '700' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  buttonDisabled: { opacity: 0.4 },
  inputDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontWeight: '600' },
  buttonGroup: { flexDirection: 'row', gap: 8 },
  scanningRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  sensorEntry: { gap: 4 },
  rowText: { flex: 1, fontSize: 13, gap: 2 },
  deviceText: { fontSize: 13 },
  statusText: { fontSize: 12, fontWeight: '600' },
  hint: { fontSize: 12 },
  logLine: { fontSize: 11, fontFamily: 'Courier' },
});

export default App;
