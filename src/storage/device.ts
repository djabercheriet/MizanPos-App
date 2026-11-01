/**
 * MIZANE Mobile Scanner — device identity.
 *
 * A stable, human-editable display name for this phone. The cryptographic
 * identity of a paired device is the desktop-issued `deviceId` + `credential`
 * pair in `secure.ts`; this module only covers presentation.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';

const KEY_DEVICE_NAME = 'mizane.deviceName.v1';
const MAX_DEVICE_NAME_LENGTH = 64;

/** Default name suggested to the user, derived from the physical device. */
export function defaultDeviceName(): string {
  const model = Device.modelName || Device.deviceName || 'Phone';
  return model.slice(0, MAX_DEVICE_NAME_LENGTH);
}

/** Platform string sent in the pairing request (`ios` / `android`). */
export function platformString(): string {
  const os = Device.osName ? String(Device.osName).toLowerCase() : '';
  if (os.includes('ios')) return 'ios';
  if (os.includes('android')) return 'android';
  return 'unknown';
}

/** Full platform descriptor, e.g. `android 14 (Pixel 7)`. */
export function platformDetail(): string {
  const parts = [platformString()];
  if (Device.osVersion) parts.push(Device.osVersion);
  const model = Device.modelName || Device.deviceName;
  if (model) parts.push(model);
  return parts.join(' ').slice(0, 32);
}

export async function loadDeviceName(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(KEY_DEVICE_NAME);
    if (stored && stored.trim().length > 0) return stored.trim().slice(0, MAX_DEVICE_NAME_LENGTH);
  } catch {
    // fall through
  }
  return defaultDeviceName();
}

export async function saveDeviceName(name: string): Promise<void> {
  const trimmed = name.trim().slice(0, MAX_DEVICE_NAME_LENGTH);
  if (trimmed.length === 0) return;
  try {
    await AsyncStorage.setItem(KEY_DEVICE_NAME, trimmed);
  } catch {
    // ignore
  }
}
