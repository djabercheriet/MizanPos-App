/**
 * MIZANE Mobile Scanner — local scan history.
 *
 * Purely a local convenience log shown on the Scan History screen. It is NEVER
 * replayed into a POS cart: history entries are display-only and are not queued
 * for delivery after a disconnect.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ScanOutcome } from '../protocol/scan-protocol';

const KEY_HISTORY = 'mizane.scanHistory.v1';
const MAX_ENTRIES = 100;

export type ScanStatus = 'acked' | 'duplicate' | 'failed';

export interface ScanHistoryEntry {
  /** Local id (unique per attempt). */
  id: string;
  /** The barcode that was scanned, exactly as decoded (leading zeros kept). */
  code: string;
  /** Barcode symbology when known. */
  format: string | null;
  /** Epoch ms the scan was captured on the phone. */
  capturedAt: number;
  /** Delivery outcome. */
  status: ScanStatus;
  /** Desktop-issued scan id when accepted; `null` for duplicates/failures. */
  remoteScanId: string | null;
  /** Short failure/duplicate reason for display. */
  detail: string | null;
  /**
   * What the POS actually did with the barcode, reported afterwards in
   * `scan.result`. `null` while the phone is still waiting: the transport
   * status on its own never proves the cart changed.
   */
  outcome: ScanOutcome | null;
  /** Optional detail attached to the POS outcome by the desktop. */
  outcomeDetail: string | null;
}

export async function loadHistory(): Promise<ScanHistoryEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_HISTORY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Normalises records written before the POS outcome was tracked.
    return parsed.filter(isHistoryEntry).map((entry) => ({
      id: entry.id,
      code: entry.code,
      format: typeof entry.format === 'string' ? entry.format : null,
      capturedAt: entry.capturedAt,
      status: entry.status,
      remoteScanId: typeof entry.remoteScanId === 'string' ? entry.remoteScanId : null,
      detail: typeof entry.detail === 'string' ? entry.detail : null,
      outcome: entry.outcome ?? null,
      outcomeDetail: entry.outcomeDetail ?? null,
    }));
  } catch {
    return [];
  }
}

export async function saveHistory(entries: ScanHistoryEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_HISTORY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore — history is non-critical
  }
}

/** Prepend an entry and cap the log. Returns the new list. */
export function prependEntry(entries: ScanHistoryEntry[], entry: ScanHistoryEntry): ScanHistoryEntry[] {
  return [entry, ...entries].slice(0, MAX_ENTRIES);
}

export async function clearHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY_HISTORY);
  } catch {
    // ignore
  }
}

/**
 * Structural guard for a persisted record. Only the fields present since the
 * first release are required; the POS outcome fields are optional so entries
 * written before they existed still load.
 */
function isHistoryEntry(
  value: unknown,
): value is Partial<ScanHistoryEntry> & Pick<ScanHistoryEntry, 'id' | 'code' | 'capturedAt' | 'status'> {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ScanHistoryEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.code === 'string' &&
    typeof entry.capturedAt === 'number' &&
    (entry.status === 'acked' || entry.status === 'duplicate' || entry.status === 'failed')
  );
}
