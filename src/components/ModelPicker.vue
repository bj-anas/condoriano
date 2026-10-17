<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { MODELS } from '../ai/models'
import type { ModelOption } from '../ai/types'
import { autoModel, call, chooseModel, unavailableReason } from '../call/call'
import { settings } from '../stores/settings'
import { closeModelPicker, ui } from '../stores/ui'

const dialog = ref<HTMLDialogElement>()

// Re-evaluated whenever the dialog opens, so "limit reached" timers stay fresh.
const opened = ref(0)
const rows = computed(() => {
  void opened.value
  void call.exhausted
  return MODELS.map((model) => ({ model, reason: unavailableReason(model), unlisted: isUnlisted(model) }))
})
const autoPreview = computed(() => {
  void opened.value
  const pick = autoModel()
  return pick ? `Right now it starts with ${pick.label}` : 'No model is available right now'
})

function isUnlisted(model: ModelOption): boolean {
  return model.provider === 'gemini' && settings.geminiModels.length > 0 && !settings.geminiModels.includes(model.apiModel)
}

watch(
  () => ui.modelPicker.open,
  (open) => {
    if (open) {
      opened.value++
      if (!dialog.value?.open) dialog.value?.showModal()
    } else if (dialog.value?.open) {
      dialog.value.close()
    }
  },
)

onMounted(() => {
  if (ui.modelPicker.open) dialog.value?.showModal()
})

async function pick(id: string): Promise<void> {
  closeModelPicker()
  await chooseModel(id)
}

function openSettings(): void {
  closeModelPicker()
  ui.settingsOpen = true
}

function onBackdrop(e: MouseEvent): void {
  if (e.target === dialog.value) closeModelPicker()
}
</script>

<template>
  <dialog ref="dialog" class="picker" aria-labelledby="picker-title" @close="closeModelPicker" @click="onBackdrop">
    <div class="sheet">
      <header class="head">
        <h2 id="picker-title" class="title">Choose a model</h2>
        <button type="button" class="close" aria-label="Close" @click="closeModelPicker">
          <AppIcon name="close" />
        </button>
      </header>

      <p v-if="ui.modelPicker.reason" class="reason" role="alert">
        <AppIcon name="alert" :size="18" />
        {{ ui.modelPicker.reason }}
      </p>

      <ul class="list">
        <li>
          <button type="button" class="row" :aria-pressed="settings.model === 'auto'" @click="pick('auto')">
            <span class="row-main">
              <span class="name">Auto <span class="recommended">recommended</span></span>
              <span class="desc">
                Real-time voice first. If a limit is hit it falls back to Flash for screenshots and harder
                questions, Flash-Lite for the rest, then Groq. {{ autoPreview }}.
              </span>
            </span>
            <AppIcon v-if="settings.model === 'auto'" name="check" class="selected" />
          </button>
        </li>
        <li v-for="{ model, reason, unlisted } in rows" :key="model.id">
          <button
            type="button"
            class="row"
            :aria-pressed="settings.model === model.id"
            :disabled="!!reason && !reason.startsWith('Needs')"
            @click="reason?.startsWith('Needs') ? openSettings() : pick(model.id)"
          >
            <span class="row-main">
              <span class="name">{{ model.label }}</span>
              <span class="desc">{{ model.description }}</span>
              <span class="badges">
                <span class="badge" :data-tone="model.engine === 'live' ? 'primary' : 'neutral'">
                  {{ model.engine === 'live' ? 'Real-time voice' : 'Turn-based voice' }}
                </span>
                <span v-if="model.supportsImages" class="badge" data-tone="neutral">
                  <AppIcon name="image" :size="14" /> Screenshots
                </span>
                <span v-else class="badge" data-tone="warning">
                  <AppIcon name="alert" :size="14" /> Can't see screenshots
                </span>
                <span v-if="reason" class="badge" data-tone="warning">
                  {{ reason.startsWith('Needs') ? `${reason} · add it in Settings` : reason }}
                </span>
                <span v-else-if="unlisted" class="badge" data-tone="warning">Not listed for your key</span>
              </span>
            </span>
            <AppIcon v-if="settings.model === model.id" name="check" class="selected" />
          </button>
        </li>
      </ul>

      <p class="foot">
        Free limits change often. Check the current ones in
        <a href="https://aistudio.google.com/usage" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.
      </p>
    </div>
  </dialog>
</template>

<style scoped lang="scss">
.picker {
  width: min(600px, calc(100% - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border: 1px solid var(--color-outline-variant);
  border-radius: var(--radius-lg);
  background: var(--color-surface-low);
  color: var(--color-on-background);
  box-shadow: var(--shadow-lg);

  &::backdrop {
    background: oklch(0 0 0 / 60%);
    backdrop-filter: blur(2px);
  }
}

.sheet {
  display: grid;
  gap: 14px;
  padding: 20px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.reason {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--color-warning-container);
  color: var(--color-on-warning-container);
  font-weight: 600;

  .icon {
    color: var(--color-warning);
    margin-top: 1px;
  }
}

.list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  width: 100%;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px;
  text-align: start;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-outline-variant);
  background: var(--color-surface);
  color: var(--color-on-background);
  font: inherit;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--color-surface-high);
  }

  &[aria-pressed='true'] {
    border-color: var(--color-primary);
    background: color-mix(in oklab, var(--color-surface), var(--color-primary) 8%);
  }

  &:disabled {
    cursor: not-allowed;

    .name,
    .desc {
      opacity: 0.7;
    }
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
}

.row-main {
  flex: 1;
  display: grid;
  gap: 4px;
  min-width: 0;
}

.name {
  font-weight: 700;
}

.recommended {
  margin-inline-start: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-primary-container);
  color: var(--color-on-primary-container);
  font-size: 0.75rem;
  font-weight: 600;
}

.desc {
  font-size: 0.9rem;
  color: var(--color-on-surface-variant);
  line-height: 1.4;
}

.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: var(--color-surface-highest);
  color: var(--color-on-background);

  &[data-tone='primary'] {
    background: var(--color-primary-container);
    color: var(--color-on-primary-container);
  }

  &[data-tone='warning'] {
    background: var(--color-warning-container);
    color: var(--color-on-warning-container);
  }
}

.selected {
  color: var(--color-primary);
  margin-top: 2px;
}

.foot {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-on-surface-variant);

  a {
    color: var(--color-primary);
  }
}
</style>
