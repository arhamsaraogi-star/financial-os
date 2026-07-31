'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '@/lib/store'
import { SUGGESTED_QUESTIONS, ask, type Answer } from '@/lib/engine/advisor'
import { Badge, Button, Card, PageHeader } from '@/components/ui'

const VERDICT = {
  yes: { label: 'Yes', colour: 'var(--color-good)' },
  no: { label: 'No', colour: 'var(--color-bad)' },
  careful: { label: 'Careful', colour: 'var(--color-warn)' },
  info: { label: 'Here you go', colour: 'var(--color-accent)' },
}

const TONE = {
  urgent: { badge: 'bad' as const, word: 'Needs attention', bar: 'bg-bad' },
  warning: { badge: 'warn' as const, word: 'Worth a look', bar: 'bg-warn' },
  idea: { badge: 'accent' as const, word: 'Idea', bar: 'bg-accent' },
  good: { badge: 'good' as const, word: 'All good', bar: 'bg-good' },
}

export default function Advisor() {
  const { state, advice } = useStore()
  const [question, setQuestion] = useState('')
  const [answers, setAnswers] = useState<Answer[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    setAnswers((prev) => [ask(state, trimmed), ...prev])
    setQuestion('')
    inputRef.current?.blur()
  }

  return (
    <div className="rise space-y-4 pb-4">
      <PageHeader
        title="Advice"
        lede="Answers worked out from your own numbers — not a chatbot, and nothing leaves your phone."
      />

      <Card padded={false}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit(question)
          }}
          className="flex gap-2 p-3"
        >
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Can I afford a 90k laptop?"
            aria-label="Ask a question"
          />
          <Button type="submit" variant="accent" disabled={!question.trim()}>
            Ask
          </Button>
        </form>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-3">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => submit(q)}
              className="shrink-0 rounded-full border border-line bg-surface-2 px-3 py-2 text-[13px] text-muted active:bg-surface-3"
            >
              {q}
            </button>
          ))}
        </div>
      </Card>

      <AnimatePresence initial={false}>
        {answers.map((a, i) => (
          <motion.div
            key={`${a.question}-${answers.length - i}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <AnswerCard answer={a} />
          </motion.div>
        ))}
      </AnimatePresence>

      {answers.length === 0 && (
        <>
          <h2 className="label px-1 pt-2">What I'd flag right now</h2>
          <div className="space-y-2">
            {advice.map((ad) => {
              const t = TONE[ad.tone]
              const body = (
                <Card className={ad.href ? 'active:opacity-70' : ''}>
                  <div className="flex gap-3">
                    <span className={`w-[3px] shrink-0 rounded-full ${t.bar}`} />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <Badge tone={t.badge}>{t.word}</Badge>
                        {ad.metric && <span className="tnum text-[12.5px] text-faint">{ad.metric}</span>}
                      </div>
                      <p className="text-[15.5px] leading-snug">{ad.title}</p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-faint">{ad.detail}</p>
                      {ad.action && <p className="mt-2 text-[13px] text-accent">{ad.action} →</p>}
                    </div>
                  </div>
                </Card>
              )
              return ad.href ? (
                <Link key={ad.id} href={ad.href} className="block">
                  {body}
                </Link>
              ) : (
                <div key={ad.id}>{body}</div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function AnswerCard({ answer }: { answer: Answer }) {
  const v = VERDICT[answer.verdict]

  return (
    <Card padded={false}>
      <div className="border-b border-line-soft px-4 py-3">
        <p className="text-[13.5px] text-faint">{answer.question}</p>
      </div>

      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <span
            className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
            style={{ background: `${v.colour}1f`, color: v.colour }}
          >
            {v.label}
          </span>
        </div>
        <h3 className="display text-[21px] leading-tight">{answer.headline}</h3>

        {answer.lines.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-3">
            {answer.lines.map((l) => (
              <div key={l.label} className="rounded-[var(--radius-control)] border border-line-soft bg-surface px-3 py-2.5">
                <dt className="label mb-1 truncate">{l.label}</dt>
                <dd className="tnum truncate text-[14.5px]">{l.value}</dd>
                {l.detail && <dd className="mt-0.5 truncate text-[11.5px] text-ghost">{l.detail}</dd>}
              </div>
            ))}
          </dl>
        )}

        <div className="mt-4 border-l-2 pl-3.5" style={{ borderColor: v.colour }}>
          <p className="text-[14px] leading-relaxed text-muted">{answer.reasoning}</p>
        </div>

        {answer.recommendation && (
          <div className="mt-3 rounded-[var(--radius-control)] border border-accent/25 bg-accent-wash/70 px-3.5 py-3">
            <div className="label mb-1">Suggestion</div>
            <p className="text-[14px] leading-relaxed text-accent">{answer.recommendation}</p>
          </div>
        )}
      </div>
    </Card>
  )
}
