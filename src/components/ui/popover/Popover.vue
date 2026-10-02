<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { cn } from '../../../lib/utils'

const props = withDefaults(
  defineProps<{ side?: 'top' | 'bottom' | 'left' | 'right'; align?: 'start' | 'center' | 'end'; class?: HTMLAttributes['class'] }>(),
  { side: 'top', align: 'center' },
)
const open = defineModel<boolean>('open')
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <slot name="trigger" />
    </PopoverTrigger>
    <PopoverPortal>
      <PopoverContent
        :side="props.side"
        :align="props.align"
        :side-offset="8"
        :class="cn('z-[60] w-72 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none animate-in fade-in-0 zoom-in-95', props.class)"
      >
        <slot />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
