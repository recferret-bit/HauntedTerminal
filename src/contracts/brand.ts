/** The project name, in one place. Spec: .kiro/specs/rename-out-of-credits/. */
export const PROJECT_NAME = 'Out Of Credits';
export const PROJECT_NAME_CAPS = 'OUT OF CREDITS';
/** Prefix of every localStorage key, save file and release name: `out-of-credits:<key>:v1`. */
export const PROJECT_SLUG = 'out-of-credits';
/** Sound preference (`{"muted":boolean,"volume":number}`). Spec: .kiro/specs/esc-menu-hud-rework/. */
export const SOUND_PREF_KEY = `${PROJECT_SLUG}:sound:v1`;
/** Prefix of the editor, lab and laptop keys: `credits.<area>.<key>`. */
export const DEV_KEY_PREFIX = 'credits.';
/** What the keys, save files and save `format` were called before the rename. Read only to migrate and import. */
export const LEGACY_SLUG = 'haunted-terminal';
export const LEGACY_DEV_KEY_PREFIX = 'haunted.';
