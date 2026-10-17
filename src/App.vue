<script setup lang="ts">
import { onMounted } from 'vue'
import SetupScreen from './components/SetupScreen.vue'
import CallScreen from './components/CallScreen.vue'
import ModelPicker from './components/ModelPicker.vue'
import SettingsDrawer from './components/SettingsDrawer.vue'
import ToastStack from './components/ToastStack.vue'
import AppIcon from './components/AppIcon.vue'
import DebugPanel from './components/DebugPanel.vue'
import { debugEnabled } from './stores/diag'
import { armWake, sendScreenshot } from './call/call'
import { isSetUp } from './stores/settings'
import { useScreenshotInput } from './composables/useScreenshotInput'

const { dragging } = useScreenshotInput(
  (file) => void sendScreenshot(file),
  () => isSetUp.value,
)

onMounted(armWake)
</script>

<template>
  <SetupScreen v-if="!isSetUp" />
  <template v-else>
    <CallScreen />
    <ModelPicker />
    <SettingsDrawer />
  </template>
  <ToastStack />
  <DebugPanel v-if="debugEnabled" />

  <Transition name="drop">
    <div v-if="dragging" class="drop-overlay" aria-hidden="true">
      <div class="drop-box">
        <AppIcon name="image" :size="40" />
        <p>Drop your screenshot for Condoriano</p>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss">
/*
 * Design tokens. Dark ground ladder with a gold brand hue (75–80), built with the house OKLCH rules:
 * every color is inside sRGB, and every text pair below was measured at 7:1 or better.
 */
:root {
  color-scheme: dark;

  --color-background: oklch(0.14 0.012 75);
  --color-surface-low: oklch(0.18 0.014 75);
  --color-surface: oklch(0.22 0.016 75);
  --color-surface-high: oklch(0.28 0.018 75);
  --color-surface-highest: oklch(0.34 0.02 75);
  --color-on-background: oklch(0.92 0.015 80);
  --color-on-surface-variant: oklch(0.78 0.03 78);
  --color-outline: oklch(0.55 0.03 75);
  --color-outline-variant: oklch(0.34 0.02 75);

  --color-primary: oklch(0.82 0.11 78);
  --color-on-primary: oklch(0.22 0.037 75);
  --color-primary-container: oklch(0.32 0.054 75);
  --color-on-primary-container: oklch(0.9 0.048 80);

  --color-error: oklch(0.78 0.1 25);
  --color-on-error: oklch(0.22 0.037 25);
  --color-success: oklch(0.8 0.1 150);
  --color-warning: oklch(0.84 0.1 70);
  --color-warning-container: oklch(0.28 0.047 70);
  --color-on-warning-container: oklch(0.92 0.015 80);
  --color-info: oklch(0.8 0.08 250);

  --focus-ring: 0 0 0 3px color-mix(in oklab, var(--color-primary) 55%, transparent);
  --shadow-lg: 0 18px 50px oklch(0 0 0 / 45%);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;

  --font-body: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-display: 'Cinzel', Georgia, 'Times New Roman', serif;
  --font-mono: ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, monospace;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
}

body {
  min-height: 100dvh;
  overflow-x: hidden;
  background:
    radial-gradient(ellipse 80% 60% at 50% 35%, color-mix(in srgb, var(--color-primary) 7%, transparent), transparent 70%),
    var(--color-background);
  color: var(--color-on-background);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

button,
input,
select {
  font: inherit;
}

.input {
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-outline);
  background: var(--color-surface);
  color: var(--color-on-background);

  &::placeholder {
    color: color-mix(in srgb, var(--color-on-background) 55%, transparent);
  }

  &:focus-visible {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: var(--focus-ring);
  }
}

select.input {
  padding-right: 8px;
}

.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 16px;
  background: oklch(0 0 0 / 65%);
  pointer-events: none;
}

.drop-box {
  display: grid;
  justify-items: center;
  gap: 12px;
  width: min(520px, 100%);
  padding: 48px 24px;
  border: 2px dashed var(--color-primary);
  border-radius: var(--radius-lg);
  background: var(--color-surface-low);
  color: var(--color-primary);
  text-align: center;
  font-size: 1.15rem;
  font-weight: 700;

  p {
    margin: 0;
    color: var(--color-on-background);
  }
}

.drop-enter-active,
.drop-leave-active {
  transition: opacity 0.15s ease;
}

.drop-enter-from,
.drop-leave-to {
  opacity: 0;
}
</style>
