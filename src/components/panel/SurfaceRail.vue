<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { cn } from '../../lib/utils'
import { useVisualizer } from '../context'
import Swatch from '../Swatch.vue'

const { state, renderer, roomReady, ui } = useVisualizer()
const { room, selectedSurfaceId, previewSurfaceId } = state
const rail = ref<HTMLDivElement>()

const items = computed(() =>
  roomReady.value && room.value
    ? room.value.surfaces.map((s) => ({
        surface: s,
        thumb: renderer.value?.surfaceThumbnail(s.id, 96),
        applied: state.appliedBySurface.value.get(s.id),
      }))
    : [],
)

watch(selectedSurfaceId, async (id) => {
  await nextTick()
  rail.value?.querySelector<HTMLElement>(`[data-surface="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
})

function pick(id: string) {
  selectedSurfaceId.value = id
  ui.detailProductId.value = null
}
</script>

<template>
  <div ref="rail" class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
    <button
      v-for="it in items"
      :key="it.surface.id"
      type="button"
      :data-surface="it.surface.id"
      :aria-pressed="selectedSurfaceId === it.surface.id"
      :class="
        cn(
          'group relative w-[4.75rem] shrink-0 rounded-xl p-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selectedSurfaceId === it.surface.id ? 'bg-primary/10' : 'hover:bg-accent',
        )
      "
      @click="pick(it.surface.id)"
      @mouseenter="previewSurfaceId = it.surface.id"
      @mouseleave="previewSurfaceId = null"
    >
      <span
        :class="
          cn(
            'relative block aspect-square overflow-hidden rounded-lg ring-1 ring-border transition-shadow',
            selectedSurfaceId === it.surface.id && 'ring-2 ring-primary',
          )
        "
      >
        <img v-if="it.thumb" :src="it.thumb" alt="" class="h-full w-full object-cover" />
        <span v-else class="block h-full w-full animate-pulse bg-muted" />
        <Swatch
          v-if="it.applied"
          :variant="it.applied.variant"
          :size="20"
          class="absolute bottom-1 right-1 h-5 w-5 rounded-full ring-2 ring-white"
        />
      </span>
      <span class="mt-1 block truncate text-center text-[11px] font-medium leading-tight">{{ it.surface.label }}</span>
    </button>
  </div>
</template>
