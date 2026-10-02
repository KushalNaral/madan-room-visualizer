<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SliderRange, SliderRoot, SliderThumb, SliderTrack, useForwardPropsEmits, type SliderRootEmits, type SliderRootProps } from 'reka-ui'
import { cn } from '../../../lib/utils'

const props = defineProps<SliderRootProps & { class?: HTMLAttributes['class']; label?: string }>()
const emits = defineEmits<SliderRootEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <SliderRoot v-bind="forwarded" :class="cn('relative flex w-full touch-none select-none items-center', props.class)">
    <SliderTrack class="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
      <SliderRange class="absolute h-full bg-primary" />
    </SliderTrack>
    <SliderThumb
      v-for="(_, i) in modelValue ?? defaultValue ?? [0]"
      :key="i"
      :aria-label="label"
      class="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
    />
  </SliderRoot>
</template>
