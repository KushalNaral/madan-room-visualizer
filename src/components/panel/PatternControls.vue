<script setup lang="ts">
import { computed } from 'vue'
import { RotateCcw } from 'lucide-vue-next'
import { cn } from '../../lib/utils'
import { useVisualizer } from '../context'
import { Slider } from '../ui/slider'

const props = defineProps<{ surfaceId: string }>()
const { state } = useVisualizer()

const sel = computed(() => state.selections[props.surfaceId])
const item = computed(() => state.appliedBySurface.value.get(props.surfaceId))
const stretch = computed(() => item.value?.variant.tiling === 'stretch')
const scale = computed(() => sel.value?.scale ?? 1)
const rotation = computed(() => sel.value?.rotation ?? 0)
const isDefault = computed(() => scale.value === 1 && !rotation.value && !sel.value?.offsetX && !sel.value?.offsetY)

const ROTATIONS = [0, 45, 90, 135]
const tile = computed(() => item.value?.variant.tileSizeCm)

function setScale(v?: number[]) {
  if (v) state.adjust(props.surfaceId, { scale: Math.round(v[0] * 100) / 100 })
}
function setOffset(axis: 'offsetX' | 'offsetY', v?: number[]) {
  if (v) state.adjust(props.surfaceId, { [axis]: Math.round(v[0]) })
}
</script>

<template>
  <div v-if="sel && item" class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <p class="text-sm font-semibold">Pattern</p>
        <p class="text-xs text-muted-foreground">
          {{ stretch ? 'One piece across the surface' : `Repeat ${tile?.w}×${tile?.h} cm` }}
        </p>
      </div>
      <button
        type="button"
        :disabled="isDefault"
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        @click="state.resetAdjust(surfaceId)"
      >
        <RotateCcw class="h-3 w-3" /> Reset
      </button>
    </div>

    <div class="space-y-2">
      <div class="flex justify-between text-xs"><span class="font-medium">Scale</span><span class="tabular-nums text-muted-foreground">{{ Math.round(scale * 100) }}%</span></div>
      <Slider :model-value="[scale]" :min="0.25" :max="stretch ? 1.5 : 3" :step="0.05" label="Pattern scale" @update:model-value="setScale" />
    </div>

    <div class="space-y-2">
      <p class="text-xs font-medium">Rotation</p>
      <div class="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
        <button
          v-for="r in ROTATIONS"
          :key="r"
          type="button"
          :class="cn('rounded-md py-1 text-xs font-medium tabular-nums transition-colors', rotation === r ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground')"
          @click="state.adjust(surfaceId, { rotation: r })"
        >
          {{ r }}°
        </button>
      </div>
    </div>

    <div v-if="!stretch" class="grid grid-cols-2 gap-3">
      <div class="space-y-2">
        <div class="flex justify-between text-xs"><span class="font-medium">Shift ↔</span><span class="tabular-nums text-muted-foreground">{{ sel.offsetX ?? 0 }} cm</span></div>
        <Slider :model-value="[sel.offsetX ?? 0]" :min="-(tile?.w ?? 50)" :max="tile?.w ?? 50" :step="1" label="Horizontal shift" @update:model-value="(v) => setOffset('offsetX', v)" />
      </div>
      <div class="space-y-2">
        <div class="flex justify-between text-xs"><span class="font-medium">Shift ↕</span><span class="tabular-nums text-muted-foreground">{{ sel.offsetY ?? 0 }} cm</span></div>
        <Slider :model-value="[sel.offsetY ?? 0]" :min="-(tile?.h ?? 50)" :max="tile?.h ?? 50" :step="1" label="Vertical shift" @update:model-value="(v) => setOffset('offsetY', v)" />
      </div>
    </div>
  </div>
</template>
