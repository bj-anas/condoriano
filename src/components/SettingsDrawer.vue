<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import KeyField from './KeyField.vue'
import type { KeyStatus } from './KeyField.vue'
import ToggleSwitch from './ToggleSwitch.vue'
import { LIVE_VOICES, MODELS, modelById } from '../ai/models'
import { DEFAULT_VOICE_NAME, englishVoices } from '../audio/speech'
import { chooseModel } from '../call/call'
import { checkGeminiKey, checkGroqKey } from '../call/keys'
import { exportSettings, importSettings, resetSettings, settings } from '../stores/settings'
import { notify } from '../stores/notifications'
import { ui } from '../stores/ui'
import {
  folderAccessSupported,
  forgetScreenshotFolder,
  pickScreenshotFolder,
  savedFolder,
} from '../screenshots/folder'
import type { WakeSensitivity } from '../wake/match'

const dialog = ref<HTMLDialogElement>()

/** The Live voice only matters for Gemini Live, which Auto also starts with. */
const usesLiveVoice = computed(() => settings.model === 'auto' || modelById(settings.model)?.engine === 'live')
const geminiKey = ref(settings.geminiKey)
const groqKey = ref(settings.groqKey)
const voices = ref<SpeechSynthesisVoice[]>([])
const folderName = ref('')
const includeKeys = ref(false)
const confirmReset = ref(false)
const importInput = ref<HTMLInputElement>()

const SENSITIVITIES: { value: WakeSensitivity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]
const TIMEOUTS = [
  { value: 10, label: '10 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 300, label: '5 minutes' },
  { value: 0, label: 'Never' },
]

function loadVoices(): void {
  voices.value = englishVoices()
}

watch(
  () => ui.settingsOpen,
  (open) => {
    if (open) {
      geminiKey.value = settings.geminiKey
      groqKey.value = settings.groqKey
      confirmReset.value = false
      if (!dialog.value?.open) dialog.value?.showModal()
    } else if (dialog.value?.open) {
      dialog.value.close()
    }
  },
)

onMounted(async () => {
  loadVoices()
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', loadVoices)
  folderName.value = (await savedFolder())?.name ?? ''
})
onBeforeUnmount(() => {
  if ('speechSynthesis' in window) speechSynthesis.removeEventListener('voiceschanged', loadVoices)
})

function close(): void {
  ui.settingsOpen = false
}

function onBackdrop(e: MouseEvent): void {
  if (e.target === dialog.value) close()
}

function saveName(e: Event): void {
  const input = e.target as HTMLInputElement
  const name = input.value.trim()
  if (name) settings.userName = name
  else input.value = settings.userName
}

function onGeminiStatus(status: KeyStatus): void {
  if (status === 'valid') settings.geminiKey = geminiKey.value
}

function onGroqStatus(status: KeyStatus): void {
  if (status === 'valid') settings.groqKey = groqKey.value
}

watch(groqKey, (value) => {
  if (!value.trim()) settings.groqKey = ''
})

async function toggleFolder(on: boolean): Promise<void> {
  if (on && !folderName.value) {
    const picked = await chooseFolder()
    if (!picked) return
  }
  settings.watchScreenshotFolder = on
}

async function chooseFolder(): Promise<boolean> {
  try {
    folderName.value = await pickScreenshotFolder()
    return true
  } catch (err) {
    if ((err as DOMException).name !== 'AbortError') {
      notify({ kind: 'error', title: "Couldn't open that folder", message: (err as Error).message })
    }
    return false
  }
}

async function forgetFolder(): Promise<void> {
  await forgetScreenshotFolder()
  folderName.value = ''
  settings.watchScreenshotFolder = false
}

function download(): void {
  const blob = new Blob([exportSettings(includeKeys.value)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = includeKeys.value ? 'condoriano-settings-WITH-KEYS.json' : 'condoriano-settings.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function onImport(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const count = importSettings(await file.text())
    geminiKey.value = settings.geminiKey
    groqKey.value = settings.groqKey
    notify({ kind: 'success', title: 'Settings imported', message: `${count} settings applied.` })
  } catch (err) {
    notify({ kind: 'error', title: "Couldn't import that file", message: (err as Error).message })
  }
}

function reset(): void {
  if (!confirmReset.value) {
    confirmReset.value = true
    return
  }
  void forgetFolder()
  resetSettings()
  close()
}
</script>

<template>
  <dialog ref="dialog" class="drawer" aria-labelledby="settings-title" @close="close" @click="onBackdrop">
    <div class="panel">
      <header class="head">
        <h2 id="settings-title" class="title">Settings</h2>
        <button type="button" class="close" aria-label="Close settings" @click="close">
          <AppIcon name="close" />
        </button>
      </header>

      <section class="group" aria-labelledby="s-you">
        <h3 id="s-you" class="group-title">You</h3>
        <label class="field">
          <span class="label">Your name</span>
          <input :value="settings.userName" class="input" maxlength="40" autocomplete="nickname" @change="saveName" />
        </label>
      </section>

      <section class="group" aria-labelledby="s-keys">
        <h3 id="s-keys" class="group-title">API keys</h3>
        <KeyField
          v-model="geminiKey"
          label="Gemini API key"
          placeholder="Paste your key"
          :check="checkGeminiKey"
          @status="onGeminiStatus"
        />
        <a class="link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
          Get a free key in Google AI Studio <AppIcon name="external" :size="16" />
        </a>
        <KeyField
          v-model="groqKey"
          label="Groq API key"
          placeholder="gsk_…"
          optional
          :check="checkGroqKey"
          @status="onGroqStatus"
        />
        <p class="help">Keys are stored only in this browser.</p>
      </section>

      <section class="group" aria-labelledby="s-model">
        <h3 id="s-model" class="group-title">Model and voice</h3>
        <label class="field">
          <span class="label">Model</span>
          <select class="input" :value="settings.model" @change="chooseModel(($event.target as HTMLSelectElement).value)">
            <option value="auto">Auto (recommended)</option>
            <option v-for="m in MODELS" :key="m.id" :value="m.id">
              {{ m.label }}{{ m.supportsImages ? '' : ' (no screenshots)' }}
            </option>
          </select>
        </label>
        <label v-if="usesLiveVoice" class="field">
          <span class="label">Live voice</span>
          <select v-model="settings.liveVoice" class="input">
            <option v-for="v in LIVE_VOICES" :key="v" :value="v">{{ v }}</option>
          </select>
          <span class="help">Used by real-time Gemini Live calls. Applies to the next call.</span>
        </label>
        <label class="field">
          <span class="label">Backup voice</span>
          <select v-model="settings.browserVoice" class="input">
            <option value="">Default ({{ DEFAULT_VOICE_NAME }})</option>
            <option v-for="v in voices" :key="v.voiceURI" :value="v.voiceURI">{{ v.name }} ({{ v.lang }})</option>
          </select>
          <span class="help">Your browser's voice, used by turn-based models (Flash, Flash-Lite, Groq).</span>
        </label>
        <label class="field">
          <span class="label">Language</span>
          <select v-model="settings.language" class="input">
            <option value="English">English</option>
            <option disabled>Darija (coming later)</option>
          </select>
        </label>
      </section>

      <section class="group" aria-labelledby="s-wake">
        <h3 id="s-wake" class="group-title">Wake word</h3>
        <div class="switch-row">
          <span>
            <span class="label">Listen for “Hoy Condoriano”</span>
            <span class="help">Needs Chrome or Edge on a computer (not available on iPhone or iPad). The browser's speech service hears the mic while this is on.</span>
          </span>
          <ToggleSwitch v-model="settings.wakeWordEnabled" label="Wake word" />
        </div>
        <fieldset class="field segmented" :disabled="!settings.wakeWordEnabled">
          <legend class="label">Sensitivity</legend>
          <div class="segments">
            <label v-for="s in SENSITIVITIES" :key="s.value" class="segment">
              <input v-model="settings.wakeSensitivity" type="radio" name="sensitivity" :value="s.value" />
              <span>{{ s.label }}</span>
            </label>
          </div>
          <span class="help">Higher wakes up more easily but may trigger by mistake.</span>
        </fieldset>
      </section>

      <section class="group" aria-labelledby="s-call">
        <h3 id="s-call" class="group-title">Call</h3>
        <label class="field">
          <span class="label">Hang up after silence</span>
          <select v-model.number="settings.silenceTimeoutSec" class="input">
            <option v-for="t in TIMEOUTS" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </label>
        <div class="switch-row">
          <span>
            <span class="label">Live transcript</span>
            <span class="help">Shows what you both say during a call. Never saved.</span>
          </span>
          <ToggleSwitch v-model="settings.showTranscript" label="Live transcript" />
        </div>
      </section>

      <section v-if="folderAccessSupported()" class="group" aria-labelledby="s-folder">
        <h3 id="s-folder" class="group-title">Screenshot folder</h3>
        <div class="switch-row">
          <span>
            <span class="label">Send new BDO screenshots automatically</span>
            <span class="help">Pick Documents › Black Desert › ScreenShot. During a call, Print Screen in game sends the picture.</span>
          </span>
          <ToggleSwitch
            :model-value="settings.watchScreenshotFolder"
            label="Watch screenshot folder"
            @update:model-value="toggleFolder"
          />
        </div>
        <div class="row">
          <button type="button" class="button" @click="chooseFolder">
            <AppIcon name="folder" :size="18" /> {{ folderName ? `Folder: ${folderName}` : 'Choose folder' }}
          </button>
          <button v-if="folderName" type="button" class="button button--quiet" @click="forgetFolder">Forget</button>
        </div>
      </section>

      <section class="group" aria-labelledby="s-debug">
        <h3 id="s-debug" class="group-title">Diagnostics</h3>
        <div class="switch-row">
          <span>
            <span class="label">Debug mode</span>
            <span class="help">Shows a log of audio and connection events at the bottom of the screen, to help find problems. Nothing is saved or sent.</span>
          </span>
          <ToggleSwitch v-model="settings.debugMode" label="Debug mode" />
        </div>
      </section>

      <section class="group" aria-labelledby="s-data">
        <h3 id="s-data" class="group-title">Backup</h3>
        <label class="check">
          <input v-model="includeKeys" type="checkbox" />
          <span>Include my API keys</span>
        </label>
        <p v-if="includeKeys" class="warning" role="alert">
          <AppIcon name="alert" :size="18" />
          Anyone with this file can use your keys. Don't share it or upload it anywhere.
        </p>
        <div class="row">
          <button type="button" class="button" @click="download">
            <AppIcon name="download" :size="18" /> Export settings
          </button>
          <button type="button" class="button" @click="importInput?.click()">
            <AppIcon name="upload" :size="18" /> Import settings
          </button>
          <input ref="importInput" type="file" accept="application/json,.json" hidden @change="onImport" />
        </div>
        <button type="button" class="button button--danger" @click="reset">
          {{ confirmReset ? 'Click again to erase everything' : 'Reset all settings' }}
        </button>
      </section>
    </div>
  </dialog>
</template>

<style scoped lang="scss">
.drawer {
  width: min(460px, 100%);
  max-width: 100%;
  height: 100dvh;
  max-height: 100dvh;
  margin: 0 0 0 auto;
  padding: 0;
  border: 0;
  border-inline-start: 1px solid var(--color-outline-variant);
  background: var(--color-surface-low);
  color: var(--color-on-background);

  &::backdrop {
    background: oklch(0 0 0 / 55%);
  }

  &[open] {
    animation: slide-in 0.22s ease-out;
  }
}

.panel {
  display: grid;
  gap: 8px;
  padding: 20px 20px 40px;
}

.head {
  position: sticky;
  top: -20px;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: -20px -20px 0;
  padding: 16px 20px;
  background: var(--color-surface-low);
  border-bottom: 1px solid var(--color-outline-variant);
}

.title {
  margin: 0;
  font-size: 1.2rem;
}

.close {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--color-on-background);
  cursor: pointer;

  &:hover {
    background: var(--color-surface-high);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
}

.group {
  display: grid;
  gap: 14px;
  padding: 18px 0;
  border-bottom: 1px solid var(--color-outline-variant);

  &:last-child {
    border-bottom: 0;
  }
}

.group-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-primary);
}

.field {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.label {
  display: block;
  font-weight: 600;
  font-size: 0.95rem;
}

.help {
  display: block;
  font-size: 0.85rem;
  color: var(--color-on-surface-variant);
  line-height: 1.4;
  margin: 0;
}

.link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-self: start;
  margin-top: -6px;
  color: var(--color-primary);
  font-weight: 600;
  font-size: 0.9rem;
}

.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;

  > span {
    display: grid;
    gap: 4px;
  }
}

.segmented:disabled {
  opacity: 0.55;
}

.segments {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  border: 1px solid var(--color-outline-variant);
}

.segment {
  flex: 1;

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  span {
    display: block;
    padding: 8px;
    text-align: center;
    border-radius: var(--radius-sm);
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
  }

  input:checked + span {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }

  input:focus-visible + span {
    box-shadow: var(--focus-ring);
  }
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-outline);
  background: var(--color-surface-high);
  color: var(--color-on-background);
  font-weight: 600;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    background: color-mix(in oklab, var(--color-surface-high), currentColor 8%);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  &--quiet {
    border-color: transparent;
    background: transparent;
  }

  &--danger {
    justify-self: start;
    border-color: var(--color-error);
    background: transparent;
    color: var(--color-error);
  }
}

.check {
  display: flex;
  gap: 10px;
  align-items: center;
  font-weight: 600;

  input {
    width: 18px;
    height: 18px;
    accent-color: var(--color-primary);
  }
}

.warning {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 0;
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--color-warning-container);
  color: var(--color-on-warning-container);
  font-size: 0.9rem;

  .icon {
    color: var(--color-warning);
    margin-top: 1px;
  }
}

@keyframes slide-in {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .drawer[open] {
    animation: none;
  }
}
</style>
