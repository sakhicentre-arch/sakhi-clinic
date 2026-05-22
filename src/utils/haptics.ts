type HapticPattern = 'tap' | 'success' | 'warning';

export function haptic(pattern: HapticPattern = 'tap') {
  try {
    if (!('vibrate' in navigator)) return;
    const map: Record<HapticPattern, number | number[]> = {
      tap: 10,
      success: [10, 30, 10],
      warning: [20, 40, 20],
    };
    navigator.vibrate(map[pattern]);
  } catch {
    // no-op (permissions / unsupported)
  }
}

