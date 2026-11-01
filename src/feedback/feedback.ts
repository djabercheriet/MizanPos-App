/**
 * MIZANE Mobile Scanner — scan feedback (vibration + optional beep).
 *
 * Both channels are best-effort: a failure in either never blocks or fails a
 * scan. Audio uses `expo-audio` with a tiny bundled confirmation beep.
 */

import * as Haptics from 'expo-haptics';
import * as ExpoAudio from 'expo-audio';
import scanBeep from '../../assets/scan-beep.wav';

interface AudioPlayerLike {
  play: () => void;
  seekTo: (seconds: number) => void;
  remove: () => void;
}

interface ExpoAudioLike {
  createAudioPlayer?: (source: number) => AudioPlayerLike;
  setAudioModeAsync?: (mode: Record<string, unknown>) => Promise<void>;
}

const audio = ExpoAudio as unknown as ExpoAudioLike;

let player: AudioPlayerLike | null = null;
let audioModeConfigured = false;

function ensurePlayer(): AudioPlayerLike | null {
  if (player) return player;
  try {
    player = audio.createAudioPlayer?.(scanBeep) ?? null;
  } catch {
    player = null;
  }
  return player;
}

async function ensureAudioMode(): Promise<void> {
  if (audioModeConfigured) return;
  audioModeConfigured = true;
  try {
    await audio.setAudioModeAsync?.({ playsInSilentMode: true, shouldPlayInBackground: false });
  } catch {
    // Best effort only.
  }
}

export interface FeedbackOptions {
  hapticsEnabled: boolean;
  soundEnabled: boolean;
}

/** Success feedback: a crisp haptic tick plus an optional short beep. */
export function playSuccessFeedback(options: FeedbackOptions): void {
  if (options.hapticsEnabled) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }
  if (options.soundEnabled) {
    void ensureAudioMode();
    const instance = ensurePlayer();
    if (instance) {
      try {
        instance.seekTo(0);
        instance.play();
      } catch {
        // Best effort only.
      }
    }
  }
}

/** Failure feedback: a warning haptic (never plays the success beep). */
export function playFailureFeedback(options: FeedbackOptions): void {
  if (options.hapticsEnabled) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  }
}

/** Release the audio player (called when the scanner leaves the foreground). */
export function releaseFeedback(): void {
  try {
    player?.remove();
  } catch {
    // ignore
  }
  player = null;
}
