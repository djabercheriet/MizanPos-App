/**
 * MIZANE Mobile Scanner — application state.
 *
 * One provider owns: preferences/i18n, the paired-device record, the gateway
 * transport client, connection status, the local scan history and the (very
 * small) screen router. Screens stay presentational.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { I18nManager } from 'react-native';

import { createTranslator, type TranslationKey } from '../i18n';
import type { PairingPayload } from '../protocol/qr-payload';
import type { ScanOutcome } from '../protocol/scan-protocol';
import type { ThemeScheme } from '../theme/theme';
import {
  GatewayClient,
  pairReasonMessage,
  type GatewayStatusSnapshot,
  type ScanResult,
} from '../transport/gateway-client';
import { clearPairing, loadPairing, randomToken, savePairing, type StoredPairing } from '../storage/secure';
import { defaultDeviceName, loadDeviceName, platformString, saveDeviceName } from '../storage/device';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type LanguageCode,
  type Preferences,
} from '../storage/preferences';
import {
  clearHistory,
  loadHistory,
  prependEntry,
  saveHistory,
  type ScanHistoryEntry,
} from '../storage/history';

export type Route =
  | 'welcome'
  | 'pair'
  | 'pending'
  | 'scanner'
  | 'history'
  | 'devices'
  | 'settings';

export interface PendingApprovalInfo {
  host: string;
  port: number;
  expiresAt: number;
  deviceName: string;
}

export interface LastScanResult {
  result: ScanResult;
  code: string;
  at: number;
  /**
   * What the POS actually did with the barcode, reported by the desktop AFTER
   * it processed the scan. `null` while the phone is still waiting — an `ack`
   * alone is never treated as a successful add.
   */
  outcome: ScanOutcome | null;
  outcomeDetail: string | null;
}

interface AppContextValue {
  ready: boolean;

  route: Route;
  navigate: (route: Route) => void;

  language: LanguageCode;
  rtl: boolean;
  /** Active colour scheme, sourced from preferences. */
  theme: ThemeScheme;
  t: (key: TranslationKey) => string;
  preferences: Preferences;
  updatePreferences: (patch: Partial<Preferences>) => void;

  deviceName: string;
  updateDeviceName: (name: string) => Promise<void>;

  pairing: StoredPairing | null;
  transportAvailable: boolean;
  status: GatewayStatusSnapshot;

  pairWithPayload: (payload: PairingPayload) => Promise<void>;
  cancelPairing: () => Promise<void>;
  pairingError: string | null;
  clearPairingError: () => void;
  pendingApproval: PendingApprovalInfo | null;

  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;

  history: ScanHistoryEntry[];
  clearScanHistory: () => Promise<void>;

  submitScan: (code: string, format: string | null) => Promise<ScanResult>;
  lastScanResult: LastScanResult | null;
  isConnected: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [route, setRoute] = useState<Route>('welcome');
  const [preferences, setPreferences] = useState<Preferences>({ ...DEFAULT_PREFERENCES });
  const [deviceName, setDeviceName] = useState<string>(defaultDeviceName());
  const [pairing, setPairing] = useState<StoredPairing | null>(null);
  const [status, setStatus] = useState<GatewayStatusSnapshot>({
    status: 'idle',
    address: null,
    desktopName: null,
    lastError: null,
    reconnectAttempt: 0,
  });
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalInfo | null>(null);
  const [history, setHistory] = useState<ScanHistoryEntry[]>([]);
  const [lastScanResult, setLastScanResult] = useState<LastScanResult | null>(null);

  const pairingRef = useRef<StoredPairing | null>(null);
  const clientRef = useRef<GatewayClient | null>(null);

  const translator = useMemo(() => createTranslator(preferences.language), [preferences.language]);
  const t = useCallback((key: TranslationKey) => translator.t(key), [translator]);

  /* ---------------------------------------------------------------- *
   * Client bootstrap
   * ---------------------------------------------------------------- */

  if (!clientRef.current) {
    clientRef.current = new GatewayClient({
      onStatusChange: (snapshot) => setStatus(snapshot),
      // The desktop reports what the POS ACTUALLY did in `scan.result`, after
      // the scan has been resolved. Applied to the matching scan so the banner
      // can move from "confirming" to the real cart outcome.
      onScanOutcome: (info) => {
        setLastScanResult((previous) => {
          if (!previous) return previous;
          const matchesScanId = !!info.scanId && previous.result.scanId === info.scanId;
          const matchesCode = !!info.code && previous.code === info.code;
          // Fall back to the scan still awaiting its confirmation when the
          // desktop could not attribute the outcome to a specific id.
          const awaitingFirstOutcome = previous.outcome === null;
          if (!matchesScanId && !matchesCode && !awaitingFirstOutcome) return previous;
          return { ...previous, outcome: info.outcome, outcomeDetail: info.detail };
        });
        // The local history keeps the REAL result, not just the transport status.
        setHistory((previous) => {
          const index = previous.findIndex((entry) => {
            if (info.scanId && entry.remoteScanId === info.scanId) return true;
            return !info.scanId && !!info.code && entry.code === info.code && entry.outcome === null;
          });
          if (index < 0) return previous;
          const current = previous[index];
          if (!current) return previous;
          if (current.outcome === info.outcome && current.outcomeDetail === info.detail) return previous;
          const next = previous.slice();
          next[index] = { ...current, outcome: info.outcome, outcomeDetail: info.detail };
          void saveHistory(next);
          return next;
        });
      },
    });
  }

  /* ---------------------------------------------------------------- *
   * Initial load
   * ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [loadedPreferences, loadedDeviceName, loadedPairing, loadedHistory] = await Promise.all([
        loadPreferences(),
        loadDeviceName(),
        loadPairing(),
        loadHistory(),
      ]);
      if (cancelled) return;

      setPreferences(loadedPreferences);
      setDeviceName(loadedDeviceName);
      setHistory(loadedHistory);
      setPairing(loadedPairing);
      pairingRef.current = loadedPairing;
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------------------------------------------------------- *
   * RTL
   * ---------------------------------------------------------------- */

  useEffect(() => {
    const shouldBeRTL = preferences.language === 'ar';
    if (I18nManager.isRTL !== shouldBeRTL) {
      // RN requires a reload for direction to fully apply; the layout below also
      // mirrors explicitly, so the current session still renders correctly.
      I18nManager.allowRTL(shouldBeRTL);
    }
  }, [preferences.language]);

  /* ---------------------------------------------------------------- *
   * Auto-connect once a stored pairing is loaded
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (!ready) return;
    const stored = pairingRef.current;
    if (!stored) {
      setRoute('welcome');
      return;
    }
    void clientRef.current?.connect(stored).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Connection failed';
      setStatus((previous) => ({ ...previous, lastError: message }));
    });
  }, [ready]);

  /* ---------------------------------------------------------------- *
   * Revoked / invalid credential handling
   * ---------------------------------------------------------------- */

  useEffect(() => {
    if (status.status !== 'revoked') return;
    void (async () => {
      await clearPairing();
      pairingRef.current = null;
      setPairing(null);
      clientRef.current?.forgetPairing();
      setRoute('welcome');
      // Clear, actionable recovery copy on the welcome screen: the stored
      // credential was revoked (or is no longer valid on the desktop), so a
      // fresh QR pairing is the only way forward. Without this the user would
      // land on "Not paired" with no explanation.
      setStatus((previous) => ({ ...previous, lastError: t('errors.revoked') }));
    })();
  }, [status.status, t]);

  /* ---------------------------------------------------------------- *
   * Shutdown on unmount
   * ---------------------------------------------------------------- */

  useEffect(() => {
    return () => {
      void clientRef.current?.shutdown();
    };
  }, []);

  /* ---------------------------------------------------------------- *
   * Actions
   * ---------------------------------------------------------------- */

  const updatePreferences = useCallback((patch: Partial<Preferences>) => {
    setPreferences((previous) => {
      const next = { ...previous, ...patch };
      void savePreferences(next);
      return next;
    });
  }, []);

  const updateDeviceName = useCallback(async (name: string) => {
    setDeviceName(name);
    await saveDeviceName(name);
  }, []);

  const clearPairingError = useCallback(() => setPairingError(null), []);

  const pairWithPayload = useCallback(
    async (payload: PairingPayload) => {
      const client = clientRef.current;
      if (!client) return;

      setPairingError(null);
      const name = deviceName || defaultDeviceName();
      setPendingApproval({
        host: payload.host,
        port: payload.port,
        expiresAt: payload.expiresAt,
        deviceName: name,
      });
      setRoute('pending');

      try {
        const issued = await client.pair(payload, name, platformString());
        await savePairing(issued);
        pairingRef.current = issued;
        setPairing(issued);
        setPendingApproval(null);
        setRoute('scanner');
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : '';
        if (code === 'cancelled') {
          // The user cancelled from the pending screen; stay quiet.
          setPendingApproval(null);
          return;
        }
        const inFlightMessage =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : pairReasonMessage(code);
        setPairingError(inFlightMessage);
        setPendingApproval(null);
        setRoute('pair');
      }
    },
    [deviceName],
  );

  const cancelPairing = useCallback(async () => {
    await clientRef.current?.cancelPairing();
    setPendingApproval(null);
    setPairingError(null);
    setRoute('pair');
  }, []);

  const reconnect = useCallback(async () => {
    const stored = pairingRef.current;
    if (!stored) return;
    await clientRef.current?.connect(stored).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Connection failed';
      setStatus((previous) => ({ ...previous, lastError: message }));
      throw error;
    });
  }, []);

  const disconnect = useCallback(async () => {
    await clientRef.current?.disconnect();
    clientRef.current?.forgetPairing();
    await clearPairing();
    pairingRef.current = null;
    setPairing(null);
    setRoute('welcome');
  }, []);

  const clearScanHistory = useCallback(async () => {
    setHistory([]);
    await clearHistory();
  }, []);

  const appendHistory = useCallback(async (entry: ScanHistoryEntry) => {
    setHistory((previous) => {
      const next = prependEntry(previous, entry);
      void saveHistory(next);
      return next;
    });
  }, []);

  const submitScan = useCallback(
    async (code: string, format: string | null): Promise<ScanResult> => {
      const client = clientRef.current;
      const capturedAt = Date.now();

      const result = client
        ? await client.sendScan(code, format)
        : ({ status: 'failed', scanId: null, detail: 'not_connected' } as ScanResult);

      setLastScanResult({ result, code, at: capturedAt, outcome: null, outcomeDetail: null });
      // The local log write is NOT on the scan critical path: the banner and
      // haptics must not wait on an AsyncStorage round-trip.
      void appendHistory({
        id: randomToken(9),
        code,
        format,
        capturedAt,
        status: result.status,
        remoteScanId: result.scanId,
        detail: result.detail,
        // Filled in later by `scan.result`; the transport status is not the
        // cart result.
        outcome: null,
        outcomeDetail: null,
      });
      return result;
    },
    [appendHistory],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      route,
      navigate: setRoute,
      language: preferences.language,
      rtl: preferences.language === 'ar',
      theme: preferences.theme,
      t,
      preferences,
      updatePreferences,
      deviceName,
      updateDeviceName,
      pairing,
      transportAvailable: GatewayClient.isTransportAvailable(),
      status,
      pairWithPayload,
      cancelPairing,
      pairingError,
      clearPairingError,
      pendingApproval,
      reconnect,
      disconnect,
      history,
      clearScanHistory,
      submitScan,
      lastScanResult,
      isConnected: status.status === 'connected',
    }),
    [
      ready,
      route,
      preferences,
      t,
      updatePreferences,
      deviceName,
      updateDeviceName,
      pairing,
      status,
      pairWithPayload,
      cancelPairing,
      pairingError,
      clearPairingError,
      pendingApproval,
      reconnect,
      disconnect,
      history,
      clearScanHistory,
      submitScan,
      lastScanResult,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
