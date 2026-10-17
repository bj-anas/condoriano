<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

export type KeyStatus = 'idle' | 'checking' | 'valid' | 'invalid'

const key = defineModel<string>({ required: true })
const props = defineProps<{
  label: string
  placeholder: string
  /** Throws with a readable message when the key doesn't work; resolves with a success note. */
  check: (key: string) => Promise<string>
  optional?: boolean
}>()
const emit = defineEmits<{ status: [KeyStatus] }>()

const status = ref<KeyStatus>(key.value ? 'idle' : 'idle')
const message = ref('')
const reveal = ref(false)
const input = ref<HTMLInputElement>()
const inputId = `key-${Math.random().toString(36).slice(2, 8)}`

const statusClass = computed(() => `status--${status.value}`)

watch(status, (s) => emit('status', s))

async function validate(): Promise<void> {
  const value = key.value.trim()
  key.value = value
  if (!value) {
    status.value = 'idle'
    message.value = ''
    return
  }
  status.value = 'checking'
  message.value = 'Checking the key…'
  try {
    message.value = await props.check(value)
    status.value = 'valid'
  } catch (err) {
    status.value = 'invalid'
    message.value = err instanceof Error ? err.message : String(err)
  }
}

async function paste(): Promise<void> {
  try {
    const text = (await navigator.clipboard.readText()).trim()
    if (text) {
      key.value = text
      await validate()
      return
    }
  } catch {
    // clipboard permission refused: fall back to manual paste
  }
  input.value?.focus()
  message.value = 'Press Ctrl+V (or ⌘V) to paste your key here.'
}

defineExpose({ validate })
</script>

<template>
  <div class="key-field">
    <label :for="inputId" class="label">
      {{ label }}
      <span v-if="optional" class="optional">optional</span>
    </label>
    <div class="row">
      <input
        :id="inputId"
        ref="input"
        v-model="key"
        class="input"
        :type="reveal ? 'text' : 'password'"
        :placeholder="placeholder"
        autocomplete="off"
        spellcheck="false"
        @change="validate"
      />
      <button type="button" class="ghost" :aria-pressed="reveal" @click="reveal = !reveal">
        {{ reveal ? 'Hide' : 'Show' }}
      </button>
      <button type="button" class="paste" @click="paste">
        <AppIcon name="clipboard" :size="18" />
        Paste key
      </button>
    </div>
    <p v-if="message" class="status" :class="statusClass" role="status">
      <AppIcon v-if="status === 'valid'" name="check" :size="16" />
      <AppIcon v-else-if="status === 'invalid'" name="alert" :size="16" />
      <span v-else-if="status === 'checking'" class="spinner" aria-hidden="true" />
      {{ message }}
    </p>
  </div>
</template>

<style scoped lang="scss">
.key-field {
  display: grid;
  gap: 8px;
}

.label {
  font-weight: 600;
  font-size: 0.95rem;
}

.optional {
  margin-inline-start: 6px;
  font-weight: 400;
  font-size: 0.8rem;
  opacity: 0.8;
}

.row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.input {
  flex: 1 1 220px;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 0.9rem;
}

.ghost,
.paste {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  min-height: 44px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-outline);
  background: var(--color-surface-high);
  color: var(--color-on-background);
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: color-mix(in oklab, var(--color-surface-high), currentColor 8%);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
}

.paste {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 0.875rem;
  color: var(--color-on-surface-variant);

  &--valid {
    color: var(--color-success);
  }

  &--invalid {
    color: var(--color-error);
  }
}

.spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid currentColor;
  border-right-color: transparent;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
