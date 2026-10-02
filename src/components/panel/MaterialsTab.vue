<script setup lang="ts">
import { computed } from 'vue'
import { ArrowUpDown, MousePointerClick, PackageSearch, Search, X } from 'lucide-vue-next'
import { useCatalog } from '../../composables/useCatalog'
import { cn } from '../../lib/utils'
import type { Product } from '../../types'
import { useVisualizer } from '../context'
import Swatch from '../Swatch.vue'
import ProductCard from './ProductCard.vue'
import ProductDetail from './ProductDetail.vue'
import SurfaceRail from './SurfaceRail.vue'

const ctx = useVisualizer()
const { state, ui, renderer } = ctx
const { selectedSurface } = state

const allowed = computed(() => selectedSurface.value?.accepts ?? null)
const { categories, products, loading, error, search, sort, activeCategoryId } = useCatalog(ctx.source, allowed)

const visibleCategories = computed(() =>
  allowed.value ? categories.value.filter((c) => allowed.value!.includes(c.id)) : categories.value,
)
const currentSel = computed(() => (selectedSurface.value ? state.selections[selectedSurface.value.id] : undefined))

const recentItems = computed(() =>
  state.recent.value
    .map((r) => {
      const p = state.products.get(r.productId)
      const v = p?.variants.find((x) => x.id === r.variantId)
      return p && v ? { product: p, variant: v } : null
    })
    .filter((x): x is NonNullable<typeof x> => !!x && !!selectedSurface.value?.accepts.includes(x.product.categoryId))
    .slice(0, 8),
)

function open(p: Product) {
  ctx.actions.openProduct(p)
}

const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name' },
] as const
</script>

<template>
  <div class="flex flex-col gap-4">
    <SurfaceRail />

    <!-- Nothing selected -->
    <div v-if="!selectedSurface" class="flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-8 text-center">
      <span class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <MousePointerClick class="h-6 w-6" />
      </span>
      <p class="font-semibold">Choose what to restyle</p>
      <p class="mt-1 max-w-[16rem] text-sm text-muted-foreground">
        Tap a wall, the floor or any furnishing in the room — or pick one above.
      </p>
    </div>

    <!-- Product detail -->
    <ProductDetail v-else-if="ui.detailProductId.value" :product-id="ui.detailProductId.value" />

    <!-- Browse -->
    <template v-else>
      <div class="flex items-end justify-between gap-2">
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Styling</p>
          <h3 class="truncate text-lg font-semibold leading-tight">{{ selectedSurface.label }}</h3>
        </div>
        <button
          v-if="currentSel"
          type="button"
          class="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-destructive"
          @click="state.clearSurface(selectedSurface.id)"
        >
          <X class="h-3.5 w-3.5" /> Clear
        </button>
      </div>

      <div v-if="recentItems.length" class="space-y-1.5">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recently used</p>
        <div class="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          <button
            v-for="r in recentItems"
            :key="r.variant.id"
            type="button"
            :title="`${r.product.name} — ${r.variant.name}`"
            :class="cn('h-9 w-9 shrink-0 overflow-hidden rounded-lg ring-1 ring-border transition-transform hover:scale-105', currentSel?.variantId === r.variant.id && 'ring-2 ring-primary')"
            @mouseenter="renderer?.prefetch(r.variant)"
            @click="ctx.actions.apply(r.product, r.variant)"
          >
            <Swatch :variant="r.variant" :size="36" class="h-full w-full" />
          </button>
        </div>
      </div>

      <div class="flex gap-2">
        <label class="relative flex-1">
          <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="search"
            type="search"
            placeholder="Search colours, products, SKUs"
            class="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-8 text-sm shadow-sm outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
          />
          <button v-if="search" type="button" aria-label="Clear search" class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" @click="search = ''">
            <X class="h-3.5 w-3.5" />
          </button>
        </label>
        <label class="relative">
          <span class="sr-only">Sort</span>
          <ArrowUpDown class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            v-model="sort"
            class="h-10 appearance-none rounded-xl border border-input bg-background pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring/40"
          >
            <option v-for="s in SORTS" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </label>
      </div>

      <div v-if="visibleCategories.length > 1" class="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        <button
          type="button"
          :class="cn('shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors', activeCategoryId === null ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-accent')"
          @click="activeCategoryId = null"
        >
          All
        </button>
        <button
          v-for="c in visibleCategories"
          :key="c.id"
          type="button"
          :class="cn('shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors', activeCategoryId === c.id ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-accent')"
          @click="activeCategoryId = c.id"
        >
          {{ c.name }}
        </button>
      </div>

      <p v-if="error" class="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{{ error }}</p>

      <div v-if="loading && !products.length" class="grid grid-cols-2 gap-3">
        <div v-for="i in 6" :key="i" class="overflow-hidden rounded-xl border border-border">
          <div class="aspect-[4/3] animate-pulse bg-muted" />
          <div class="space-y-1.5 p-2.5">
            <div class="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
            <div class="h-3 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
      <div v-else-if="!products.length" class="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <PackageSearch class="h-8 w-8 opacity-60" />
        No products match “{{ search }}”.
      </div>
      <TransitionGroup
        v-else
        tag="div"
        class="grid grid-cols-2 gap-3"
        enter-from-class="opacity-0 translate-y-2"
        enter-active-class="transition duration-300"
      >
        <ProductCard
          v-for="p in products"
          :key="p.id"
          :product="p"
          :active-variant-id="currentSel?.productId === p.id ? currentSel.variantId : null"
          @open="open(p)"
        />
      </TransitionGroup>
    </template>
  </div>
</template>
