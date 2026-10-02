<script setup lang="ts">
import { computed, type HTMLAttributes } from 'vue'
import { swatchUrl } from '../render/textures'
import type { Variant } from '../types'
import { cn } from '../lib/utils'

const props = withDefaults(
  defineProps<{ variant: Variant; size?: number; class?: HTMLAttributes['class']; detail?: boolean }>(),
  { size: 96 },
)

// Show a few repeats of small patterns so swatches read at a glance.
const src = computed(() => {
  const v = props.variant
  const aspect = v.tiling === 'stretch' ? 0.74 : v.tileSizeCm.h / v.tileSizeCm.w
  return swatchUrl(v.textureUrl, v.thumbnailUrl, Math.max(64, Math.min(320, props.size * 2)), aspect)
})
const repeat = computed(() => {
  const v = props.variant
  if (v.tiling === 'stretch' || props.detail) return '100% 100%'
  const cm = Math.max(v.tileSizeCm.w, 1)
  // ~30cm of material across a swatch, clamped.
  const frac = Math.min(1, Math.max(0.25, cm / 30))
  return `${frac * 100}% auto`
})
</script>

<template>
  <span
    :class="cn('block bg-center', props.class)"
    :style="{ backgroundImage: `url(${src})`, backgroundSize: repeat, backgroundRepeat: 'repeat', backgroundColor: variant.colorHex }"
  />
</template>
