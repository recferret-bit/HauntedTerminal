/** Simultaneous one-shot voices. `attachAudio({ sources })` overrides it. Music beds and loops are extra slots. */
export const SOUND_SOURCES = 10;

/** Simultaneous typing one-shot voices (`key_press`, `key_backspace`, `key_enter`, `tab_complete`). */
export const TYPING_SOUND_SOURCES = 3;

/** Minimum interval (ms) between rapid typing key sounds (`key_press`, `key_backspace`): ~120 WPM (10/sec). */
export const TYPING_MIN_INTERVAL_MS = 100;
