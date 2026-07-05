import { useState } from 'react'
import { Info, BookOpen, HelpCircle, ChevronDown } from 'lucide-react'
import PageLayout from '../../components/Layout/PageLayout.jsx'

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-[#F0F4F0] last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-3.5 text-left hover:text-[#1B4D2E] transition-colors"
      >
        <span className="text-[13px] font-medium text-[#1A2B1A] pr-4">{question}</span>
        <ChevronDown
          className={`w-4 h-4 text-[#A8BCA8] flex-shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180' : 'rotate-0'
          }`}
        />
      </button>
      {open && (
        <div className="pb-3.5">
          <p className="text-[13px] text-[#4A5E4A] leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  )
}

const STEPS = [
  {
    step: '1',
    title: 'Set Up Master Data',
    desc: 'Go to Crop Option and Crop Category under UTILITIES to set up your crops, categories, growth durations, and activity suggestions.',
  },
  {
    step: '2',
    title: 'Register Farmer Associations',
    desc: 'Go to Farmer Association Management to register all farmer cooperatives and associations in Aringay.',
  },
  {
    step: '3',
    title: 'Add Crop Records',
    desc: 'Go to Crop Information Management to record what crops have been planted, by which association, and when. The system will auto-compute the expected harvest date and estimated yield.',
  },
  {
    step: '4',
    title: 'Monitor Crop Activities',
    desc: 'Go to Monitoring and click View Logs for each crop. Log activities like fertilizer application and pest control. Use Get Suggestions to see recommended activities.',
  },
  {
    step: '5',
    title: 'View Forecasts',
    desc: 'Go to Forecasting to see all active crops with their estimated harvest yield and expected harvest dates.',
  },
  {
    step: '6',
    title: 'Generate Reports',
    desc: 'Go to Report Generation to download PDF or Excel reports for harvested crops, associations, or crop options.',
  },
]

const FAQS = [
  {
    q: 'How is the Expected Harvest Date computed?',
    a: "The system automatically computes the Expected Harvest Date by adding the crop's Growth Duration (in days) to the Date Planted. Growth durations are set in Crop Option Management.",
  },
  {
    q: 'How is the Estimated Yield computed?',
    a: 'Estimated Yield is computed by multiplying the Area Planted (ha) by the Yield Per Hectare (kg) set in Crop Option Management.',
  },
  {
    q: 'What does the Status "For Harvest" mean?',
    a: '"For Harvest" appears when the expected harvest date is within 14 days. This signals that staff should prepare for harvest recording.',
  },
  {
    q: 'How do Activity Suggestions work?',
    a: 'Activity Suggestions are pre-set per crop type by the Admin in Crop Option Management. When staff clicks Get Suggestions in View Logs, the system shows all suggested activities — completed ones appear grayed out with a checkmark, uncompleted ones appear in full color.',
  },
  {
    q: 'Who can add or edit Crop Options and Categories?',
    a: 'Only Admin accounts can manage Crop Options, Crop Categories, and User Management. Evaluators can view and add crop records and activity logs.',
  },
  {
    q: 'How do I record a harvest?',
    a: 'In the Crop Monitoring page, click the three-dot (⋮) menu on the crop row and select "Record Harvest". Fill in the harvest dates, area harvested, and quantity. The system will auto-compute the Yield per Hectare.',
  },
  {
    q: 'How do I report a disaster or crop damage?',
    a: 'In the Crop Monitoring page, click the three-dot (⋮) menu on the affected crop and select "Report Disaster". Fill in the disaster type, date, area affected, and damage description.',
  },
]

function HelpPage() {
  return (
    <PageLayout title="Help" subtitle="System guide and frequently asked questions">

      {/* About This System */}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 mb-4">
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[#F0F4F0]">
          <div className="w-9 h-9 rounded-[10px] bg-[#EBF5EE] flex items-center justify-center flex-shrink-0">
            <Info className="w-4 h-4 text-[#1B4D2E]" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-[#1A2B1A]">About This System</h2>
            <p className="text-[12px] text-[#7A8E7A]">System information and overview</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#F9FAF9] rounded-lg p-4 border border-[#E2E8E2]">
            <p className="text-[10px] font-semibold text-[#A8BCA8] uppercase tracking-[0.08em] mb-2">
              System Name
            </p>
            <p className="text-[13px] font-medium text-[#1A2B1A]">
              Integrated Agricultural Monitoring and Production Management System
            </p>
          </div>
          <div className="bg-[#F9FAF9] rounded-lg p-4 border border-[#E2E8E2]">
            <p className="text-[10px] font-semibold text-[#A8BCA8] uppercase tracking-[0.08em] mb-2">
              Office
            </p>
            <p className="text-[13px] font-medium text-[#1A2B1A]">
              Office of the Municipal Agriculturist (OMAg)
            </p>
            <p className="text-[12px] text-[#7A8E7A] mt-0.5">Aringay, La Union</p>
          </div>
          <div className="bg-[#F9FAF9] rounded-lg p-4 border border-[#E2E8E2]">
            <p className="text-[10px] font-semibold text-[#A8BCA8] uppercase tracking-[0.08em] mb-2">
              Coverage
            </p>
            <p className="text-[13px] font-medium text-[#1A2B1A]">24 Barangays of Aringay</p>
            <p className="text-[12px] text-[#7A8E7A] mt-0.5">La Union, Region I</p>
          </div>
          <div className="bg-[#F9FAF9] rounded-lg p-4 border border-[#E2E8E2]">
            <p className="text-[10px] font-semibold text-[#A8BCA8] uppercase tracking-[0.08em] mb-2">
              Developed By
            </p>
            <p className="text-[13px] font-medium text-[#1A2B1A]">IT 122 Capstone Team</p>
            <p className="text-[12px] text-[#7A8E7A] mt-0.5">Saint Louis College</p>
          </div>
        </div>
      </div>

      {/* Quick Guide */}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 mb-4">
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[#F0F4F0]">
          <div className="w-9 h-9 rounded-[10px] bg-[#EBF5EE] flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4 h-4 text-[#1B4D2E]" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-[#1A2B1A]">Quick Guide</h2>
            <p className="text-[12px] text-[#7A8E7A]">How to use the main features</p>
          </div>
        </div>

        <div className="space-y-2">
          {STEPS.map((item) => (
            <div
              key={item.step}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-[#F9FAF9] transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[#1B4D2E] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                {item.step}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#1A2B1A]">{item.title}</p>
                <p className="text-[12px] text-[#7A8E7A] mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[#F0F4F0]">
          <div className="w-9 h-9 rounded-[10px] bg-[#EBF5EE] flex items-center justify-center flex-shrink-0">
            <HelpCircle className="w-4 h-4 text-[#1B4D2E]" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-[#1A2B1A]">
              Frequently Asked Questions
            </h2>
            <p className="text-[12px] text-[#7A8E7A]">Common questions and answers</p>
          </div>
        </div>

        {FAQS.map((faq, i) => (
          <FaqItem key={i} question={faq.q} answer={faq.a} />
        ))}
      </div>

    </PageLayout>
  )
}

export default HelpPage
