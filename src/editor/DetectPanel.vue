<script setup lang="ts">
import { Check, Loader2, ScanSearch } from 'lucide-vue-next'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import type { Candidate } from './useDetection'

/** "Detect surfaces": run the model, then tick the proposals to keep. */
defineProps<{
  candidates: Candidate[]
  running: boolean
  ran: boolean
  error: string | null
  progress: number | null
  available: boolean
}>()
const emit = defineEmits<{ detect: []; toggle: [key: string]; accept: []; dismiss: [] }>()
</script>

<template>
  <div class="space-y-3">
    <div v-if="!candidates.length" class="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
      <p class="text-sm font-medium">Find walls, floor, curtains and furniture automatically</p>
      <p class="text-xs text-muted-foreground">
        Runs in your browser. The first time it downloads a ~30 MB model, which the browser then keeps.
      </p>
      <Button size="sm" class="w-full" :disabled="running || !available" @click="emit('detect')">
        <Loader2 v-if="running" class="animate-spin" /><ScanSearch v-else />
        {{ running ? (progress != null && progress < 100 ? `Downloading model ${progress}%` : 'Looking at the photo…') : ran ? 'Detect again' : 'Detect surfaces' }}
      </Button>
      <p v-if="!available" class="text-xs text-muted-foreground">Automatic detection isn't set up here; add surfaces and select their areas by hand.</p>
      <p v-if="error" class="text-xs text-destructive" role="alert">{{ error }}</p>
      <p v-else-if="ran && !running" class="text-xs text-muted-foreground">Nothing new found. Add surfaces by hand with the magic select tool.</p>
    </div>

    <div v-else class="space-y-2">
      <p class="text-sm font-medium">Found {{ candidates.length }} surfaces. Keep the ones you want:</p>
      <ul class="grid grid-cols-2 gap-2">
        <li v-for="c in candidates" :key="c.key">
          <button
            type="button"
            :aria-pressed="c.keep"
            :class="cn('relative block w-full overflow-hidden rounded-lg text-left ring-2 transition', c.keep ? 'ring-primary' : 'opacity-60 ring-transparent hover:opacity-90')"
            @click="emit('toggle', c.key)"
          >
            <img :src="c.thumbnail" alt="" class="block w-full" />
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
      <div class="flex gap-2">
        <Button size="sm" class="flex-1" :disabled="!candidates.some((c) => c.keep)" @click="emit('accept')">
          Add {{ candidates.filter((c) => c.keep).length }}
        </Button>
        <Button size="sm" variant="ghost" @click="emit('dismiss')">Discard</Button>
      </div>
    </div>
  </div>
</template>
