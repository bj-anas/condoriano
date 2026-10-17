<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './AppIcon.vue'
import { dismiss, toasts } from '../stores/notifications'
import type { Toast, ToastAction } from '../stores/notifications'

const ICONS: Record<Toast['kind'], IconName> = {
  info: 'info',
  success: 'check',
  warning: 'alert',
  error: 'alert',
}

function run(toast: Toast, action: ToastAction): void {
  dismiss(toast.id)
  action.run()
}
</script>

<template>
  <div class="stack" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :data-kind="toast.kind"
        :role="toast.kind === 'warning' || toast.kind === 'error' ? 'alert' : 'status'"
      >
        <AppIcon :name="ICONS[toast.kind]" class="kind-icon" />
        <div class="body">
          <p class="title">{{ toast.title }}</p>
          <p v-if="toast.message" class="message">{{ toast.message }}</p>
          <div v-if="toast.actions?.length" class="actions">
            <button v-for="action in toast.actions" :key="action.label" type="button" class="action" @click="run(toast, action)">
              {{ action.label }}
            </button>
          </div>
        </div>
        <button type="button" class="close" aria-label="Dismiss" @click="dismiss(toast.id)">
          <AppIcon name="close" :size="18" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped lang="scss">
.stack {
  position: fixed;
  top: 16px;
  right: 16px;
  left: 16px;
  z-index: 50;
  display: grid;
  justify-items: end;
  gap: 10px;
  pointer-events: none;
}

.toast {
  --accent: var(--color-info);
  width: min(400px, 100%);
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px 12px 14px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-outline-variant);
  border-inline-start: 4px solid var(--accent);
  background: var(--color-surface-high);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;

  &[data-kind='success'] {
    --accent: var(--color-success);
  }

  &[data-kind='warning'] {
    --accent: var(--color-warning);
  }

  &[data-kind='error'] {
    --accent: var(--color-error);
  }
}

.kind-icon {
  color: var(--accent);
  margin-top: 1px;
}

.body {
  flex: 1;
  min-width: 0;
}

.title {
  margin: 0;
  font-weight: 700;
}

.message {
  margin: 4px 0 0;
  font-size: 0.9rem;
  line-height: 1.4;
  color: var(--color-on-surface-variant);
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.action {
  min-height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-sm);
  border: 0;
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: 700;
  cursor: pointer;

  &:hover {
    background: color-mix(in oklab, var(--color-primary), white 12%);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
}

.close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex: none;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--color-on-surface-variant);
  cursor: pointer;

  &:hover {
    background: var(--color-surface-highest);
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
