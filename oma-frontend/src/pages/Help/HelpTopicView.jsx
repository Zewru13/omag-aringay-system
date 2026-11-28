import { useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { questionsFor } from '../Manual/manualFaq.js'
import ManualQuestions from '../Manual/ManualQuestions.jsx'
import AboutSystem from '../Manual/AboutSystem.jsx'
import HelpPicture from './HelpPicture.jsx'
import { pictureOf } from './helpTopics.js'

// The common questions of one kind of account, each opened by pressing it.
function Questions({ group }) {
  const [open, setOpen] = useState(() => new Set())
  const toggle = (id) => setOpen((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  return <ManualQuestions sections={questionsFor(group)} open={open} onToggle={toggle} />
}

// One topic: its title and one line, its pictures one at a time, the numbered list of the picture shown, and one tip.
export default function HelpTopicView({ topic, picture: index, onPicture }) {
  const pictured = !topic.kind
  const picture = pictured ? pictureOf(topic.screens[index]) : null
  const legend = picture?.legend || []
  return (
    <article aria-labelledby="help-topic-title" className="min-w-0">
      <header className="border-b border-[#E2E8E2] pb-3">
        <h3 id="help-topic-title" className="text-[19px] font-semibold text-[#1A2B1A]">{topic.title}</h3>
        <p className="mt-1 text-[13px] text-[#7A8E7A]">{topic.about}</p>
      </header>

      <div className="mt-4 space-y-4">
        {topic.kind === 'questions' && <Questions key={topic.key} group={topic.group} />}
        {topic.kind === 'about' && <AboutSystem />}
        {pictured && (
          <>
            <HelpPicture key={topic.key} picture={picture} index={index} count={topic.screens.length} onPicture={onPicture} />
            <ol className="space-y-2" aria-label="What each number in the picture is">
              {legend.map((row) => (
                <li key={row.n} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-[22px] min-w-[22px] flex-none items-center justify-center rounded-full border-[1.5px] border-[#4A5E4A] px-1 text-[11px] font-semibold text-[#1A2B1A]" aria-hidden="true">{row.n}</span>
                  <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-[#1A2B1A]"><span className="font-semibold">{row.label}:</span> {row.desc}</p>
                </li>
              ))}
            </ol>
            <p className="flex items-start gap-2.5 rounded-lg border-l-4 border-[#1B4D2E] bg-[#F6FAF7] px-3 py-2.5 text-[13px] leading-relaxed text-[#1A2B1A]">
              <Lightbulb size={16} aria-hidden="true" className="mt-0.5 flex-none text-[#1B4D2E]" />
              <span><span className="sr-only">Tip: </span>{topic.tip}</span>
            </p>
          </>
        )}
      </div>
    </article>
  )
}
