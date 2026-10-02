<script setup lang="ts">
import { LayoutGrid, Share2, ShoppingBag, ShoppingCart, X } from 'lucide-vue-next'
import { useVisualizer } from '../context'
import { Button } from '../ui/button'
import Swatch from '../Swatch.vue'

const ctx = useVisualizer()
const { state, formatPrice, ui } = ctx

function focus(surfaceId: string, productId: string) {
  state.selectedSurfaceId.value = surfaceId
  ui.tab.value = 'materials'
  ui.detailProductId.value = productId
}
</script>

<template>
  <div v-if="!state.applied.value.length" class="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-10 text-center">
    <span class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
      <ShoppingBag class="h-6 w-6" />
    </span>
    <p class="font-semibold">Nothing styled yet</p>
    <p class="mt-1 max-w-[16rem] text-sm text-muted-foreground">Apply materials to the room and we'll estimate quantities and cost here.</p>
    <Button size="sm" variant="secondary" class="mt-4" @click="ui.tab.value = 'looks'">Try a curated look</Button>
  </div>

  <div v-else class="space-y-4">
    <ul class="divide-y divide-border overflow-hidden rounded-2xl border border-border">
      <li v-for="a in state.applied.value" :key="a.surface.id" class="group bg-card p-3 transition-colors hover:bg-accent/50">
       <div class="flex items-center gap-3">
        <button type="button" class="shrink-0" @click="focus(a.surface.id, a.product.id)">
          <Swatch :variant="a.variant" :size="48" class="h-12 w-12 rounded-lg ring-1 ring-border" />
        </button>
        <button type="button" class="min-w-0 flex-1 text-left" @click="focus(a.surface.id, a.product.id)">
          <span class="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{{ a.surface.label }}</span>
          <span class="block truncate text-sm font-medium">{{ a.product.name }}</span>
          <span class="block truncate text-xs text-muted-foreground">{{ a.variant.name }} · {{ a.estimate.label }}</span>
        </button>
        <span class="shrink-0 text-right">
          <span v-if="a.estimate.total" class="block text-sm font-semibold tabular-nums transition-opacity" :class="a.estimate.pending && 'opacity-50'">{{ formatPrice(a.estimate.total) }}</span>
          <button
            type="button"
            aria-label="Remove"
            class="ml-auto mt-0.5 flex rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
            @click="state.clearSurface(a.surface.id)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </span>
       </div>
        <details v-if="a.estimate.breakdown?.length" class="mt-1.5 pl-[3.75rem] text-xs text-muted-foreground">
          <summary class="cursor-pointer select-none font-medium hover:text-foreground">How we priced this</summary>
          <ul class="mt-1 space-y-0.5">
            <li v-for="(step, i) in a.estimate.breakdown" :key="i">{{ step }}</li>
          </ul>
        </details>
      </li>
    </ul>

    <div class="space-y-3 rounded-2xl bg-muted/60 p-4">
      <div class="flex items-baseline justify-between">
        <span class="text-sm text-muted-foreground">Estimated total</span>
        <span class="text-2xl font-bold tabular-nums transition-opacity" :class="state.quoting.value && 'opacity-50'" :aria-busy="state.quoting.value">{{ formatPrice(state.totalPrice.value) }}</span>
      </div>
      <p class="text-xs text-muted-foreground">
        Prices use our measuring rules (fullness, hems, roll sizes) for this room's sizes. Enter your own measurements before adding to the cart for your exact price.
      </p>
      <Button class="w-full" size="lg" @click="ctx.actions.addToCart(state.applied.value)"><ShoppingCart /> Add all to cart</Button>
      <div class="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" @click="ctx.actions.download('moodboard')"><LayoutGrid /> Moodboard</Button>
        <Button variant="outline" size="sm" @click="ctx.actions.share()"><Share2 /> Share</Button>
      </div>
    </div>
  </div>
</template>
