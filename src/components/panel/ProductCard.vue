<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import { unitSuffix } from '../../lib/estimate'
import { cn } from '../../lib/utils'
import type { Product } from '../../types'
import { useVisualizer } from '../context'
import Swatch from '../Swatch.vue'

const props = defineProps<{ product: Product; activeVariantId?: string | null; disabled?: boolean }>()
const emit = defineEmits<{ open: [] }>()
const { formatPrice, renderer } = useVisualizer()

const hero = computed(() => props.product.variants.find((v) => v.id === props.activeVariantId) ?? props.product.variants[0])
const MAX_DOTS = 5
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    :class="
      cn(
        'group flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left text-card-foreground transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
        activeVariantId ? 'border-primary ring-1 ring-primary' : 'border-border',
      )
    "
    @mouseenter="renderer?.prefetch(hero)"
    @click="emit('open')"
  >
    <span class="relative block aspect-[4/3] overflow-hidden bg-muted">
      <Swatch :variant="hero" :size="180" class="h-full w-full transition-transform duration-500 group-hover:scale-110" />
      <span class="absolute left-2 top-2 flex flex-wrap gap-1">
        <span
          v-for="b in product.badges ?? []"
          :key="b"
          class="rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground shadow-sm backdrop-blur"
        >{{ b }}</span>
        <span
          v-if="hero.approximate"
          class="rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow-sm backdrop-blur"
          title="Preview uses the product photo, not a material scan"
        >Approx.</span>
      </span>
      <span v-if="activeVariantId" class="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
        <Check class="h-3.5 w-3.5" :stroke-width="3" />
      </span>
      <span class="absolute inset-x-2 bottom-2 translate-y-2 rounded-lg bg-background/90 py-1 text-center text-xs font-semibold opacity-0 shadow backdrop-blur transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100">
        {{ activeVariantId ? 'Edit' : 'Try it' }}
      </span>
    </span>
    <span class="flex flex-1 flex-col gap-1 p-2.5">
      <span class="line-clamp-1 text-sm font-semibold">{{ product.name }}</span>
      <span class="flex items-center justify-between gap-2">
        <span v-if="product.variants[0]?.price" class="text-xs text-muted-foreground">
          <span class="font-semibold text-foreground">{{ formatPrice(product.variants[0].price) }}</span>{{ unitSuffix(product) }}
        </span>
        <span class="flex items-center -space-x-1">
          <span
            v-for="v in product.variants.slice(0, MAX_DOTS)"
            :key="v.id"
            class="h-3.5 w-3.5 rounded-full ring-2 ring-card"
            :style="{ backgroundColor: v.colorHex }"
          />
          <span v-if="product.variants.length > MAX_DOTS" class="pl-1.5 text-[10px] font-medium text-muted-foreground">+{{ product.variants.length - MAX_DOTS }}</span>
        </span>
      </span>
    </span>
  </button>
</template>
