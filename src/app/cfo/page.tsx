'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '@/lib/store'
import { money } from '@/lib/format'
import { SUGGESTED_QUESTIONS, askCfo, type CfoAnswer } from '@/lib/engine/advisor'
import { Badge, Button, PageHeader, Panel, Stat } from '@/components/ui'
import { IconCfo, IconSpark } from '@/components/icons'

const VERDICT = {
  yes: { label: 'Yes', tone: 'positive' as const, colour: 'var(--color-positive)' },
  no: { label: 'No', tone: 'negative' as const, colour: 'var(--color-negative)' },
  caution: { label: 'With care', tone: 'caution' as const, colour: 'var(--color-caution)' },
  info: { label: 'Context', tone: 'neutral' as const, colour: 'var(--color-brass)' },
}

export default function Cfo() {
  const { state, metrics, forecast, advice } = useStore()
  const [question, setQuestion] = useState('')
  const [answers, setAnswers] = useState<CfoAnswer[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // `/` focuses the question box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const ask = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setAnswers((prev) => [askCfo(state, trimmed), ...prev])
    setQuestion('')
  }

  return (
    <div className="rise">
      <PageHeader
        eyebrow="Advisory"
        title="Ask the CFO"
        lede="Not a chatbot. Every answer is computed from your accounts, obligations and projection — the same engines that draw the dashboards — and shows the figures it used to reach the conclusion."
      />

      <Panel className="mb-4" padded={false}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(question)
          }}
          className="flex items-center gap-2 p-3"
        >
          <span className="pl-1 text-brass">
            <IconCfo />
          </span>
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Can I afford a laptop for 90k?"
            className="!border-0 !bg-transparent !text-[14px] focus:!shadow-none"
          />
          <Button type="submit" variant="brass" size="sm">
            Ask
          </Button>
        </form>
        <div className="flex flex-wrap gap-1.5 border-t border-line-soft p-3">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              className="rounded-full border border-line bg-panel-2 px-2.5 py-1 text-[11px] text-faint transition-colors hover:border-brass-deep hover:text-parchment"
            >
              {q}
            </button>
          ))}
        </div>
      </Panel>

      <AnimatePresence initial={false}>
        {answers.map((a, i) => (
          <motion.div
            key={`${a.question}-${answers.length - i}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mb-4"
          >
            <AnswerCard answer={a} />
          </motion.div>
        ))}
      </AnimatePresence>

      {!answers.length && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
            <div className="bg-panel p-4">
              <Stat label="Liquid now" value={money(forecast.openingTotal)} />
            </div>
            <div className="bg-panel p-4">
              <Stat label="Free after reserves" value={money(freeCash(state, forecast.trough.total))} tone="brass" />
            </div>
            <div className="bg-panel p-4">
              <Stat label="Monthly surplus" value={money(metrics.surplus)} tone={metrics.surplus > 0 ? 'positive' : 'negative'} />
            </div>
            <div className="bg-panel p-4">
              <Stat label="Risk" value={`${forecast.riskScore}/100`} sub={forecast.riskLevel} />
            </div>
          </div>

          <Panel title="Standing advice" subtitle="What the engines flag without being asked">
            <ul className="space-y-4">
              {advice.map((ad) => (
                <li key={ad.id} className="flex gap-3">
                  <span className="mt-0.5 shrink-0 text-brass">
                    <IconSpark />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px]">{ad.title}</span>
                      {ad.metric && <Badge tone="brass">{ad.metric}</Badge>}
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-faint">{ad.detail}</p>
                    {ad.action && <p className="mt-1.5 text-[11px] text-brass">→ {ad.action}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </div>
  )
}

function AnswerCard({ answer }: { answer: CfoAnswer }) {
  const v = VERDICT[answer.verdict]

  return (
    <Panel raised padded={false}>
      <div className="border-b border-line-soft px-4 py-3">
        <div className="eyebrow mb-1.5">You asked</div>
        <p className="text-[13px] text-dim">{answer.question}</p>
      </div>

      <div className="px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <span
            className="rounded-[3px] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em]"
            style={{ background: `${v.colour}1a`, color: v.colour }}
          >
            {v.label}
          </span>
          <h3 className="display text-[19px] leading-tight sm:text-[22px]">{answer.headline}</h3>
        </div>

        {answer.lines.length > 0 && (
          <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[5px] border border-line-soft bg-line-soft sm:grid-cols-4">
            {answer.lines.map((l) => (
              <div key={l.label} className="bg-panel-2 px-3 py-2.5">
                <dt className="eyebrow mb-1 truncate">{l.label}</dt>
                <dd className="tnum truncate text-[13px]">{l.value}</dd>
                {l.detail && <dd className="mt-0.5 truncate text-[10px] text-ghost">{l.detail}</dd>}
              </div>
            ))}
          </dl>
        )}

        <div className="border-l-2 pl-3.5" style={{ borderColor: v.colour }}>
          <div className="eyebrow mb-1.5">Reasoning</div>
          <p className="text-[12.5px] leading-relaxed text-dim">{answer.reasoning}</p>
        </div>

        {answer.recommendation && (
          <div className="mt-3 rounded-[4px] border border-brass/25 bg-brass-wash/60 px-3.5 py-2.5">
            <div className="eyebrow mb-1">Recommendation</div>
            <p className="text-[12.5px] leading-relaxed text-brass">{answer.recommendation}</p>
          </div>
        )}
      </div>
    </Panel>
  )
}

/** Trough liquidity minus anything already spoken for by the emergency fund. */
function freeCash(state: ReturnType<typeof useStore>['state'], trough: number) {
  const ef = state.goals.find((g) => g.kind === 'emergency_fund')
  return Math.max(0, trough - (ef?.current ?? 0))
}
