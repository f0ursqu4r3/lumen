import type { Component } from 'vue'
import { LoaderCircle, Clock, Hand, CircleCheck, CircleX, Ban, SkipForward } from '@lucide/vue'
import type { PipelineTone } from '@/gitlab/pipelineParams'

// Single source of truth for how a pipeline tone looks, shared by the status
// badge and the stage Stepper so a running stage and a running pipeline read the
// same. `spin` marks tones whose icon should animate.
export interface ToneVisual {
  icon: Component
  spin?: boolean
  /** Status colour for the compact dot / Stepper indicator. */
  dot: string
  /** Full pill styling for the badge. */
  pill: string
  /** Indicator (filled circle) styling for the Stepper. */
  indicator: string
}

export const TONE_VISUALS: Record<PipelineTone, ToneVisual> = {
  running: {
    icon: LoaderCircle,
    spin: true,
    dot: 'bg-sky-400 shadow-[0_0_0_3px_oklch(0.7_0.15_236/0.18)]',
    pill: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
    indicator: 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30',
  },
  queued: {
    icon: Clock,
    dot: 'bg-amber-400',
    pill: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
    indicator: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
  },
  manual: {
    icon: Hand,
    dot: 'bg-violet-400',
    pill: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
    indicator: 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30',
  },
  success: {
    icon: CircleCheck,
    dot: 'bg-emerald-400',
    pill: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
    indicator: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
  },
  failed: {
    icon: CircleX,
    dot: 'bg-red-400',
    pill: 'border-red-500/25 bg-red-500/10 text-red-300',
    indicator: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
  },
  canceled: {
    icon: Ban,
    dot: 'bg-muted-foreground/60',
    pill: 'border-border bg-muted text-muted-foreground',
    indicator: 'bg-muted text-muted-foreground ring-1 ring-border',
  },
  skipped: {
    icon: SkipForward,
    dot: 'bg-muted-foreground/50',
    pill: 'border-border bg-muted text-muted-foreground',
    indicator: 'bg-muted text-muted-foreground ring-1 ring-border',
  },
}
