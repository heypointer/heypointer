export { HeyPointer, ASSIST_EVENT, OPEN_EVENT, CLOSE_EVENT, type HeyPointerOptions, type AssistEvent } from './player';
export { DEFAULT_LABELS, resolveLabels, type HeyPointerLabels, type LabelKey } from './labels';
export { sanitizeTheme, type HeyPointerTheme, type ColorScheme } from './theme';
export { HeyPointerElement, HEYPOINTER_TAG, defineHeyPointerElement } from './element';
export { HeyPointerClient, NoSpeechError, SpeechUnavailableError, CLIENT_ID_PATTERN } from './client';
export { resolveTarget, resolveDetailed, waitForTarget, waitForResolution } from './targeting/index';
export { parseWalkthrough } from './validate';
export type * from './types';
