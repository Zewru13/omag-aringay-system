import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { List, X } from 'lucide-react'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import HelpTopicList from './HelpTopicList.jsx'
import HelpTopicView from './HelpTopicView.jsx'
import { audienceFor, countLine, findTopic, groupsFor, pictureIndex } from './helpTopics.js'

// Help (/help), the one help page of every kind of account: one topic at a time on the left, the topic list with Search help on
// the right (a Topics button on a phone). The address names the topic and the picture, so Back and reload stay on them. An Admin
// reads every kind of account's topics; anyone else their own.
export default function HelpPage() {
  const { user, isFarmer, isFisherfolk, isOrg } = useAuth()
  const audience = audienceFor({ role: user?.role, isFarmer, isFisherfolk, isOrg })
  const groups = useMemo(() => groupsFor(audience), [audience])
  const [params, setParams] = useSearchParams()
  const topic = findTopic(groups, params.get('topic'))
  const picture = pictureIndex(params.get('picture'), topic.screens?.length || 0)
  const [listOpen, setListOpen] = useState(false)       // on a phone

  const address = (key, index) => (index > 0 ? { topic: key, picture: String(index + 1) } : { topic: key })
  const openTopic = (key, index = 0) => {
    setParams(address(key, index))                       // a new step in the history, so Back returns to the topic before
    setListOpen(false)
    window.scrollTo({ top: 0 })
  }
  const showPicture = (index) => setParams(address(topic.key, index), { replace: true })

  return (
    <PageLayout title="Help" subtitle="How to use each page, common questions and About This System">
      <section className="rounded-xl border border-[#E2E8E2] bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-[#1B4D2E]">Help</h2>
          <p className="text-[12px] text-[#7A8E7A]">{countLine(groups)}</p>
        </div>

        <button type="button" onClick={() => setListOpen((open) => !open)} aria-expanded={listOpen}
          className="mb-3 flex min-h-10 items-center gap-2 rounded-lg border border-[#D8E2D8] bg-white px-3 text-[13px] font-medium text-[#1B4D2E] lg:hidden">
          {listOpen ? <X size={16} aria-hidden="true" /> : <List size={16} aria-hidden="true" />} Topics
        </button>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
          <div className={`min-w-0 ${listOpen ? 'hidden lg:block' : ''}`}>
            <HelpTopicView topic={topic} picture={picture} onPicture={showPicture} />
          </div>
          <aside className={`min-w-0 ${listOpen ? '' : 'hidden lg:block'}`}>
            <div className="lg:sticky lg:top-20">
              <HelpTopicList groups={groups} current={topic.key} onPick={openTopic} />
            </div>
          </aside>
        </div>
      </section>
    </PageLayout>
  )
}
