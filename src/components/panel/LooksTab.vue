<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { Bookmark, BookmarkPlus, Sparkles, Trash2, Wand2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { LookPreset, Product, Variant } from '../../types'
import { useVisualizer } from '../context'
import { Button } from '../ui/button'
import Swatch from '../Swatch.vue'

const ctx = useVisualizer()
const { state, renderer } = ctx
const name = ref('')

const presets = computed(() => state.room.value?.presets ?? [])

/** Resolved variants for preset palettes. */
const palette = shallowRef(new Map<string, { product: Product; variant: Variant }[]>())
async function resolvePalettes() {
  const ps = presets.value
  await state.ensureProducts(ps.flatMap((p) => Object.values(p.selections).map((s) => s.productId)))
  palette.value = new Map(
    ps.map((p) => [
      p.id,
      Object.values(p.selections)
        .map((s) => {
          const product = state.products.get(s.productId)
          const variant = product?.variants.find((v) => v.id === s.variantId)
          return product && variant ? { product, variant } : null
        })
        .filter((x): x is { product: Product; variant: Variant } => !!x),
    ]),
  )
}
onMounted(resolvePalettes)
watch(presets, resolvePalettes)

async function applyPreset(p: LookPreset) {
  await state.applyPreset(p)
  toast.success(`Applied “${p.name}”`, { action: { label: 'Undo', onClick: () => state.undo() } })
}

function save() {
  const thumb = renderer.value?.snapshot(false)
  let url: string | undefined
  if (thumb) {
    const c = document.createElement('canvas')
    c.width = 320
    c.height = Math.round((320 * thumb.height) / thumb.width)
    c.getContext('2d')!.drawImage(thumb, 0, 0, c.width, c.height)
    url = c.toDataURL('image/jpeg', 0.8)
  }
  const look = state.saveLook(name.value, url)
  if (look) toast.success(`Saved “${look.name}”`)
  name.value = ''
}

async function restore(id: string) {
  const look = state.roomLooks.value.find((l) => l.id === id)
  if (!look) return
  await state.applySelections(look.selections)
  toast(`Restored “${look.name}”`, { action: { label: 'Undo', onClick: () => state.undo() } })
}

const fmtDate = (t: number) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t)
</script>

<template>
  <div class="space-y-6">
    <section v-if="presets.length" class="space-y-3">
      <div class="flex items-center gap-2">
        <Wand2 class="h-4 w-4 text-primary" />
        <h3 class="text-sm font-semibold">Curated for this room</h3>
      </div>
      <button
        v-for="p in presets"
        :key="p.id"
        type="button"
        class="group block w-full overflow-hidden rounded-2xl border border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="applyPreset(p)"
      >
        <span class="flex h-14">
          <Swatch
            v-for="it in palette.get(p.id) ?? []"
            :key="it.variant.id"
            :variant="it.variant"
            :size="64"
            class="h-full flex-1 transition-[flex] duration-300 group-hover:first:flex-[1.6]"
          />
          <span v-if="!palette.get(p.id)?.length" class="h-full flex-1 animate-pulse bg-muted" />
        </span>
        <span class="flex items-center justify-between gap-3 p-3">
          <span class="min-w-0">
            <span class="block font-semibold">{{ p.name }}</span>
            <span v-if="p.description" class="block truncate text-xs text-muted-foreground">{{ p.description }}</span>
          </span>
          <span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Sparkles class="h-3 w-3" /> Apply
          </span>
        </span>
      </button>
    </section>

    <section class="space-y-3">
      <div class="flex items-center gap-2">
        <Bookmark class="h-4 w-4 text-primary" />
        <h3 class="text-sm font-semibold">Your saved looks</h3>
      </div>
      <form class="flex gap-2" @submit.prevent="save">
        <input
          v-model="name"
          placeholder="Name this look"
          maxlength="40"
          class="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
        />
        <Button type="submit" size="sm" class="h-9" :disabled="!state.applied.value.length"><BookmarkPlus /> Save</Button>
      </form>
      <p v-if="!state.roomLooks.value.length" class="rounded-xl bg-muted/60 p-4 text-center text-sm text-muted-foreground">
        Save combinations you like to compare them later.
      </p>
      <div class="grid grid-cols-2 gap-3">
        <div v-for="l in state.roomLooks.value" :key="l.id" class="group relative overflow-hidden rounded-xl border border-border bg-card">
          <button type="button" class="block w-full text-left" @click="restore(l.id)">
            <img v-if="l.thumbnail" :src="l.thumbnail" alt="" class="aspect-[16/10] w-full object-cover" />
            <span class="block p-2">
              <span class="block truncate text-sm font-medium">{{ l.name }}</span>
              <span class="block text-[11px] text-muted-foreground">{{ fmtDate(l.createdAt) }}</span>
            </span>
          </button>
          <button
            type="button"
            aria-label="Delete look"
            class="absolute right-1.5 top-1.5 rounded-md bg-background/90 p-1 text-muted-foreground opacity-0 shadow transition-opacity hover:text-destructive group-hover:opacity-100"
            @click="state.deleteLook(l.id)"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
