<script setup lang="ts">
const model = defineModel<boolean>({ required: true })
defineProps<{ label: string; disabled?: boolean }>()
</script>

<template>
  <button
    type="button"
    role="switch"
    class="switch"
    :aria-checked="model"
    :aria-label="label"
    :disabled="disabled"
    @click="model = !model"
  >
    <span class="thumb" />
  </button>
</template>

<style scoped lang="scss">
.switch {
  position: relative;
  flex: none;
  width: 44px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid var(--color-outline);
  background: var(--color-surface-highest);
  cursor: pointer;
  transition: background-color 0.18s ease, border-color 0.18s ease;

  &[aria-checked='true'] {
    background: var(--color-primary);
    border-color: var(--color-primary);

    .thumb {
      transform: translateX(18px);
      background: var(--color-on-primary);
    }
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
}

.thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-on-surface-variant);
  transition: transform 0.18s ease, background-color 0.18s ease;
}
</style>
