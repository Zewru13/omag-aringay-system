import { LogOut } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import logo from '../../assets/LOGO OMAg.jpg'
import { useAuth } from '../../context/AuthContext.jsx'
import { FARMERS_ORG_DOMAIN, FISHERFOLK_ORG_DOMAIN } from './orgDomainConfig.js'
import FarmerHomeScreen from './FarmerHomeScreen.jsx'
import OrganizationHomeScreen from './OrganizationHomeScreen.jsx'
import { labels } from './labels.js'

// Batch 10 built the read-only proof-of-chain overview below. Batch 11
// added self-service tabs for Farmer/Fisherfolk: log/edit own activity &
// harvest entries, read-only Yield Analysis and Assistance History.
// Batch 12 adds the ORGANIZATION-role equivalent: report beneficiary
// assistance for this org's own members only, edit own submissions. No
// crop/pond records, no member profile editing, no disaster reporting
// anywhere on this page for any role.

const RECORD_TYPE_LABELS_LOWER = labels.home.recordTypeLabels

export default function CitizenHomePage() {
  const { user, logout } = useAuth()
  const record = user?.linked_record
  const recordType = user?.linked_record_type
  const isFarmersOrg = recordType === 'FARMERS_ORG'
  const isFisherfolkOrg = recordType === 'FISHERFOLK_ORG'
  const isFarmer = recordType === 'FARMER'
  const isFisherfolk = recordType === 'FISHERFOLK'
  const orgDomain = isFarmersOrg ? FARMERS_ORG_DOMAIN : isFisherfolkOrg ? FISHERFOLK_ORG_DOMAIN : null

  // Batch E gave Farmer the new task-first, single-scroll home screen (see
  // FarmerHomeScreen.jsx); Batch F does the same for Fisherfolk (see
  // FisherfolkHomeScreen.jsx), adapted for multiple ponds and daily
  // feeding. Batch 2 finally does the same for ORGANIZATION — the
  // Overview | Report Assistance tab pair that used to live in this file is
  // replaced by OrganizationHomeScreen's real dashboard (member and officer
  // management alongside the assistance flows).
  if (isFarmer && record) {
    return <FarmerHomeScreen record={record} onLogout={logout} />
  }
  // Fisherfolk accounts now use the full Admin Fisheries pages (backend-scoped to their own records), so
  // the older stocking-log portal is no longer their entry point.
  if (isFisherfolk && record) {
    return <Navigate to="/fisheries-monitoring" replace />
  }
  if (orgDomain && record) {
    return (
      <OrganizationHomeScreen
        record={record}
        recordType={recordType}
        domain={orgDomain}
        onLogout={logout}
      />
    )
  }

  // Fallback only: a CITIZEN whose account has no linked record at all, and
  // any role that somehow reaches this route. Kept deliberately plain —
  // there is no record to theme it against.

  return (
    <div className="min-h-screen bg-cz-page">
      <header className="flex items-center justify-between border-b-[0.5px] border-cz-border bg-cz-surface px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="OMAg" className="h-8 w-8 rounded-md object-contain ring-1 ring-cz-border" />
          <div>
            <p className="text-[14px] font-semibold leading-tight text-cz-text">{labels.header.appName}</p>
            <p className="text-[11px] text-cz-text-2">{labels.header.tagline}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-1.5 rounded-lg border-[0.5px] border-cz-border-strong px-3 py-1.5 text-cz-text-2 transition-colors hover:bg-cz-page"
        >
          <LogOut size={14} /> <span className="text-[13px] font-medium">{labels.header.logOut}</span>
        </button>
      </header>

      <main className="mx-auto w-full px-4 py-8 sm:max-w-[720px] sm:px-6 lg:max-w-[1100px]">
        <h1 className="text-[20px] font-semibold text-cz-text">
          {labels.home.greeting(record?.label || user?.full_name)}
        </h1>
        <p className="mt-1 text-[13px] text-cz-text-2">
          {labels.home.subtitle(RECORD_TYPE_LABELS_LOWER[recordType] || 'record')}
        </p>

        <div className="mt-6 rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface p-6">
          <p className="text-[13px] italic text-cz-text-muted">{labels.home.notLinked}</p>
        </div>
      </main>
    </div>
  )
}
