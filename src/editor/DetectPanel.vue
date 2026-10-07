<script setup lang="ts">
import { computed } from 'vue'
import { Check, Loader2, ScanSearch, Sparkles } from 'lucide-vue-next'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import type { Candidate, DetectPhase } from './useDetection'

/** "Detect surfaces": run the model, then tick the proposals to keep. */
const props = defineProps<{
  candidates: Candidate[]
  running: boolean
  ran: boolean
  error: string | null
  phase: DetectPhase
  /** Models still arriving, 0–100 across all of them; null once they're in. */
  download: number | null
  /** The whole job as one bar, 0–100, while it runs. */
  overall: number | null
  /** Nothing is in the browser's cache yet, so the first run includes the download. */
  firstRun: boolean
  available: boolean
}>()
const emit = defineEmits<{ detect: []; toggle: [key: string]; setAll: [keep: boolean]; accept: []; dismiss: [] }>()

const status = computed(() => {
  if (!props.running) return props.ran ? 'Detect again' : 'Detect surfaces'
  if (props.phase === 'model') return props.download != null ? `Getting ready… ${props.download}%` : 'Getting ready…'
  if (props.phase === 'refine') return 'Tidying edges…'
  return 'Finding surfaces…'
})
/** Shown under the button while the background download is still going. */
const preparing = computed(() => !props.running && props.download != null)
const kept = computed(() => props.candidates.filter((c) => c.keep).length)
const sure = (c: Candidate) => (c.confidence >= 0.8 ? 'Sure' : c.confidence >= 0.55 ? 'Likely' : 'Unsure')
</script>

<template>
  <div class="space-y-3">
    <div v-if="!candidates.length" class="space-y-2.5 rounded-xl border border-border bg-muted/40 p-3">
      <p class="text-sm font-medium">Find walls, floor, curtains and furniture automatically</p>

      <Button size="sm" class="w-full" :disabled="running || !available" @click="emit('detect')">
        <Loader2 v-if="running" class="animate-spin" /><ScanSearch v-else />
        {{ status }}
      </Button>
      <div v-if="running && overall != null" class="h-1 overflow-hidden rounded-full bg-background" role="progressbar" :aria-valuenow="overall" aria-valuemin="0" aria-valuemax="100">
        <div class="h-full rounded-full bg-primary transition-all duration-300" :style="{ width: `${overall}%` }" />
      </div>
      <p v-if="preparing" class="text-[11px] text-muted-foreground">Getting detection ready in the background… {{ download }}%</p>
      <p v-if="firstRun && (preparing || (running && phase === 'model'))" class="text-[11px] text-muted-foreground">First time only: this takes about a minute, then it’s instant.</p>
      <p v-else-if="!running && !ran" class="text-[11px] text-muted-foreground">Runs in your browser; your photo isn’t uploaded for this.</p>
      <p v-if="!available" class="text-xs text-muted-foreground">Automatic detection isn't set up here; add surfaces and select their areas by hand.</p>
      <p v-if="error" class="text-xs text-destructive" role="alert">{{ error }}</p>
      <p v-else-if="ran && !running" class="text-xs text-muted-foreground">Nothing new found. Add surfaces by hand with the magic select tool.</p>
    </div>

    <div v-else class="space-y-2">
      <div class="flex items-center gap-2">
        <p class="flex-1 text-sm font-medium">Found {{ candidates.length }}. Keep the ones you want:</p>
        <button type="button" class="text-xs font-medium text-primary hover:underline" @click="emit('setAll', kept < candidates.length)">
          {{ kept < candidates.length ? 'All' : 'None' }}
        </button>
      </div>
      <ul class="grid grid-cols-2 gap-2">
        <li v-for="c in candidates" :key="c.key">
          <button
            type="button"
            :aria-pressed="c.keep"
            :class="cn('relative block w-full overflow-hidden rounded-lg text-left ring-2 transition', c.keep ? 'ring-primary' : 'opacity-60 ring-transparent hover:opacity-90')"
            @click="emit('toggle', c.key)"
          >
            <img :src="c.thumbnail" alt="" class="block w-full" />
            <span class="absolute left-1.5 top-1.5 flex gap-1">
              <span
                :class="cn('rounded-full px-1.5 py-px text-[10px] font-semibold shadow', c.confidence >= 0.8 ? 'bg-emerald-600 text-white' : c.confidence >= 0.55 ? 'bg-background/90 text-foreground' : 'bg-amber-500 text-white')"
                :title="`The model is ${Math.round(c.confidence * 100)}% sure`"
                >{{ sure(c) }}</span
              >
              <span v-if="c.refined" class="flex items-center rounded-full bg-background/90 px-1 py-px text-foreground shadow" title="Outline sharpened"><Sparkles class="h-2.5 w-2.5" /></span>
            </span>
            <span class="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-4 text-[11px] font-medium text-white">
              <span>{{ c.label }}</span>
              <span class="tabular-nums opacity-80">{{ Math.round(c.coverage * 100) }}%</span>
            </span>
            <span v-if="c.keep" class="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
              <Check class="h-3 w-3" :stroke-width="3" />
            </span>
          </button>
        </li>
      </ul>
      <p class="text-[11px] text-muted-foreground">You can fix any area afterwards with the brush, eraser or magic select.</p>
      <div class="flex gap-2">
        <Button size="sm" class="flex-1" :disabled="!kept" @click="emit('accept')">Add {{ kept }}</Button>
        <Button size="sm" variant="ghost" @click="emit('dismiss')">Discard</Button>
      </div>
    </div>
  </div>
</template>
