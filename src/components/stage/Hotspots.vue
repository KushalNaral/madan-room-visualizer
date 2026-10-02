<script setup lang="ts">
import { computed, ref } from 'vue'
import { Plus } from 'lucide-vue-next'
import type { Surface } from '../../types'
import { cn } from '../../lib/utils'
import { useVisualizer } from '../context'
import Swatch from '../Swatch.vue'

defineProps<{ zoom: number }>()
const emit = defineEmits<{ hover: [surface: Surface | null] }>()

const { state, surfaceInfo, ui } = useVisualizer()
const { room, selectedSurfaceId } = state
/** Pulse unstyled pins until the shopper first interacts. */
const interacted = ref(false)

const pins = computed(() => {
  const r = room.value
  if (!r) return []
  return r.surfaces
    .map((s) => ({ surface: s, info: surfaceInfo.value.get(s.id), applied: state.appliedBySurface.value.get(s.id) }))
    .filter((p) => p.info && p.info.coverage > 0.002)
    .map((p) => ({ ...p, left: (p.info!.anchor.x / r.width) * 100, top: (p.info!.anchor.y / r.height) * 100 }))
})

function select(id: string) {
  interacted.value = true
  selectedSurfaceId.value = id
  ui.tab.value = 'materials'
  ui.detailProductId.value = null
}
</script>

<template>
  <div class="pointer-events-none absolute inset-0">
    <div
      v-for="(p, i) in pins"
      :key="p.surface.id"
      class="group pointer-events-auto absolute animate-rise-in"
      :style="{ left: `${p.left}%`, top: `${p.top}%`, transform: `translate(-50%, -50%) scale(${1 / zoom})`, animationDelay: `${i * 40}ms` }"
    >
      <button
        type="button"
        :aria-label="`Style ${p.surface.label}`"
        :class="
          cn(
            'relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-white/90 text-neutral-800 shadow-[0_4px_14px_rgba(0,0,0,0.35)] backdrop-blur transition-all duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            selectedSurfaceId === p.surface.id && 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-transparent',
          )
        "
        @click.stop="select(p.surface.id)"
        @mouseenter="emit('hover', p.surface)"
        @mouseleave="emit('hover', null)"
        @focus="emit('hover', p.surface)"
        @blur="emit('hover', null)"
      >
        <span
          v-if="!p.applied && !interacted && selectedSurfaceId !== p.surface.id"
          class="absolute inset-0 animate-pin-pulse rounded-full bg-white"
        />
        <Swatch v-if="p.applied" :variant="p.applied.variant" :size="32" class="h-full w-full rounded-full" />
        <Plus v-else class="relative h-4 w-4" :stroke-width="2.5" />
      </button>
      <span
        class="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white opacity-0 shadow backdrop-blur transition-opacity duration-150 group-hover:opacity-100"
      >
        {{ p.surface.label }}
      </span>
    </div>
  </div>
</template>
