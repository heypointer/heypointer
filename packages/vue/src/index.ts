import { defineComponent, h, onMounted, ref } from 'vue';
import { HEYPOINTER_TAG, defineHeyPointerElement, type HeyPointer, type HeyPointerElement, type HeyPointerLabels, type HeyPointerTheme } from '@heypointerhq/sdk';
import type { PropType } from 'vue';

/**
 * Renders the shared `<heypointer-assistant>` element. The player itself lives in
 * `@heypointerhq/sdk`; this component only manages the element's lifecycle in Vue.
 * Nuxt-safe: registration happens in `onMounted`, so SSR emits an inert tag.
 *
 *   <HeyPointerAssistant base-url="https://heypointer.example.com" client-id="gfc_..." />
 */
export const HeyPointerAssistant = defineComponent({
  name: 'HeyPointerAssistant',
  props: {
    baseUrl: { type: String, required: true },
    /** Publishable client id from `heypointer init` (`gfc_` + 24 hex). */
    clientId: { type: String, default: '' },
    targetTimeoutMs: { type: Number, default: 0 },
    /** Start with assist mode on. The user can still switch it off; it is not remembered. */
    assist: { type: Boolean, default: false },
    /** Override any user-visible string (translations). Plain text with {placeholders}. */
    labels: { type: Object as PropType<HeyPointerLabels>, default: undefined },
    /** Colors, radius and font (same names as the `--hp-*` CSS variables). */
    theme: { type: Object as PropType<HeyPointerTheme>, default: undefined },
    colorScheme: { type: String as PropType<'auto' | 'light' | 'dark'>, default: '' },
    dir: { type: String as PropType<'ltr' | 'rtl'>, default: '' },
    lang: { type: String, default: '' },
    /** `none` hides the built-in button; open the guide from your own control through the exposed `open()`. */
    launcher: { type: String as PropType<'default' | 'none'>, default: 'default' },
    launcherSide: { type: String as PropType<'start' | 'end'>, default: 'end' },
  },
  setup(props, { expose }) {
    const el = ref<HeyPointerElement | null>(null);
    onMounted(defineHeyPointerElement);
    expose({ player: (): HeyPointer | null => el.value?.player ?? null, open: () => el.value?.open(), close: () => el.value?.close() });
    return () =>
      h(HEYPOINTER_TAG, {
        ref: el,
        'base-url': props.baseUrl,
        ...(props.clientId ? { 'client-id': props.clientId } : {}),
        ...(props.targetTimeoutMs ? { 'target-timeout-ms': String(props.targetTimeoutMs) } : {}),
        ...(props.assist ? { assist: '' } : {}),
        ...(props.labels ? { labels: JSON.stringify(props.labels) } : {}),
        ...(props.theme ? { theme: JSON.stringify(props.theme) } : {}),
        ...(props.colorScheme ? { 'color-scheme': props.colorScheme } : {}),
        ...(props.dir ? { dir: props.dir } : {}),
        ...(props.lang ? { lang: props.lang } : {}),
        ...(props.launcher === 'none' ? { launcher: 'none' } : {}),
        ...(props.launcherSide === 'start' ? { 'launcher-side': 'start' } : {}),
      });
  },
});
