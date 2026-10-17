<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { CallState } from '../ai/types'
import { levels } from '../call/call'

const props = defineProps<{ state: CallState }>()
const root = ref<HTMLElement>()
let frame = 0
let smoothed = 0

// Audio levels drive CSS variables; requestAnimationFrame pauses in background tabs, which is fine for visuals.
function tick(): void {
  const { input, output } = levels()
  const raw = props.state === 'speaking' ? output * 3 : props.state === 'listening' ? input * 4 : 0
  const target = Math.min(1, raw)
  smoothed += (target - smoothed) * (target > smoothed ? 0.35 : 0.08)
  root.value?.style.setProperty('--level', smoothed.toFixed(3))
  frame = requestAnimationFrame(tick)
}

onMounted(() => {
  frame = requestAnimationFrame(tick)
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
</script>

<template>
  <div ref="root" class="orb" :data-state="state" aria-hidden="true">
    <div class="halo" />
    <div class="ring ring--1" />
    <div class="ring ring--2" />
    <div class="spinner" />
    <div class="core" />
  </div>
</template>

<style scoped lang="scss">
.orb {
  --level: 0;
  --size: clamp(200px, 46vmin, 300px);
  position: relative;
  width: var(--size);
  height: var(--size);
  display: grid;
  place-items: center;
}

.halo,
.ring,
.spinner,
.core {
  position: absolute;
  border-radius: 50%;
}

.halo {
  inset: 4%;
  background: radial-gradient(circle, color-mix(in srgb, var(--color-primary) 45%, transparent), transparent 68%);
  filter: blur(18px);
  opacity: calc(0.25 + var(--level) * 0.75);
  transform: scale(calc(0.9 + var(--level) * 0.35));
  transition: opacity 0.3s ease;
}

.ring {
  inset: 14%;
  border: 1.5px solid color-mix(in srgb, var(--color-primary) 55%, transparent);
  opacity: 0;
}

.spinner {
  inset: 12%;
  background: conic-gradient(from 0deg, transparent 0 70%, var(--color-primary) 100%);
  mask: radial-gradient(circle, transparent 64%, #000 65.5% 67%, transparent 68.5%);
  opacity: 0;
}

.core {
  inset: 22%;
  display: grid;
  place-items: center;
  color: var(--color-on-primary);
  background: radial-gradient(
    circle at 50% 38%,
    color-mix(in oklab, var(--color-primary), white 22%),
    var(--color-primary) 45%,
    color-mix(in oklab, var(--color-primary), black 45%) 100%
  );
  box-shadow:
    inset 0 -10px 30px color-mix(in srgb, black 35%, transparent),
    0 0 50px color-mix(in srgb, var(--color-primary) 35%, transparent);
  transform: scale(calc(1 + var(--level) * 0.12));
  transition: filter 0.4s ease;
}

.orb[data-state='idle'] {
  .core {
    filter: saturate(0.55) brightness(0.72);
    animation: breathe 4.5s ease-in-out infinite;
  }
}

.orb[data-state='connecting'] .spinner {
  opacity: 1;
  animation: spin 1.1s linear infinite;
}

.orb[data-state='thinking'] {
  .spinner {
    opacity: 0.8;
    animation: spin 2.2s linear infinite;
  }

  .core {
    animation: breathe 1.6s ease-in-out infinite;
  }
}

.orb[data-state='listening'] .ring--1 {
  opacity: calc(0.25 + var(--level));
  transform: scale(calc(1.08 + var(--level) * 0.25));
}

.orb[data-state='speaking'] .ring {
  animation: ripple 1.8s ease-out infinite;
}

.orb[data-state='speaking'] .ring--2 {
  animation-delay: 0.9s;
}

@keyframes breathe {
  50% {
    transform: scale(1.03);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes ripple {
  from {
    opacity: 0.7;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(1.55);
  }
}

@media (prefers-reduced-motion: reduce) {
  .orb * {
    animation: none !important;
    transition: none !important;
  }

  .orb[data-state='connecting'] .spinner,
  .orb[data-state='thinking'] .spinner {
    opacity: 0.6;
  }
}
</style>
