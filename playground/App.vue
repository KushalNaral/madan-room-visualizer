<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { Moon, Sun } from 'lucide-vue-next'
import { RoomVisualizer, type AppliedItem, type Product, type Room } from '../src'
import { MockProductSource } from '../src/mock'

const RoomEditor = defineAsyncComponent(() => import('./editor/RoomEditor.vue'))

const source = new MockProductSource({ latency: 120 })
const tab = ref<'visualizer' | 'editor'>('visualizer')
const visualizerKey = ref(0)
const previewRoomId = ref<string>()
const dark = ref(false)
const log = ref<string[]>([])

function record(line: string) {
  log.value = [`${new Date().toLocaleTimeString()}  ${line}`, ...log.value].slice(0, 5)
}

function onAddToCart(items: AppliedItem[]) {
  record(`addToCart → ${items.map((i) => `${i.variant.sku}×${i.estimate.units}`).join(', ')}`)
}
function onViewProduct(p: Product) {
  record(`viewProduct → ${p.sku}`)
}

function preview(room: Room) {
  source.upsertRoom(room)
  previewRoomId.value = room.id
  visualizerKey.value++
  tab.value = 'visualizer'
}

function toggleDark() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
}
</script>

<template>
  <div class="flex min-h-screen flex-col bg-muted/30">
    <header class="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div class="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-black text-primary-foreground">MF</div>
          <div class="leading-tight">
            <p class="font-semibold">Madan Furnishers</p>
            <p class="text-xs text-muted-foreground">Room Visualizer · playground</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <nav class="flex rounded-xl bg-muted p-1 text-sm font-medium">
            <button
              v-for="t in (['visualizer', 'editor'] as const)"
              :key="t"
              type="button"
              class="rounded-lg px-3 py-1.5 capitalize transition-colors"
              :class="tab === t ? 'bg-background shadow' : 'text-muted-foreground hover:text-foreground'"
              @click="tab = t"
            >
              {{ t === 'editor' ? 'Room editor' : 'Visualizer' }}
            </button>
          </nav>
          <button type="button" class="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Toggle dark mode" @click="toggleDark">
            <Moon v-if="!dark" class="h-4 w-4" /><Sun v-else class="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-[1600px] flex-1 p-4">
      <div v-show="tab === 'visualizer'" class="h-[calc(100vh-7.5rem)] min-h-[680px]">
        <RoomVisualizer
          :key="visualizerKey"
          :source="source"
          :initial-room-id="previewRoomId"
          :sync-url="!previewRoomId"
          @add-to-cart="onAddToCart"
          @view-product="onViewProduct"
        />
      </div>
      <RoomEditor v-if="tab === 'editor'" :source="source" @preview="preview" />

      <section v-if="tab === 'visualizer' && log.length" class="mt-3 rounded-xl border border-border bg-background p-3">
        <h2 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Host events</h2>
        <ul class="space-y-0.5 font-mono text-xs">
          <li v-for="(l, i) in log" :key="i">{{ l }}</li>
        </ul>
      </section>
    </main>
  </div>
</template>
