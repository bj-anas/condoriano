<script setup lang="ts">
import { computed, ref } from 'vue'
import { diag } from '../stores/diag'
import { isIOS } from '../audio/speech'

const open = ref(true)
const copied = ref(false)

const header = computed(
  () => `${isIOS() ? 'iOS' : 'not iOS'} · chunks ${diag.audioChunks} · ${diag.playing ? 'playing' : 'silent'}`,
)

async function copy(): Promise<void> {
  const text = [navigator.userAgent, header.value, ...diag.lines].join('\n')
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <section class="debug" aria-label="Diagnostics">
    <header class="bar">
      <button type="button" class="toggle" @click="open = !open">Debug · {{ header }}</button>
      <button type="button" class="copy" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
    </header>
    <ol v-if="open" class="lines">
      <li v-for="(line, i) in diag.lines" :key="i">{{ line }}</li>
      <li v-if="!diag.lines.length">Start a call to see audio events.</li>
    </ol>
  </section>
</template>

<style scoped lang="scss">
.debug {
  position: fixed;
  left: 8px;
  right: 8px;
  bottom: 8px;
  z-index: 70;
  max-height: 40dvh;
  display: grid;
  grid-template-rows: auto 1fr;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-outline);
  background: oklch(0.1 0.01 75 / 92%);
  color: var(--color-on-background);
  font-family: var(--font-mono);
  font-size: 11px;
}

.bar {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-outline-variant);
}

.toggle,
.copy {
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.toggle {
  flex: 1;
  text-align: start;
}

.copy {
  color: var(--color-primary);
}

.lines {
  margin: 0;
  padding: 6px 8px;
  overflow-y: auto;
  list-style: none;
  line-height: 1.5;
}
</style>
