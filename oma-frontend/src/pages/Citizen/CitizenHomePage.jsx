import { LogOut } from 'lucide-react'
import logo from '../../assets/LOGO OMAg.jpg'
import { useAuth } from '../../context/AuthContext.jsx'

// Batch 10: minimal proof-of-chain page for CITIZEN accounts — confirms
// login -> linked record resolved -> correct data shown, end to end.
// Deliberately standalone (not PageLayout, which renders the full
// Admin/Evaluator Sidebar) and read-only: no edit capability, no crop/
// pond/beneficiary UI. That's the next batch, once this foundation is
// verified.

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

export default function CitizenHomePage() {
  const { user, logout } = useAuth()
  const record = user?.linked_record
  const recordTypeLabel = RECORD_TYPE_LABELS[user?.linked_record_type] || 'Record'
  const isOrg = user?.linked_record_type === 'FARMERS_ORG' || user?.linked_record_type === 'FISHERFOLK_ORG'

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

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="text-[20px] font-semibold text-[#1A2B1A]">Welcome, {record?.label || user?.full_name}</h1>
        <p className="mt-1 text-[13px] text-[#7A8E7A]">
          This is a read-only preview of your {recordTypeLabel.toLowerCase()} record on file with the
          Office of the Municipal Agriculturist.
        </p>

        <div className="mt-6 rounded-xl border border-[#E2E8E2] bg-white p-6">
          {!record ? (
            <p className="text-[13px] italic text-[#A8BCA8]">
              Your account isn't linked to a record yet. Please visit the office for assistance.
            </p>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" value={record.label} />
              <Field label="Record Type" value={recordTypeLabel} />
              <Field label={isOrg ? 'Registration Number' : 'RSBSA Number'} value={isOrg ? record.registration_number : record.rsbsa_number} />
              <Field label="Barangay" value={record.barangay} />
            </div>
          )}
        </div>

        <p className="mt-6 text-[12px] text-[#A8BCA8]">
          More self-service features — reporting crop activities, updates, and assistance history — are coming in a future update.
        </p>
      </main>
    </div>
  )
}
