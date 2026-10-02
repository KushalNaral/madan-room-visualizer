<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Columns2, Download, Expand, Image as ImageIcon, Keyboard, LayoutGrid, MapPin, MapPinOff, Minus, Plus, Redo2, Share2, Shrink, Undo2,
} from 'lucide-vue-next'
import { cn } from '../../lib/utils'
import { useVisualizer } from '../context'
import { Popover } from '../ui/popover'
import { Tip } from '../ui/tooltip'

const ctx = useVisualizer()
const { state, ui, isFullscreen } = ctx
const downloadOpen = ref(false)
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

const surfaceCount = computed(() => state.room.value?.surfaces.length ?? 0)

const btn = 'flex h-8 w-8 items-center justify-center rounded-lg text-foreground/80 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const group = 'flex items-center gap-0.5 rounded-xl border border-border/60 bg-background/80 p-1 shadow-lg backdrop-blur-xl'

const shortcuts = [
  ['Click', 'Select a surface'],
  [`${mod} Z`, 'Undo'],
  [`${mod} ⇧ Z`, 'Redo'],
  ['[ ]', 'Previous / next surface'],
  ['C', 'Before / after'],
  ['H', 'Show / hide hotspots'],
  ['F', 'Fullscreen'],
  [`${mod} scroll`, 'Zoom'],
  ['Double-click', 'Zoom in / reset'],
  ['Esc', 'Deselect'],
]

async function download(kind: 'image' | 'moodboard') {
  downloadOpen.value = false
  await ctx.actions.download(kind)
}
</script>

<template>
  <div class="pointer-events-none absolute inset-x-3 top-3 z-30 flex flex-wrap items-start justify-between gap-2">
    <div :class="cn(group, 'pointer-events-auto hidden px-3 py-1.5 sm:flex')">
      <div class="leading-tight">
        <p class="text-sm font-semibold">{{ state.room.value?.name ?? 'Loading…' }}</p>
        <p class="text-[11px] text-muted-foreground">
          {{ state.applied.value.length }} of {{ surfaceCount }} surfaces styled
        </p>
      </div>
    </div>

    <div class="pointer-events-auto ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
      <div :class="group">
        <Tip text="Undo" :shortcut="`${mod} Z`">
          <button type="button" :class="btn" aria-label="Undo" :disabled="!state.canUndo.value" @click="state.undo()"><Undo2 class="h-4 w-4" /></button>
        </Tip>
        <Tip text="Redo" :shortcut="`${mod} ⇧ Z`">
          <button type="button" :class="btn" aria-label="Redo" :disabled="!state.canRedo.value" @click="state.redo()"><Redo2 class="h-4 w-4" /></button>
        </Tip>
      </div>

      <div :class="cn(group, 'hidden sm:flex')">
        <Tip text="Zoom out">
          <button type="button" :class="btn" aria-label="Zoom out" :disabled="ui.zoom.value <= 1" @click="ctx.actions.zoomBy(1 / 1.4)"><Minus class="h-4 w-4" /></button>
        </Tip>
        <Tip text="Reset view" :shortcut="'0'">
          <button type="button" class="h-8 min-w-[3.25rem] rounded-lg px-1 text-xs font-semibold tabular-nums text-foreground/80 hover:bg-accent" @click="ctx.actions.resetView()">
            {{ Math.round(ui.zoom.value * 100) }}%
          </button>
        </Tip>
        <Tip text="Zoom in">
          <button type="button" :class="btn" aria-label="Zoom in" :disabled="ui.zoom.value >= 4" @click="ctx.actions.zoomBy(1.4)"><Plus class="h-4 w-4" /></button>
        </Tip>
      </div>

      <div :class="group">
        <Tip :text="ui.hotspots.value ? 'Hide hotspots' : 'Show hotspots'" shortcut="H">
          <button type="button" :class="btn" aria-label="Toggle hotspots" :aria-pressed="ui.hotspots.value" @click="ui.hotspots.value = !ui.hotspots.value">
            <MapPin v-if="ui.hotspots.value" class="h-4 w-4" /><MapPinOff v-else class="h-4 w-4" />
          </button>
        </Tip>
        <Tip text="Before / after" shortcut="C">
          <button
            type="button"
            :class="cn(btn, ui.compare.value && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')"
            aria-label="Compare before and after"
            :aria-pressed="ui.compare.value"
            :disabled="!state.applied.value.length"
            @click="ui.compare.value = !ui.compare.value"
          >
            <Columns2 class="h-4 w-4" />
          </button>
        </Tip>
        <Tip :text="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'" shortcut="F">
          <button type="button" :class="btn" aria-label="Toggle fullscreen" @click="ctx.actions.toggleFullscreen()">
            <Shrink v-if="isFullscreen" class="h-4 w-4" /><Expand v-else class="h-4 w-4" />
          </button>
        </Tip>
        <Popover side="bottom" align="end" class="w-64 p-3">
          <template #trigger>
            <button type="button" :class="cn(btn, 'hidden md:flex')" aria-label="Keyboard shortcuts"><Keyboard class="h-4 w-4" /></button>
          </template>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shortcuts</p>
          <dl class="space-y-1.5 text-sm">
            <div v-for="[k, d] in shortcuts" :key="k" class="flex items-center justify-between gap-3">
              <dt class="text-muted-foreground">{{ d }}</dt>
              <dd><kbd class="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{{ k }}</kbd></dd>
            </div>
          </dl>
        </Popover>
      </div>

      <div :class="group">
        <Tip text="Copy share link">
          <button type="button" :class="btn" aria-label="Share" @click="ctx.actions.share()"><Share2 class="h-4 w-4" /></button>
        </Tip>
        <Popover v-model:open="downloadOpen" side="bottom" align="end" class="w-60 p-1.5">
          <template #trigger>
            <button type="button" :class="btn" aria-label="Download"><Download class="h-4 w-4" /></button>
          </template>
          <button type="button" class="flex w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-accent" @click="download('image')">
            <ImageIcon class="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span><span class="block text-sm font-medium">Room image</span><span class="block text-xs text-muted-foreground">High-resolution JPEG</span></span>
          </button>
          <button type="button" class="flex w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-accent" @click="download('moodboard')">
            <LayoutGrid class="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span><span class="block text-sm font-medium">Moodboard</span><span class="block text-xs text-muted-foreground">Room + swatches + product list</span></span>
          </button>
        </Popover>
      </div>
    </div>
  </div>
</template>
