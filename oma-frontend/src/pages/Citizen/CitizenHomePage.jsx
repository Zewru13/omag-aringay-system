import { useState } from 'react'
import { LogOut } from 'lucide-react'
import logo from '../../assets/LOGO OMAg.jpg'
import { useAuth } from '../../context/AuthContext.jsx'
import MyRecordsPanel from './MyRecordsPanel.jsx'
import MyYieldAnalysisSection from './MyYieldAnalysisSection.jsx'
import MyAssistanceHistorySection from './MyAssistanceHistorySection.jsx'
import MyOrgReportingSection from './MyOrgReportingSection.jsx'
import { FISHERIES_DOMAIN } from './citizenDomainConfig.js'
import { FARMERS_ORG_DOMAIN, FISHERFOLK_ORG_DOMAIN } from './orgDomainConfig.js'
import FarmerHomeScreen from './FarmerHomeScreen.jsx'
import { labels } from './labels.js'

// Batch 10 built the read-only proof-of-chain overview below. Batch 11
// added self-service tabs for Farmer/Fisherfolk: log/edit own activity &
// harvest entries, read-only Yield Analysis and Assistance History.
// Batch 12 adds the ORGANIZATION-role equivalent: report beneficiary
// assistance for this org's own members only, edit own submissions. No
// crop/pond records, no member profile editing, no disaster reporting
// anywhere on this page for any role.

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7A8E7A]">{label}</p>
      <p className="mt-0.5 text-[15px] text-[#1A2B1A]">{value || '—'}</p>
    </div>
  )
}

const RECORD_TYPE_LABELS = labels.home.recordTypeLabelsCapitalized
const RECORD_TYPE_LABELS_LOWER = labels.home.recordTypeLabels

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-[13px] font-medium border-b-2 transition-colors ${
        active ? 'border-[#1B4D2E] text-[#1B4D2E]' : 'border-transparent text-[#7A8E7A] hover:text-[#4A5E4A]'
      }`}
    >
      {children}
    </button>
  )
}

export default function CitizenHomePage() {
  const { user, logout } = useAuth()
  const record = user?.linked_record
  const recordType = user?.linked_record_type
  const recordTypeLabel = RECORD_TYPE_LABELS[recordType] || labels.home.recordTypeFallback
  const isFarmersOrg = recordType === 'FARMERS_ORG'
  const isFisherfolkOrg = recordType === 'FISHERFOLK_ORG'
  const isOrg = isFarmersOrg || isFisherfolkOrg
  const isFarmer = recordType === 'FARMER'
  const isFisherfolk = recordType === 'FISHERFOLK'
  const orgDomain = isFarmersOrg ? FARMERS_ORG_DOMAIN : isFisherfolkOrg ? FISHERFOLK_ORG_DOMAIN : null

  const [tab, setTab] = useState('overview')

  // Batch E — Farmer gets the new task-first, single-scroll home screen
  // (see FarmerHomeScreen.jsx); Fisherfolk/Organization keep this existing
  // tab layout unchanged this batch (redesign scoped to Farmer per the
  // task title — no permission/behavior change either way).
  if (isFarmer && record) {
    return <FarmerHomeScreen record={record} onLogout={logout} />
  }

  return (
    <div className="min-h-screen bg-[#F5F7F5]">
      <header className="flex items-center justify-between border-b border-[#E2E8E2] bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="OMAg" className="h-8 w-8 rounded-md object-contain ring-1 ring-[#E2E8E2]" />
          <div>
            <p className="text-[14px] font-semibold text-[#1A2B1A] leading-tight">{labels.header.appName}</p>
            <p className="text-[11px] text-[#7A8E7A]">{labels.header.tagline}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg border border-[#C8D5C8] px-3 py-1.5 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors"
        >
          <LogOut size={14} /> {labels.header.logOut}
        </button>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-[20px] font-semibold text-[#1A2B1A]">{labels.home.greeting(record?.label || user?.full_name)}</h1>
        <p className="mt-1 text-[13px] text-[#7A8E7A]">
          {labels.home.subtitle(RECORD_TYPE_LABELS_LOWER[recordType] || 'record')}
        </p>

        {!record ? (
          <div className="mt-6 rounded-xl border border-[#E2E8E2] bg-white p-6">
            <p className="text-[13px] italic text-[#A8BCA8]">
              {labels.home.notLinked}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 flex gap-1 border-b border-[#E2E8E2] overflow-x-auto">
              <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>{labels.home.tabs.overview}</TabButton>
              {isFisherfolk && <TabButton active={tab === 'fisheries'} onClick={() => setTab('fisheries')}>{labels.home.tabs.myStockingRecords}</TabButton>}
              {!isOrg && <TabButton active={tab === 'yield'} onClick={() => setTab('yield')}>{labels.home.tabs.myYieldAnalysis}</TabButton>}
              <TabButton active={tab === 'assistance'} onClick={() => setTab('assistance')}>
                {isOrg ? labels.home.tabs.reportAssistance : labels.home.tabs.myAssistanceHistory}
              </TabButton>
            </div>

            <div className="mt-5">
              {tab === 'overview' && (
                <div className="rounded-xl border border-[#E2E8E2] bg-white p-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={labels.home.overviewFields.name} value={record.label} />
                    <Field label={labels.home.overviewFields.recordType} value={recordTypeLabel} />
                    <Field label={isOrg ? labels.home.overviewFields.registrationNumber : labels.home.overviewFields.rsbsaNumber} value={isOrg ? record.registration_number : record.rsbsa_number} />
                    <Field label={labels.home.overviewFields.barangay} value={record.barangay} />
                  </div>
                </div>
              )}

              {tab === 'fisheries' && isFisherfolk && <MyRecordsPanel domain={FISHERIES_DOMAIN} />}

              {tab === 'yield' && isFisherfolk && (
                <MyYieldAnalysisSection
                  endpoint="/fisheries/yield-analysis/"
                  cropLabel={labels.yieldAnalysis.fisheriesCropLabel}
                  cropKey="species"
                  dateLabel={labels.yieldAnalysis.fisheriesDateLabel}
                  dateKey="date_stocked"
                />
              )}

              {tab === 'assistance' && isFisherfolk && (
                <MyAssistanceHistorySection endpoint="/interventions/my-fisherfolk-beneficiary-history/" />
              )}
              {tab === 'assistance' && isOrg && orgDomain && (
                <MyOrgReportingSection domain={orgDomain} orgId={record.id} />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
