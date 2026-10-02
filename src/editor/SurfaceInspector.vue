<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, Grid3x3, Square, Wand2 } from 'lucide-vue-next'
import type { Category } from '../types'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { PRESETS, presetFor, suggestAccepts, type PresetKind } from './lib/presets'
import type { DraftSurface, EditorState } from './useEditorState'

/** Settings of the active surface: what it is, what it accepts, its real size, its plane. */
const props = defineProps<{
  state: EditorState
  surface: DraftSurface
  categories: Category[]
  presetCategories?: Partial<Record<PresetKind, string[]>>
  audience?: 'staff' | 'shopper'
}>()
const emit = defineEmits<{ autoPlane: []; warp: []; removeWarp: []; detachIdMap: [] }>()

const status = computed(() => props.state.statuses.value.get(props.surface.uid))
const s = computed(() => props.surface)
const set = (patch: Partial<DraftSurface>, key?: string) => props.state.update(s.value.uid, patch, key)

/** Choosing a type fills in what that kind of surface usually takes; the chips stay editable. */
function setKind(kind: PresetKind | 'custom') {
  if (kind === 'custom') return set({ kind })
  const p = presetFor(kind)
  set({
    kind,
    group: p.group ?? '',
    accepts: s.value.accepts.length ? s.value.accepts : suggestAccepts(kind, props.categories, props.presetCategories),
    widthCm: p.sizeCm.w,
    heightCm: p.sizeCm.h,
  })
}

function toggleAccept(id: string) {
  const a = s.value.accepts
  set({ accepts: a.includes(id) ? a.filter((x) => x !== id) : [...a, id] })
}

const num = (v: string | number | undefined) => Math.max(1, Math.round(Number(v) || 0))
const pricingSize = computed(() => s.value.sizeCm ?? { w: s.value.widthCm, h: s.value.heightCm })
const autoArea = computed(() => Math.round((pricingSize.value.w * pricingSize.value.h) / 1000) / 10)
const label = 'text-xs font-medium text-muted-foreground'
</script>

<template>
  <div class="space-y-4">
    <div class="grid grid-cols-2 gap-2">
      <label :class="cn(label, 'col-span-2')">
        Name
        <Input :model-value="s.label" class="mt-1 h-8" @update:model-value="state.rename(s.uid, String($event))" />
      </label>
      <label :class="cn(label, 'col-span-2')">
        Type
        <select
          :value="s.kind"
          class="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          @change="setKind(($event.target as HTMLSelectElement).value as PresetKind)"
        >
          <option v-for="p in PRESETS" :key="p.kind" :value="p.kind">{{ p.label }}</option>
          <option value="custom">Other</option>
        </select>
      </label>
    </div>

    <fieldset id="surface-accepts">
      <legend :class="label">Products it offers</legend>
      <p v-if="!categories.length" class="mt-1 text-xs text-muted-foreground">No categories to choose from.</p>
      <div class="mt-1.5 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        <button
          v-for="c in categories"
          :key="c.id"
          type="button"
          :aria-pressed="s.accepts.includes(c.id)"
          :class="
            cn(
              'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
              s.accepts.includes(c.id) ? 'border-foreground bg-foreground text-background' : 'border-border hover:bg-accent',
            )
          "
          @click="toggleAccept(c.id)"
        >{{ c.name }}</button>
      </div>
      <p v-if="!s.accepts.length" class="mt-1.5 text-xs text-amber-700 dark:text-amber-400">Pick at least one category, or shoppers can't style this surface.</p>
    </fieldset>

    <div class="space-y-2 rounded-xl border border-border p-3">
      <div class="flex items-center justify-between">
        <p class="text-xs font-semibold">Plane</p>
        <span v-if="status?.planeIssue" class="text-[11px] font-medium text-amber-700 dark:text-amber-400">
          {{ status.planeIssue === 'skewed' ? 'Very skewed: check the corners' : 'Corners cross: drag them into order TL → TR → BR → BL' }}
        </span>
      </div>
      <p v-if="s.patches?.length" class="text-xs text-muted-foreground">
        {{ s.patches.length }} patches from a rendered scene. Fitting a plane replaces them.
      </p>
      <div class="flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" :disabled="!status?.mask || !!state.doc.idMapUrl" @click="emit('autoPlane')"><Square /> Auto plane</Button>
        <Button size="sm" variant="ghost" :disabled="s.quad.length !== 4" @click="emit('warp')"><Grid3x3 /> {{ s.warp ? 'Refit warp' : 'Warp grid' }}</Button>
        <Button v-if="s.warp" size="sm" variant="ghost" @click="emit('removeWarp')">Flat again</Button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label :class="label">
          Plane width (cm)
          <Input :model-value="s.widthCm" type="number" min="1" class="mt-1 h-8" @update:model-value="set({ widthCm: num($event) }, `w:${s.uid}`)" />
        </label>
        <label :class="label">
          Plane height (cm)
          <Input :model-value="s.heightCm" type="number" min="1" class="mt-1 h-8" @update:model-value="set({ heightCm: num($event) }, `h:${s.uid}`)" />
        </label>
      </div>
      <p class="text-[11px] text-muted-foreground">The real size of the area inside the 4 corners. Patterns repeat at their true size from this.</p>
    </div>

    <!-- Shoppers enter their own measurements when adding to the cart. -->
    <div v-if="audience !== 'shopper'" class="space-y-2 rounded-xl border border-border p-3">
      <p class="text-xs font-semibold">Size for prices</p>
      <label class="flex items-center gap-2 text-xs">
        <input type="checkbox" :checked="!s.sizeCm" @change="set({ sizeCm: ($event.target as HTMLInputElement).checked ? null : { w: s.widthCm, h: s.heightCm } })" />
        Same as the plane
      </label>
      <div v-if="s.sizeCm" class="grid grid-cols-2 gap-2">
        <label :class="label">
          Width (cm)
          <Input :model-value="s.sizeCm.w" type="number" min="1" class="mt-1 h-8" @update:model-value="set({ sizeCm: { w: num($event), h: s.sizeCm!.h } }, `sw:${s.uid}`)" />
        </label>
        <label :class="label">
          Height (cm)
          <Input :model-value="s.sizeCm.h" type="number" min="1" class="mt-1 h-8" @update:model-value="set({ sizeCm: { w: s.sizeCm!.w, h: num($event) } }, `sh:${s.uid}`)" />
        </label>
      </div>
      <p class="text-[11px] text-muted-foreground">
        e.g. the window opening for curtains. Shoppers see prices for this size and can change it before adding to the cart.
        Area {{ s.areaM2 ?? autoArea }} m²{{ s.areaM2 == null ? ' (from the size)' : '' }}.
      </p>
    </div>

    <details v-if="audience !== 'shopper'" class="group rounded-xl border border-border p-3">
      <summary class="flex cursor-pointer list-none items-center justify-between text-xs font-semibold">
        Advanced
        <ChevronDown class="h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <label :class="label">
          Id
          <Input :model-value="s.id" class="mt-1 h-8 font-mono" @update:model-value="set({ id: String($event).toLowerCase().replace(/[^a-z0-9-]+/g, '-') }, `id:${s.uid}`)" />
        </label>
        <label :class="label">
          Group
          <Input :model-value="s.group" placeholder="e.g. walls" class="mt-1 h-8" @update:model-value="set({ group: String($event) }, `g:${s.uid}`)" />
        </label>
        <label :class="cn(label, 'col-span-2')">
          Area override (m²)
          <Input
            :model-value="s.areaM2 ?? ''"
            type="number"
            min="0"
            step="0.1"
            :placeholder="String(autoArea)"
            class="mt-1 h-8"
            @update:model-value="set({ areaM2: $event === '' ? null : Math.max(0, Number($event)) }, `a:${s.uid}`)"
          />
        </label>
      </div>
      <p class="mt-2 text-[11px] text-muted-foreground">Surfaces in one group can be styled together (“apply to all walls”).</p>
      <Button v-if="state.doc.idMapUrl" size="sm" variant="outline" class="mt-3 w-full" @click="emit('detachIdMap')"><Wand2 /> Make masks editable</Button>
    </details>
  </div>
</template>
