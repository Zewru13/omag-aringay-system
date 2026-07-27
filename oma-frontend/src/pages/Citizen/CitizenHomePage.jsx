import { useState } from 'react'
import { LogOut } from 'lucide-react'
import logo from '../../assets/LOGO OMAg.jpg'
import { useAuth } from '../../context/AuthContext.jsx'
import MyRecordsPanel from './MyRecordsPanel.jsx'
import MyYieldAnalysisSection from './MyYieldAnalysisSection.jsx'
import MyAssistanceHistorySection from './MyAssistanceHistorySection.jsx'
import MyOrgReportingSection from './MyOrgReportingSection.jsx'
import { CROP_DOMAIN, FISHERIES_DOMAIN } from './citizenDomainConfig.js'
import { FARMERS_ORG_DOMAIN, FISHERFOLK_ORG_DOMAIN } from './orgDomainConfig.js'

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

const RECORD_TYPE_LABELS = {
  FARMER: 'Farmer',
  FISHERFOLK: 'Fisherfolk',
  FARMERS_ORG: 'Farmers Organization',
  FISHERFOLK_ORG: 'Fisherfolk Organization',
}

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
  const recordTypeLabel = RECORD_TYPE_LABELS[recordType] || 'Record'
  const isFarmersOrg = recordType === 'FARMERS_ORG'
  const isFisherfolkOrg = recordType === 'FISHERFOLK_ORG'
  const isOrg = isFarmersOrg || isFisherfolkOrg
  const isFarmer = recordType === 'FARMER'
  const isFisherfolk = recordType === 'FISHERFOLK'
  const orgDomain = isFarmersOrg ? FARMERS_ORG_DOMAIN : isFisherfolkOrg ? FISHERFOLK_ORG_DOMAIN : null

  const [tab, setTab] = useState('overview')

  return (
    <div className="min-h-screen bg-[#F5F7F5]">
      <header className="flex items-center justify-between border-b border-[#E2E8E2] bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="OMAg" className="h-8 w-8 rounded-md object-contain ring-1 ring-[#E2E8E2]" />
          <div>
            <p className="text-[14px] font-semibold text-[#1A2B1A] leading-tight">OMAg Aringay</p>
            <p className="text-[11px] text-[#7A8E7A]">Self-Service Account</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg border border-[#C8D5C8] px-3 py-1.5 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors"
        >
          <LogOut size={14} /> Log Out
        </button>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-[20px] font-semibold text-[#1A2B1A]">Welcome, {record?.label || user?.full_name}</h1>
        <p className="mt-1 text-[13px] text-[#7A8E7A]">
          Self-service account for your {recordTypeLabel.toLowerCase()} record with the Office of the Municipal Agriculturist.
        </p>

        {!record ? (
          <div className="mt-6 rounded-xl border border-[#E2E8E2] bg-white p-6">
            <p className="text-[13px] italic text-[#A8BCA8]">
              Your account isn't linked to a record yet. Please visit the office for assistance.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-6 flex gap-1 border-b border-[#E2E8E2] overflow-x-auto">
              <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</TabButton>
              {isFarmer && <TabButton active={tab === 'crop'} onClick={() => setTab('crop')}>My Crop Records</TabButton>}
              {isFisherfolk && <TabButton active={tab === 'fisheries'} onClick={() => setTab('fisheries')}>My Stocking Records</TabButton>}
              {!isOrg && <TabButton active={tab === 'yield'} onClick={() => setTab('yield')}>My Yield Analysis</TabButton>}
              <TabButton active={tab === 'assistance'} onClick={() => setTab('assistance')}>
                {isOrg ? 'Report Assistance' : 'My Assistance History'}
              </TabButton>
            </div>

            <div className="mt-5">
              {tab === 'overview' && (
                <div className="rounded-xl border border-[#E2E8E2] bg-white p-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Name" value={record.label} />
                    <Field label="Record Type" value={recordTypeLabel} />
                    <Field label={isOrg ? 'Registration Number' : 'RSBSA Number'} value={isOrg ? record.registration_number : record.rsbsa_number} />
                    <Field label="Barangay" value={record.barangay} />
                  </div>
                </div>
              )}

              {tab === 'crop' && isFarmer && <MyRecordsPanel domain={CROP_DOMAIN} />}
              {tab === 'fisheries' && isFisherfolk && <MyRecordsPanel domain={FISHERIES_DOMAIN} />}

              {tab === 'yield' && isFarmer && (
                <MyYieldAnalysisSection
                  endpoint="/production/yield-analysis/"
                  cropLabel="Crop"
                  cropKey="crop_type"
                  dateLabel="Date Planted"
                  dateKey="date_planted"
                />
              )}
              {tab === 'yield' && isFisherfolk && (
                <MyYieldAnalysisSection
                  endpoint="/fisheries/yield-analysis/"
                  cropLabel="Species"
                  cropKey="species"
                  dateLabel="Date Stocked"
                  dateKey="date_stocked"
                />
              )}

              {tab === 'assistance' && isFarmer && (
                <MyAssistanceHistorySection endpoint="/interventions/my-beneficiary-history/" />
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
