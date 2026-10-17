<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { call } from '../call/call'
import { settings } from '../stores/settings'

const list = ref<HTMLElement>()

watch(
  () => call.transcript.map((l) => l.text.length).join(),
  async () => {
    await nextTick()
    list.value?.scrollTo({ top: list.value.scrollHeight })
  },
)
</script>

<template>
  <section class="transcript" aria-label="Live transcript" aria-live="polite">
    <header class="head">
      <h2 class="title">Live transcript</h2>
      <span class="note">Not saved</span>
    </header>
    <ol v-if="call.transcript.length" ref="list" class="lines">
      <li v-for="line in call.transcript" :key="line.id" class="line" :data-role="line.role" :data-final="line.final">
        <span class="who">{{ line.role === 'user' ? settings.userName || 'You' : 'Condoriano' }}</span>
        <span class="text">{{ line.text }}</span>
      </li>
    </ol>
    <p v-else class="empty">What you and Condoriano say will show up here during a call.</p>
  </section>
</template>

<style scoped lang="scss">
.transcript {
  width: min(640px, 100%);
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  background: var(--color-surface-low);
  border: 1px solid var(--color-outline-variant);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-on-surface-variant);
}

.note {
  font-size: 0.8rem;
  color: var(--color-on-surface-variant);
}

.lines {
  display: grid;
  gap: 10px;
  max-height: 200px;
  margin: 0;
  padding: 0 4px 0 0;
  overflow-y: auto;
  list-style: none;
}

.line {
  display: grid;
  gap: 2px;

  &[data-final='false'] .text {
    opacity: 0.8;
  }

  &[data-role='assistant'] .who {
    color: var(--color-primary);
  }
}

.who {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-on-surface-variant);
}

.text {
  line-height: 1.45;
}

.empty {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-on-surface-variant);
}
</style>
