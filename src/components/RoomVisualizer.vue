<script setup lang="ts">
import { computed, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { onKeyStroke, useFullscreen } from '@vueuse/core'
import { Layers, ShoppingBag, Wand2 } from 'lucide-vue-next'
import { Toaster, toast } from 'vue-sonner'
import 'vue-sonner/style.css'
import { useVisualizerState, type AppliedItem } from '../composables/useVisualizerState'
import type { ProductSource } from '../data/ProductSource'
import { downloadBlob, renderMoodboard } from '../lib/moodboard'
import { formatPrice } from '../lib/utils'
import type { RoomRenderer, SurfaceInfo } from '../render/RoomRenderer'
import type { Product, Surface, Variant } from '../types'
import { VISUALIZER, type PanelTab, type VisualizerContext } from './context'
import LooksTab from './panel/LooksTab.vue'
import MaterialsTab from './panel/MaterialsTab.vue'
import SummaryTab from './panel/SummaryTab.vue'
import QuickBar from './stage/QuickBar.vue'
import RoomStrip from './stage/RoomStrip.vue'
import StageToolbar from './stage/StageToolbar.vue'
import VisualizerStage from './stage/VisualizerStage.vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { TooltipProvider } from './ui/tooltip'

const props = withDefaults(
  defineProps<{
    source: ProductSource
    initialRoomId?: string
    /** Keep `?room=&look=` in the address bar so styled rooms can be shared. */
    syncUrl?: boolean
    currency?: string
    /** Brand name used on exported moodboards. */
    brand?: string
    /** localStorage namespace for saved looks/recents; false disables persistence. */
    storageKey?: string | false
    /** Render the built-in toast container (turn off if the host app has one). */
    toasts?: boolean
    /** Formats every price shown (summary, cards, moodboard). Defaults to Intl with `currency`. */
    formatPrice?: (value: number) => string
    /** Toast "Added to cart" after `addToCart`. Turn off when the host confirms or adds itself. */
    cartFeedback?: boolean
  }>(),
  { syncUrl: false, currency: 'INR', brand: 'Madan Furnishers', toasts: true, cartFeedback: true },
)

const emit = defineEmits<{
  variantApplied: [payload: { surface: Surface; product: Product; variant: Variant }]
  addToCart: [items: AppliedItem[]]
  viewProduct: [product: Product, variant: Variant | undefined]
  roomChange: [roomId: string]
}>()

const money = (value: number) => (props.formatPrice ? props.formatPrice(value) : formatPrice(value, props.currency))

const state = useVisualizerState(props.source, {
  initialRoomId: props.initialRoomId,
  syncUrl: props.syncUrl,
  storageKey: props.storageKey,
})

const root = ref<HTMLElement>()
const stage = ref<InstanceType<typeof VisualizerStage>>()
const renderer = shallowRef<RoomRenderer | null>(null)
const surfaceInfo = shallowRef(new Map<string, SurfaceInfo>())
const roomReady = ref(false)
const tab = ref<PanelTab>('materials')
const detailProductId = ref<string | null>(null)
const compare = ref(false)
const hotspots = ref(true)
const zoom = ref(1)
const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(root)

watch(state.room, (r) => {
  compare.value = false
  detailProductId.value = null
  if (r) emit('roomChange', r.id)
})
watch(() => state.applied.value.length, (n) => n === 0 && (compare.value = false))

function apply(product: Product, variant: Variant, opts: { toGroup?: boolean } = {}) {
  const surface = state.selectedSurface.value
  if (!surface || !surface.accepts.includes(product.categoryId)) return
  const also = opts.toGroup ? state.groupMates.value.filter((s) => s.accepts.includes(product.categoryId)).map((s) => s.id) : []
  state.applyVariant(surface.id, product, variant, also)
  emit('variantApplied', { surface, product, variant })
  if (also.length) {
    toast.success(`${product.name} applied to ${also.length + 1} surfaces`, { action: { label: 'Undo', onClick: () => state.undo() } })
  }
}

const ctx: VisualizerContext = {
  state,
  source: props.source,
  currency: props.currency,
  formatPrice: money,
  renderer,
  surfaceInfo,
  roomReady,
  isFullscreen,
  ui: { tab, detailProductId, compare, hotspots, zoom },
  actions: {
    apply,
    openProduct(product) {
      detailProductId.value = product.id
      state.rememberProduct(product)
      const surface = state.selectedSurface.value
      // Instant feedback: put the product on the surface straight away.
      if (surface && state.selections[surface.id]?.productId !== product.id) apply(product, product.variants[0])
    },
    addToCart(items) {
      emit('addToCart', items)
      if (!props.cartFeedback) return
      const total = items.reduce((s, i) => s + (i.estimate.total ?? 0), 0)
      toast.success(items.length === 1 ? `Added ${items[0].product.name} to cart` : `Added ${items.length} items to cart`, {
        description: total ? `Estimated ${money(total)}` : undefined,
      })
    },
    viewProduct(product, variant) {
      const sel = Object.values(state.selections).find((s) => s.productId === product.id)
      emit('viewProduct', product, variant ?? product.variants.find((v) => v.id === sel?.variantId) ?? product.variants[0])
    },
    async download(kind = 'image') {
      const r = renderer.value
      const room = state.room.value
      if (!r || !room) return
      const id = toast.loading(kind === 'moodboard' ? 'Building moodboard…' : 'Exporting image…')
      try {
        const blob =
          kind === 'moodboard'
            ? await renderMoodboard({
                room: r.snapshot(false),
                roomName: room.name,
                items: state.applied.value,
                total: state.totalPrice.value,
                formatPrice: money,
                brand: props.brand,
              })
            : await r.toBlob('image/jpeg', 0.94)
        downloadBlob(blob, `${room.id}-${kind === 'moodboard' ? 'moodboard' : 'look'}.jpg`)
        toast.success('Downloaded', { id })
      } catch (e) {
        toast.error('Export failed', { id, description: e instanceof Error ? e.message : undefined })
      }
    },
    async share() {
      const url = state.shareUrl()
      try {
        if (navigator.share && matchMedia('(pointer: coarse)').matches) {
          await navigator.share({ title: `${props.brand} — ${state.room.value?.name}`, url })
          return
        }
        await navigator.clipboard.writeText(url)
        toast.success('Link copied', { description: 'Anyone with the link sees this exact look.' })
      } catch {
        toast.error('Could not copy the link')
      }
    },
    zoomBy(f) {
      stage.value?.zoomAt(f)
    },
    resetView() {
      zoom.value = 1
    },
    toggleFullscreen() {
      void toggleFullscreen()
    },
  },
}
provide(VISUALIZER, ctx)

onMounted(() => state.init())

// ---- Keyboard shortcuts (ignored while typing)
function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
}
function within() {
  return !!root.value && (root.value.contains(document.activeElement) || document.activeElement === document.body)
}
onKeyStroke((e) => {
  if (typing(e) || !within()) return
  const mod = e.metaKey || e.ctrlKey
  const k = e.key.toLowerCase()
  if (mod && k === 'z') {
    e.preventDefault()
    e.shiftKey ? state.redo() : state.undo()
  } else if (mod && k === 'y') {
    e.preventDefault()
    state.redo()
  } else if (mod) {
    return
  } else if (k === 'escape') {
    if (compare.value) compare.value = false
    else if (detailProductId.value) detailProductId.value = null
    else state.selectedSurfaceId.value = null
  } else if (k === 'c' && state.applied.value.length) {
    compare.value = !compare.value
  } else if (k === 'h') {
    hotspots.value = !hotspots.value
  } else if (k === 'f') {
    void toggleFullscreen()
  } else if (k === '[' || k === ']') {
    state.cycleSurface(k === ']' ? 1 : -1)
    detailProductId.value = null
  } else if (k === '0') {
    zoom.value = 1
  } else if (k === '=' || k === '+') {
    stage.value?.zoomAt(1.4)
  } else if (k === '-') {
    stage.value?.zoomAt(1 / 1.4)
  }
})

const styledCount = computed(() => state.applied.value.length)
</script>

<template>
  <TooltipProvider>
    <div
      ref="root"
      class="room-visualizer relative flex h-full min-h-[640px] w-full flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground lg:flex-row"
      :class="isFullscreen && 'rounded-none border-0'"
    >
      <!-- Stage -->
      <section class="relative flex min-h-[420px] min-w-0 flex-1 flex-col bg-[radial-gradient(ellipse_at_top,hsl(var(--muted))_0%,hsl(var(--background))_75%)]">
        <div class="relative min-h-0 flex-1">
          <VisualizerStage ref="stage">
            <StageToolbar />
            <QuickBar />
          </VisualizerStage>
        </div>
        <RoomStrip />
        <p v-if="state.error.value" class="absolute inset-x-0 top-1/2 text-center text-sm text-destructive">{{ state.error.value }}</p>
      </section>

      <!-- Panel -->
      <aside class="flex max-h-[80vh] w-full shrink-0 flex-col border-t border-border bg-background lg:max-h-none lg:w-[400px] lg:border-l lg:border-t-0">
        <Tabs v-model="tab" class="flex min-h-0 flex-1 flex-col">
          <div class="border-b border-border px-4 pb-3 pt-4">
            <TabsList class="grid h-10 w-full grid-cols-3 rounded-xl">
              <TabsTrigger value="materials" class="rounded-lg"><Layers class="h-4 w-4" /> Materials</TabsTrigger>
              <TabsTrigger value="looks" class="rounded-lg"><Wand2 class="h-4 w-4" /> Looks</TabsTrigger>
              <TabsTrigger value="summary" class="relative rounded-lg">
                <ShoppingBag class="h-4 w-4" /> Summary
                <span
                  v-if="styledCount"
                  class="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                >{{ styledCount }}</span>
              </TabsTrigger>
            </TabsList>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]">
            <TabsContent value="materials"><MaterialsTab /></TabsContent>
            <TabsContent value="looks"><LooksTab /></TabsContent>
            <TabsContent value="summary"><SummaryTab /></TabsContent>
          </div>
          <div v-if="styledCount && tab !== 'summary'" class="border-t border-border bg-muted/40 px-4 py-3">
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-lg transition-transform hover:scale-[1.01]"
              @click="tab = 'summary'"
            >
              <span>{{ styledCount }} {{ styledCount === 1 ? 'item' : 'items' }} in your look</span>
              <span class="tabular-nums">{{ money(state.totalPrice.value) }} →</span>
            </button>
          </div>
        </Tabs>
      </aside>

      <Toaster v-if="toasts" position="bottom-center" rich-colors close-button :toast-options="{ class: 'font-sans' }" />
    </div>
  </TooltipProvider>
</template>
