<script setup lang="ts">
import { computed } from 'vue'
import type { QuotaInfo } from '../stores/quota'

const props = withDefaults(
  defineProps<{
    info: QuotaInfo
    /** Model name, used in the tooltip */
    label: string
    size?: number
    /** Tooltip position: under the ring's right edge, or centered under it */
    align?: 'end' | 'center'
  }>(),
  { size: 20, align: 'end' },
)

const RADIUS = 8
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Blue until 80 %, yellow from 80 %, red from 90 %. */
const tone = computed(() => {
  const p = props.info.percent ?? 0
  if (p >= 90) return 'red'
  if (p >= 80) return 'yellow'
  return 'blue'
})

const fraction = computed(() => {
  const p = props.info.percent
  if (p === null) return 0
  return p > 0 ? Math.max(0.04, p / 100) : 0
})

const updated = computed(() =>
  props.info.asOf ? new Date(props.info.asOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
)

const tooltip = computed(() => {
  const { info, label } = props
  if (info.percent === null) {
    return `${label}: no usage reported by Google for this model yet.${updated.value ? ` Checked ${updated.value}.` : ''}`
  }
  const pct = Math.round(info.percent)
  const head = pct >= 100 ? `${label}: 100% used, daily limit reached` : `${label}: ${pct}% used`
  return `${head}, ${info.used} of ${info.limit} requests today. From Google Cloud Monitoring, updated ${updated.value} (can lag a few minutes). Resets at midnight Pacific time.`
})
</script>

<template>
  <span class="quota" :data-tone="tone" :data-align="align" role="img" :aria-label="tooltip">
    <svg :width="size" :height="size" viewBox="0 0 20 20" aria-hidden="true">
      <circle class="track" cx="10" cy="10" :r="RADIUS" />
      <circle
        class="bar"
        cx="10"
        cy="10"
        :r="RADIUS"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="CIRCUMFERENCE * (1 - fraction)"
      />
    </svg>
    <span class="tip" aria-hidden="true">{{ tooltip }}</span>
  </span>
</template>

<style scoped lang="scss">
.quota {
  --ring: var(--color-info);
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: none;

  &[data-tone='yellow'] {
    --ring: var(--color-warning);
  }

  &[data-tone='red'] {
    --ring: var(--color-error);
  }

  &:hover .tip {
    opacity: 1;
    transform: translateY(0);
  }

  &[data-align='center'] .tip {
    right: auto;
    left: 50%;
    translate: -50% 0;
  }
}

svg {
  display: block;
  transform: rotate(-90deg);
}

.track,
.bar {
  fill: none;
  stroke-width: 3;
}

.track {
  stroke: var(--color-surface-highest);
}

.bar {
  stroke: var(--ring);
  stroke-linecap: round;
  transition: stroke-dashoffset 0.4s ease, stroke 0.3s ease;
}

.tip {
  position: absolute;
  top: calc(100% + 8px);
  right: -6px;
  z-index: 5;
  width: max-content;
  max-width: 240px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-outline-variant);
  background: var(--color-surface-highest);
  color: var(--color-on-background);
  font-size: 0.8rem;
  font-weight: 500;
  line-height: 1.4;
  text-align: start;
  white-space: normal;
  pointer-events: none;
  opacity: 0;
  transform: translateY(-4px);
  transition: opacity 0.15s ease, transform 0.15s ease;
  box-shadow: var(--shadow-lg);
}

@media (prefers-reduced-motion: reduce) {
  .bar,
  .tip {
    transition: none;
  }
}
</style>
