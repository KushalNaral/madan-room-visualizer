<script setup lang="ts">
import { ref } from 'vue'
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from 'lucide-vue-next'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Popover } from '../components/ui/popover'
import { PRESETS, type PresetKind } from './lib/presets'
import type { EditorState, SurfaceStep } from './useEditorState'

/** Surfaces as cards: what each still needs, and a button for the next step. */
const props = defineProps<{ state: EditorState }>()
const emit = defineEmits<{ add: [kind: PresetKind | 'custom']; next: [uid: string, step: Exclude<SurfaceStep, null>] }>()
const { state } = props

const adding = ref(false)
function add(kind: PresetKind | 'custom') {
  adding.value = false
  emit('add', kind)
}

const NEXT: Record<Exclude<SurfaceStep, null>, string> = { mask: 'Select its area', plane: 'Fit the plane', accepts: 'Choose products' }
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold">Surfaces <span class="font-normal text-muted-foreground">({{ state.doc.surfaces.length }})</span></h3>
      <Popover v-model:open="adding" side="bottom" align="end" class="w-48 p-1">
        <template #trigger>
          <Button size="sm" variant="outline"><Plus /> Add</Button>
        </template>
        <div class="grid gap-0.5">
          <button
            v-for="p in PRESETS"
            :key="p.kind"
            type="button"
            class="rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            @click="add(p.kind)"
          >{{ p.label }}</button>
          <button type="button" class="rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent" @click="add('custom')">Other…</button>
        </div>
      </Popover>
    </div>

    <p v-if="!state.doc.surfaces.length" class="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
      No surfaces yet. Detect them from the photo, or add one and select its area.
    </p>

    <ul class="space-y-1.5">
      <li
        v-for="(s, i) in state.doc.surfaces"
        :key="s.uid"
        :class="
          cn(
            'group rounded-xl border p-2.5 transition-colors',
            s.uid === state.activeUid.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-accent/50',
          )
        "
      >
        <div class="flex items-start gap-2">
          <button type="button" class="min-w-0 flex-1 text-left" @click="state.activeUid.value = s.uid">
            <span class="block truncate text-sm font-medium">{{ s.label }}</span>
            <span class="mt-1 flex flex-wrap gap-1 text-[11px]">
              <template v-for="k in (['mask', 'plane', 'accepts'] as const)" :key="k">
                <span
                  :class="
                    cn(
                      'inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-medium',
                      state.statuses.value.get(s.uid)?.[k] ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                    )
                  "
                >
                  <Check v-if="state.statuses.value.get(s.uid)?.[k]" class="h-3 w-3" />
                  {{ k === 'mask' ? 'Area' : k === 'plane' ? 'Plane' : 'Products' }}
                </span>
              </template>
              <span v-if="state.statuses.value.get(s.uid)?.planeIssue" class="rounded-full bg-amber-500/15 px-1.5 py-px font-medium text-amber-700 dark:text-amber-400">
                Plane looks {{ state.statuses.value.get(s.uid)?.planeIssue === 'skewed' ? 'skewed' : 'twisted' }}
              </span>
            </span>
          </button>
          <div class="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button type="button" class="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" :disabled="i === 0" aria-label="Move up" @click="state.moveSurface(s.uid, -1)"><ArrowUp class="h-3.5 w-3.5" /></button>
            <button type="button" class="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" :disabled="i === state.doc.surfaces.length - 1" aria-label="Move down" @click="state.moveSurface(s.uid, 1)"><ArrowDown class="h-3.5 w-3.5" /></button>
            <button type="button" class="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Delete surface" @click="state.removeSurface(s.uid)"><Trash2 class="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <Button
          v-if="state.statuses.value.get(s.uid)?.next"
          size="sm"
          variant="secondary"
          class="mt-2 h-7 w-full text-xs"
          @click="emit('next', s.uid, state.statuses.value.get(s.uid)!.next!)"
        >{{ NEXT[state.statuses.value.get(s.uid)!.next!] }} →</Button>
      </li>
    </ul>
  </div>
</template>
