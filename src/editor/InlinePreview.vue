<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import type { Room, Variant } from '../types'
import { RoomRenderer } from '../render/RoomRenderer'

/**
 * A test pattern on every surface, rendered the way shoppers will see it: squares should look
 * square and lie flat on each plane. Shows mapping mistakes without leaving the editor.
 */
const props = defineProps<{ room: Room }>()

const canvas = ref<HTMLCanvasElement>()
const renderer = shallowRef<RoomRenderer | null>(null)
const error = ref<string | null>(null)

const CHECKER: Variant = {
  id: 'editor-checker',
  sku: 'checker',
  name: 'Test pattern',
  colorHex: '#f5f5f4',
  textureUrl: 'procedural:checker?base=%23f5f5f4&alt=%23ea580c',
  tileSizeCm: { w: 50, h: 50 },
  finish: 'matte',
}

async function render() {
  const r = renderer.value
  if (!r || !props.room.imageUrl || !props.room.surfaces.length) return
  try {
    await r.setRoom(props.room)
    await Promise.all(props.room.surfaces.map((s) => r.setMaterial(s.id, CHECKER)))
    error.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

onMounted(() => {
  try {
    renderer.value = new RoomRenderer(canvas.value!)
    void render()
  } catch {
    error.value = 'This browser has no WebGL2, so the preview is unavailable.'
  }
})
watchDebounced(() => JSON.stringify(props.room), render, { debounce: 500 })
watch(() => props.room.imageUrl, render)
onBeforeUnmount(() => renderer.value?.dispose())
</script>

<template>
  <div class="relative overflow-hidden rounded-xl bg-muted ring-1 ring-border" :style="{ aspectRatio: `${room.width || 16} / ${room.height || 10}` }">
    <canvas ref="canvas" class="absolute inset-0 h-full w-full" />
    <p v-if="!room.surfaces.length" class="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
      Surfaces show here once they have an area and a plane.
    </p>
    <p v-if="error" class="absolute inset-x-0 bottom-0 bg-destructive/90 px-2 py-1 text-xs text-destructive-foreground">{{ error }}</p>
  </div>
</template>
