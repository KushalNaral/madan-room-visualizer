<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { cn } from '../../lib/utils'
import { useVisualizer } from '../context'

const { state } = useVisualizer()
const { rooms, room } = state
</script>

<template>
  <div class="flex items-center gap-3 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:thin]">
    <span class="hidden shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:block">Rooms</span>
    <button
      v-for="r in rooms"
      :key="r.id"
      type="button"
      :aria-pressed="r.id === room?.id"
      :class="
        cn(
          'group relative flex shrink-0 items-center gap-2.5 rounded-xl border bg-background p-1.5 pr-3.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          r.id === room?.id ? 'border-primary ring-1 ring-primary' : 'border-border',
        )
      "
      @click="r.id !== room?.id && state.loadRoom(r.id)"
    >
      <span class="relative block h-10 w-16 overflow-hidden rounded-lg bg-muted">
        <img :src="r.thumbnailUrl ?? r.imageUrl" :alt="r.name" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110" draggable="false" />
        <span v-if="r.id === room?.id" class="absolute inset-0 flex items-center justify-center bg-primary/40">
          <Check class="h-4 w-4 text-white" :stroke-width="3" />
        </span>
      </span>
      <span>
        <span class="block text-sm font-medium leading-tight">{{ r.name }}</span>
        <span class="block text-[11px] text-muted-foreground">{{ r.surfaces.length }} surfaces</span>
      </span>
    </button>
  </div>
</template>
