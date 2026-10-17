<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import logoUrl from '../assets/condoriano-logo.png'
import KeyField from './KeyField.vue'
import type { KeyStatus } from './KeyField.vue'
import { requestPersistentStorage, settings } from '../stores/settings'
import { checkGeminiKey, checkGroqKey } from '../call/keys'
import { unlockAudio } from '../audio/context'
import { notify } from '../stores/notifications'

const name = ref(settings.userName)
const geminiKey = ref(settings.geminiKey)
const groqKey = ref(settings.groqKey)
const geminiStatus = ref<KeyStatus>('idle')
const showGroq = ref(!!settings.groqKey)
const starting = ref(false)
const geminiField = ref<InstanceType<typeof KeyField>>()

const canStart = computed(() => !!name.value.trim() && geminiStatus.value === 'valid' && !starting.value)

async function start(): Promise<void> {
  const keyIsValid = () => geminiStatus.value === 'valid'
  if (!keyIsValid()) {
    await geminiField.value?.validate()
    if (!keyIsValid()) return
  }
  if (!name.value.trim()) return
  starting.value = true
  unlockAudio()
  // Ask for the microphone now, while we have a click, so the wake word can start right away.
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
  } catch {
    notify({
      kind: 'warning',
      title: 'Microphone blocked',
      message: 'Condoriano needs the mic to hear you. Allow it from the address bar, then reload.',
    })
  }
  requestPersistentStorage()
  settings.groqKey = groqKey.value.trim()
  settings.geminiKey = geminiKey.value.trim()
  settings.userName = name.value.trim()
  starting.value = false
}
</script>

<template>
  <main class="setup">
    <section class="card" aria-labelledby="setup-title">
      <header class="intro">
        <img class="emblem" :src="logoUrl" alt="" width="72" height="72" />
        <h1 id="setup-title" class="wordmark">Condoriano</h1>
        <p class="tagline">Your Black Desert voice companion. Talk to it like a friend on a call.</p>
      </header>

      <form class="form" @submit.prevent="start">
        <div class="field">
          <label for="setup-name" class="label">What should Condoriano call you?</label>
          <input id="setup-name" v-model="name" class="input" placeholder="Your name" autocomplete="nickname" maxlength="40" />
        </div>

        <div class="field">
          <KeyField
            ref="geminiField"
            v-model="geminiKey"
            label="Your free Gemini API key"
            placeholder="Paste your key"
            :check="checkGeminiKey"
            @status="geminiStatus = $event"
          />
          <a class="link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
            Get a free key in Google AI Studio
            <AppIcon name="external" :size="16" />
          </a>
        </div>

        <div class="field">
          <button v-if="!showGroq" type="button" class="text-button" @click="showGroq = true">
            + Add a Groq key as a backup (optional)
          </button>
          <template v-else>
            <KeyField
              v-model="groqKey"
              label="Groq API key"
              placeholder="gsk_…"
              optional
              :check="checkGroqKey"
            />
            <p class="help">Used only when your Gemini free limits run out.</p>
          </template>
        </div>

        <ul class="tips">
          <li><AppIcon name="info" :size="18" /> Your keys stay in this browser. They are never sent anywhere except to Google or Groq.</li>
        </ul>

        <button type="submit" class="primary" :disabled="!canStart">
          {{ starting ? 'Starting…' : 'Start' }}
        </button>
      </form>
    </section>
  </main>
</template>

<style scoped lang="scss">
.setup {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 32px 16px;
}

.card {
  width: min(560px, 100%);
  padding: clamp(24px, 5vw, 40px);
  border-radius: var(--radius-lg);
  background: var(--color-surface-low);
  border: 1px solid var(--color-outline-variant);
  box-shadow: var(--shadow-lg);
}

.intro {
  text-align: center;
  margin-bottom: 28px;
}

.emblem {
  width: 100px;
  height: 100px;
  display: block;
  margin: 0 auto 16px;
  object-fit: contain;
}

.wordmark {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  letter-spacing: 0.04em;
  color: var(--color-primary);

  @media (min-width: 768px) {
    font-size: 25px;
  }
}

.tagline {
  margin: 8px 0 0;
  color: var(--color-on-surface-variant);
}

.form {
  display: grid;
  gap: 24px;
}

.field {
  display: grid;
  gap: 8px;
}

.label {
  font-weight: 600;
  font-size: 0.95rem;
}

.link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-self: start;
  color: var(--color-primary);
  font-weight: 600;
  text-underline-offset: 3px;
}

.text-button {
  justify-self: start;
  padding: 8px 0;
  border: 0;
  background: none;
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    border-radius: var(--radius-sm);
  }
}

.help {
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-on-surface-variant);
}

.tips {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 16px;
  list-style: none;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-on-surface-variant);
  font-size: 0.9rem;

  li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .icon {
    margin-top: 1px;
    color: var(--color-primary);
  }
}

.primary {
  min-height: 52px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease;

  &:hover:not(:disabled) {
    background: color-mix(in oklab, var(--color-primary), white 10%);
  }

  &:disabled {
    background: color-mix(in srgb, var(--color-on-background) 14%, transparent);
    color: color-mix(in srgb, var(--color-on-background) 45%, transparent);
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
}
</style>
