<script setup lang="ts">
import { TooltipContent, TooltipPortal, TooltipRoot, TooltipTrigger } from 'reka-ui'

/** Compact tooltip: wraps a single trigger element. */
withDefaults(defineProps<{ text?: string; side?: 'top' | 'bottom' | 'left' | 'right'; shortcut?: string; disabled?: boolean }>(), {
  side: 'bottom',
})
</script>

<template>
  <TooltipRoot :delay-duration="250" :disabled="disabled || !text">
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent
        :side="side"
        :side-offset="6"
        class="z-[60] flex items-center gap-2 rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow-md animate-in fade-in-0 zoom-in-95"
      >
        {{ text }}
        <kbd v-if="shortcut" class="rounded border border-background/30 px-1 font-mono text-[10px] opacity-80">{{ shortcut }}</kbd>
      </TooltipContent>
    </TooltipPortal>
  </TooltipRoot>
</template>
