<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { ArrowLeft, ExternalLink, Layers, Ruler, ShoppingCart, Sparkles } from 'lucide-vue-next'
import { estimate, unitSuffix } from '../../lib/estimate'
import { cn } from '../../lib/utils'
import type { Product, Variant } from '../../types'
import { useVisualizer } from '../context'
import { Button } from '../ui/button'
import Swatch from '../Swatch.vue'
import PatternControls from './PatternControls.vue'

const props = defineProps<{ productId: string }>()
const ctx = useVisualizer()
const { state, formatPrice, ui, renderer } = ctx
const { selectedSurface } = state

const product = shallowRef<Product | undefined>(state.products.get(props.productId))
watch(
  () => props.productId,
  async (id) => {
    product.value = state.products.get(id) ?? (await ctx.source.getProduct(id))
    if (product.value) state.rememberProduct(product.value)
  },
  { immediate: true },
)

const sel = computed(() => (selectedSurface.value ? state.selections[selectedSurface.value.id] : undefined))
const isOnSurface = computed(() => sel.value?.productId === props.productId)
const preview = shallowRef<Variant | null>(null)
const active = computed<Variant | undefined>(
  () => preview.value ?? product.value?.variants.find((v) => v.id === sel.value?.variantId) ?? product.value?.variants[0],
)
const accepts = computed(() => !!product.value && !!selectedSurface.value?.accepts.includes(product.value.categoryId))
const groupTargets = computed(() =>
  state.groupMates.value.filter((s) => product.value && s.accepts.includes(product.value.categoryId)),
)
// The applied line carries the server quote; other colourways fall back to the local estimate.
const est = computed(() => {
  const surface = selectedSurface.value
  if (!surface || !product.value || !active.value) return null
  const item = state.appliedBySurface.value.get(surface.id)
  if (item && item.variant.id === active.value.id) return item.estimate
  return estimate(surface, product.value, active.value)
})
const FINISH: Record<string, string> = { matte: 'Matt', satin: 'Satin', gloss: 'Gloss' }

function pick(v: Variant) {
  if (!product.value) return
  preview.value = null
  ctx.actions.apply(product.value, v)
}

function applyToGroup() {
  if (product.value && active.value) ctx.actions.apply(product.value, active.value, { toGroup: true })
}

function addToCart() {
  const item = selectedSurface.value && state.appliedBySurface.value.get(selectedSurface.value.id)
  if (item && isOnSurface.value) ctx.actions.addToCart([item])
}
</script>

<template>
  <div v-if="product && active" class="animate-rise-in space-y-4">
    <button
      type="button"
      class="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      @click="ui.detailProductId.value = null"
    >
      <ArrowLeft class="h-4 w-4" /> All products
    </button>

    <div class="relative overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
      <Swatch :key="active.id" :variant="active" :size="360" class="aspect-[4/3] w-full animate-in fade-in-0 duration-300" />
      <div class="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/60 to-transparent p-3 text-white">
        <div>
          <p class="text-xs opacity-80">{{ active.sku }}</p>
          <p class="text-base font-semibold">{{ active.name }}</p>
        </div>
        <span class="flex gap-1">
          <span v-if="active.approximate" class="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium backdrop-blur" title="Preview uses the product photo, not a material scan">Approx. preview</span>
          <span class="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium backdrop-blur">{{ FINISH[active.finish] }}</span>
        </span>
      </div>
    </div>

    <div>
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{{ product.brand }}</p>
          <h3 class="text-lg font-semibold leading-tight">{{ product.name }}</h3>
        </div>
        <p v-if="active.price" class="shrink-0 text-right">
          <span class="text-lg font-bold">{{ formatPrice(active.price) }}</span>
          <span class="block text-xs text-muted-foreground">{{ unitSuffix(product).replace(' / ', 'per ') || 'each' }}</span>
        </p>
      </div>
      <p v-if="product.description" class="mt-1.5 text-sm text-muted-foreground">{{ product.description }}</p>
    </div>

    <div>
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {{ product.variants.length }} colourways
      </p>
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="v in product.variants"
          :key="v.id"
          type="button"
          :disabled="!accepts"
          class="group text-left focus-visible:outline-none disabled:opacity-50"
          @mouseenter="preview = v; renderer?.prefetch(v)"
          @mouseleave="preview = null"
          @focus="preview = v"
          @blur="preview = null"
          @click="pick(v)"
        >
          <span
            :class="
              cn(
                'block aspect-square overflow-hidden rounded-xl ring-1 ring-border transition-all group-hover:scale-[1.04] group-focus-visible:ring-2 group-focus-visible:ring-ring',
                isOnSurface && sel?.variantId === v.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
              )
            "
          >
            <Swatch :variant="v" :size="80" class="h-full w-full" />
          </span>
          <span class="mt-1 block truncate text-[11px] font-medium leading-tight">{{ v.name }}</span>
        </button>
      </div>
      <p v-if="!accepts && selectedSurface" class="mt-2 text-xs text-muted-foreground">
        Not available for {{ selectedSurface.label.toLowerCase() }}.
      </p>
    </div>

    <div v-if="groupTargets.length && accepts" class="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border p-3">
      <div class="flex items-center gap-2 text-sm">
        <Sparkles class="h-4 w-4 text-primary" />
        <span>Also apply to {{ groupTargets.map((s) => s.label.toLowerCase()).join(', ') }}</span>
      </div>
      <Button size="sm" variant="secondary" @click="applyToGroup">Apply</Button>
    </div>

    <div v-if="isOnSurface && selectedSurface" class="rounded-xl border border-border p-3">
      <PatternControls :surface-id="selectedSurface.id" />
    </div>

    <dl class="grid grid-cols-2 gap-2 text-sm">
      <div class="rounded-xl bg-muted/60 p-3">
        <dt class="flex items-center gap-1.5 text-xs text-muted-foreground"><Ruler class="h-3.5 w-3.5" /> Repeat</dt>
        <dd class="mt-0.5 font-medium">{{ active.tiling === 'stretch' ? 'Single piece' : `${active.tileSizeCm.w} × ${active.tileSizeCm.h} cm` }}</dd>
      </div>
      <div v-if="est" class="rounded-xl bg-muted/60 p-3">
        <dt class="flex items-center gap-1.5 text-xs text-muted-foreground"><Layers class="h-3.5 w-3.5" /> For this {{ selectedSurface?.label.toLowerCase() }}</dt>
        <dd class="mt-0.5 font-medium">{{ est.label }}</dd>
        <dd v-if="est.total" class="text-xs text-muted-foreground">≈ {{ formatPrice(est.total) }}</dd>
        <dd v-if="est.breakdown?.length" class="mt-1">
          <details class="text-[11px] text-muted-foreground">
            <summary class="cursor-pointer select-none hover:text-foreground">How we priced this</summary>
            <ul class="mt-1 space-y-0.5"><li v-for="(step, i) in est.breakdown" :key="i">{{ step }}</li></ul>
          </details>
        </dd>
      </div>
    </dl>

    <div class="flex gap-2">
      <Button class="flex-1" :disabled="!isOnSurface" @click="addToCart"><ShoppingCart /> Add to cart</Button>
      <Button variant="outline" @click="ctx.actions.viewProduct(product, active)"><ExternalLink /> Details</Button>
    </div>
  </div>
  <div v-else class="space-y-3">
    <div class="h-5 w-24 animate-pulse rounded bg-muted" />
    <div class="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />
  </div>
</template>
