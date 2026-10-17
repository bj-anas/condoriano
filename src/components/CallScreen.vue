<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import VoiceOrb from './VoiceOrb.vue'
import TranscriptPanel from './TranscriptPanel.vue'
import { call, firstModel, pauseSpeaking, retryWake, sendScreenshot, toggleCall } from '../call/call'
import { modelById } from '../ai/models'
import { isImageFile } from '../screenshots/image'
import { settings } from '../stores/settings'
import { openModelPicker, ui } from '../stores/ui'
import { notify } from '../stores/notifications'

const fileInput = ref<HTMLInputElement>()
const showShot = ref(false)
let shotTimer: ReturnType<typeof setTimeout> | undefined

const inCall = computed(() => call.state !== 'idle')
const canPause = computed(() => call.state === 'speaking' || call.state === 'thinking')

const STATUS: Record<typeof call.state, string> = {
  idle: 'Ready when you are',
  connecting: 'Calling Condoriano…',
  listening: 'Listening',
  thinking: 'Thinking…',
  speaking: 'Speaking',
}

const hint = computed(() => {
  switch (call.state) {
    case 'idle':
      return settings.wakeWordEnabled && call.wake === 'listening'
        ? 'Say “Hoy Condoriano” or tap the mic.'
        : 'Tap the mic to start a call.'
    case 'connecting':
      return 'Hold on a second.'
    case 'listening':
      return 'Talk naturally. Say “bye” to hang up.'
    case 'thinking':
      return 'Looking it up.'
    case 'speaking':
      return 'Talk over it to interrupt, or press Pause.'
  }
})

/** The model shown in the chip: the one answering now, or the one the next call will use. */
const activeModel = computed(() => call.model && inCall.value ? call.model : firstModel())
const modelLabel = computed(() => {
  if (settings.model === 'auto') return `Auto · ${activeModel.value?.label ?? 'no model left'}`
  return modelById(settings.model)?.label ?? 'Pick a model'
})
const noScreenshots = computed(() => !!activeModel.value && !activeModel.value.supportsImages)

const wakeText = computed(() => {
  switch (call.wake) {
    case 'listening':
      return { text: 'Listening for “Hoy Condoriano”', tone: 'ok', action: false }
    case 'needs-click':
      return { text: 'Click anywhere to turn on the wake word', tone: 'warn', action: true }
    case 'blocked':
      return { text: 'Wake word stopped. Click to retry', tone: 'warn', action: true }
    case 'unsupported':
      return { text: 'Wake word needs Chrome or Edge', tone: 'off', action: false }
    default:
      return { text: settings.wakeWordEnabled ? 'Wake word paused during the call' : 'Wake word off', tone: 'off', action: false }
  }
})

watch(
  () => call.screenshot?.at,
  (at) => {
    if (!at) return
    showShot.value = true
    clearTimeout(shotTimer)
    shotTimer = setTimeout(() => (showShot.value = false), 6000)
  },
)

function pickFile(): void {
  fileInput.value?.click()
}

function onFile(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!isImageFile(file)) {
    notify({ kind: 'error', title: 'That is not an image', message: 'Pick a PNG or JPG screenshot.' })
    return
  }
  void sendScreenshot(file)
}
</script>

<template>
  <div class="screen">
    <header class="top">
      <h1 class="wordmark">Condoriano</h1>
      <div class="top-actions">
        <button type="button" class="chip" @click="openModelPicker()">
          <AppIcon name="sparkle" :size="16" />
          <span class="chip-label">{{ modelLabel }}</span>
          <AppIcon name="chevron-down" :size="16" />
        </button>
        <button type="button" class="icon-button" aria-label="Settings" @click="ui.settingsOpen = true">
          <AppIcon name="settings" />
        </button>
      </div>
    </header>

    <main class="stage">
      <VoiceOrb :state="call.state" />
      <div class="status" role="status" aria-live="polite">
        <p class="status-main">{{ STATUS[call.state] }}</p>
        <p class="status-hint">{{ hint }}</p>
      </div>

      <component
        :is="wakeText.action ? 'button' : 'p'"
        v-if="call.state === 'idle'"
        :type="wakeText.action ? 'button' : undefined"
        class="wake"
        :data-tone="wakeText.tone"
        @click="wakeText.action ? retryWake() : undefined"
      >
        <span class="dot" aria-hidden="true" />
        {{ wakeText.text }}
      </component>

      <Transition name="fade">
        <figure v-if="showShot && call.screenshot" class="shot">
          <img :src="call.screenshot.url" alt="Screenshot sent to Condoriano" />
          <figcaption><AppIcon name="check" :size="16" /> Screenshot sent</figcaption>
        </figure>
      </Transition>

      <TranscriptPanel v-if="settings.showTranscript" />
    </main>

    <footer class="controls">
      <div class="control">
        <button type="button" class="round" aria-describedby="shot-note" @click="pickFile">
          <AppIcon name="image" :size="22" />
        </button>
        <span class="control-label">Screenshot</span>
        <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile" />
      </div>

      <div class="control">
        <button
          type="button"
          class="round round--main"
          :data-active="inCall"
          :aria-label="inCall ? 'End' : 'Start'"
          @click="toggleCall"
        >
          <AppIcon :name="inCall ? 'phone-off' : 'mic'" :size="30" />
        </button>
        <span class="control-label">{{ inCall ? 'End' : 'Talk' }}</span>
      </div>

      <div class="control">
        <button type="button" class="round" :disabled="!canPause" aria-label="Pause" @click="pauseSpeaking">
          <AppIcon name="pause" :size="22" />
        </button>
        <span class="control-label">Pause</span>
      </div>
    </footer>

    <p id="shot-note" class="drop-hint">
      <template v-if="noScreenshots">
        <AppIcon name="alert" :size="16" />
        {{ activeModel?.label }} can't see screenshots. Pick another model to send one.
      </template>
      <template v-else>Drop, paste (Ctrl+V) or upload a screenshot anytime.</template>
    </p>
  </div>
</template>

<style scoped lang="scss">
.screen {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 1fr auto auto;
  padding: 16px 16px 20px;
  gap: 12px;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: min(960px, 100%);
  margin: 0 auto;
}

.wordmark {
  flex: none;
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  letter-spacing: 0.04em;
  color: var(--color-primary);

  @media (min-width: 768px) {
    font-size: 25px;
  }
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  min-width: 0;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--color-outline-variant);
  background: var(--color-surface-low);
  color: var(--color-on-background);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;

  .icon:first-child {
    color: var(--color-primary);
  }

  &:hover {
    background: var(--color-surface);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
}

.chip-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: 50%;
  border: 1px solid var(--color-outline-variant);
  background: var(--color-surface-low);
  color: var(--color-on-background);
  cursor: pointer;

  &:hover {
    background: var(--color-surface);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
}

.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  min-height: 0;
}

.status {
  text-align: center;
}

.status-main {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.status-hint {
  margin: 6px 0 0;
  color: var(--color-on-surface-variant);
}

.wake {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--color-outline-variant);
  background: var(--color-surface-low);
  color: var(--color-on-surface-variant);
  font: inherit;
  font-size: 0.875rem;

  &:is(button) {
    cursor: pointer;

    &:hover {
      background: var(--color-surface);
    }

    &:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
    }
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-outline);
  }

  &[data-tone='ok'] .dot {
    background: var(--color-success);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-success) 20%, transparent);
  }

  &[data-tone='warn'] {
    color: var(--color-warning);

    .dot {
      background: var(--color-warning);
    }
  }
}

.shot {
  display: grid;
  gap: 6px;
  justify-items: center;
  margin: 0;

  img {
    max-width: min(240px, 60vw);
    max-height: 140px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-outline-variant);
    box-shadow: var(--shadow-lg);
  }

  figcaption {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: var(--color-success);
  }
}

.controls {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: clamp(20px, 8vw, 48px);
}

.control {
  display: grid;
  justify-items: center;
  gap: 8px;
}

.control-label {
  font-size: 0.85rem;
  color: var(--color-on-surface-variant);
}

.round {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 1px solid var(--color-outline-variant);
  background: var(--color-surface-high);
  color: var(--color-on-background);
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.1s ease;

  &:hover:not(:disabled) {
    background: color-mix(in oklab, var(--color-surface-high), currentColor 10%);
  }

  &:active:not(:disabled) {
    transform: scale(0.96);
  }

  &:disabled {
    color: color-mix(in srgb, var(--color-on-background) 38%, transparent);
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  &--main {
    width: 84px;
    height: 84px;
    border: 0;
    background: var(--color-primary);
    color: var(--color-on-primary);
    box-shadow: 0 8px 30px color-mix(in srgb, var(--color-primary) 30%, transparent);

    &:hover:not(:disabled) {
      background: color-mix(in oklab, var(--color-primary), white 12%);
    }

    &[data-active='true'] {
      background: var(--color-error);
      color: var(--color-on-error);
      box-shadow: 0 8px 30px color-mix(in srgb, var(--color-error) 30%, transparent);

      &:hover {
        background: color-mix(in oklab, var(--color-error), white 12%);
      }
    }
  }
}

.drop-hint {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  margin: 0;
  text-align: center;
  font-size: 0.85rem;
  color: var(--color-on-surface-variant);

  .icon {
    color: var(--color-warning);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
