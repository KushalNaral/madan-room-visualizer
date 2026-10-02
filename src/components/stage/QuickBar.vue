<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { ChevronRight, SlidersHorizontal, Trash2, X } from 'lucide-vue-next'
import type { Product, Variant } from '../../types'
import { cn } from '../../lib/utils'
import { useVisualizer } from '../context'
import { Popover } from '../ui/popover'
import { Tip } from '../ui/tooltip'
import PatternControls from '../panel/PatternControls.vue'
import Swatch from '../Swatch.vue'

const ctx = useVisualizer()
const { state, renderer, ui } = ctx
const { selectedSurface, selectedSurfaceId } = state

const current = computed(() => (selectedSurface.value ? state.appliedBySurface.value.get(selectedSurface.value.id) : undefined))
const adjustOpen = ref(false)

/** When nothing is applied yet, suggest a few products the surface accepts. */
const suggestions = shallowRef<{ product: Product; variant: Variant }[]>([])
watch(
  () => selectedSurface.value?.id,
  async () => {
    const s = selectedSurface.value
    suggestions.value = []
    if (!s) return
    const page = await ctx.source.listProducts({ categoryIds: s.accepts, pageSize: 12 })
    if (s.id !== selectedSurface.value?.id) return
    suggestions.value = page.items.slice(0, 7).map((p) => ({ product: p, variant: p.variants[0] }))
  },
  { immediate: true },
)

const thumb = computed(() => (selectedSurface.value ? renderer.value?.surfaceThumbnail(selectedSurface.value.id, 96) : undefined))

function openDetails() {
  if (current.value) ctx.actions.openProduct(current.value.product)
  ui.tab.value = 'materials'
}
</script>

<template>
  <Transition
    enter-from-class="opacity-0 translate-y-3"
    enter-active-class="transition duration-300 ease-out"
    leave-active-class="transition duration-200 ease-in"
    leave-to-class="opacity-0 translate-y-3"
  >
    <div
      v-if="selectedSurface && !ui.compare.value"
      :key="selectedSurface.id"
      class="absolute bottom-3 left-1/2 z-30 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-border/60 bg-background/85 p-2 pr-2.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)] backdrop-blur-xl"
    >
      <img v-if="thumb" :src="thumb" alt="" class="hidden h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-border sm:block" />
      <div class="min-w-0 max-w-[11rem]">
        <p class="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{{ selectedSurface.label }}</p>
        <button
          v-if="current"
          type="button"
          class="flex max-w-full items-center gap-0.5 truncate text-sm font-semibold hover:underline"
          @click="openDetails"
        >
          <span class="truncate">{{ current.product.name }}</span><ChevronRight class="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
        <p v-else class="truncate text-sm font-medium">Pick a material</p>
      </div>

      <div class="h-8 w-px shrink-0 bg-border" />

      <div class="flex min-w-0 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none]">
        <template v-if="current">
          <Tip v-for="v in current.product.variants" :key="v.id" :text="v.name" side="top">
            <button
              type="button"
              :aria-label="v.name"
              :class="
                cn(
                  'h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  v.id === current.variant.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                )
              "
              @mouseenter="renderer?.prefetch(v)"
              @click="ctx.actions.apply(current.product, v)"
            >
              <Swatch :variant="v" :size="32" class="h-full w-full" />
            </button>
          </Tip>
        </template>
        <template v-else>
          <Tip v-for="s in suggestions" :key="s.product.id" :text="`${s.product.name} — ${s.variant.name}`" side="top">
            <button
              type="button"
              :aria-label="s.product.name"
              class="h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @mouseenter="renderer?.prefetch(s.variant)"
              @click="ctx.actions.apply(s.product, s.variant)"
            >
              <Swatch :variant="s.variant" :size="32" class="h-full w-full" />
            </button>
          </Tip>
        </template>
      </div>

      <div class="flex shrink-0 items-center gap-0.5">
        <Popover v-if="current" v-model:open="adjustOpen" side="top" align="end" class="w-80">
          <template #trigger>
            <button type="button" aria-label="Adjust pattern" class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <SlidersHorizontal class="h-4 w-4" />
            </button>
          </template>
          <PatternControls :surface-id="selectedSurface.id" />
        </Popover>
        <Tip v-if="current" text="Remove" side="top">
          <button type="button" aria-label="Remove material" class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-destructive" @click="state.clearSurface(selectedSurface.id)">
            <Trash2 class="h-4 w-4" />
          </button>
        </Tip>
        <Tip text="Deselect" shortcut="Esc" side="top">
          <button type="button" aria-label="Deselect surface" class="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" @click="selectedSurfaceId = null">
            <X class="h-4 w-4" />
          </button>
        </Tip>
      </div>
    </div>
  </Transition>
</template>
