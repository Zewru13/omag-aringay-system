import { Activity, AlertTriangle, Fish, MapPin, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import CommodityRankingCard from '../../components/dashboard/CommodityRankingCard.jsx'
import FisherfolkSectorCard from '../../components/dashboard/FisherfolkSectorCard.jsx'
import MetricHeroCard from '../../components/dashboard/MetricHeroCard.jsx'
import ProductionTrendCard from '../../components/dashboard/ProductionTrendCard.jsx'
import SeasonalComparisonCard from '../../components/dashboard/SeasonalComparisonCard.jsx'
import useDashboardData from '../../hooks/useDashboardData.js'

function pctActive(numerator, denominator) {
  if (!denominator) return null
  return `${((numerator / denominator) * 100).toFixed(1)}% active`
}

function DashboardPage() {
  const { summary, extended, commodities, seasonal, yearlyTrend, upcomingVisits, expiringLicenses, activeMonitoring, municipalityCrops } = useDashboardData()

  const totalFarmers = summary.isLoading ? '—' : (summary.data?.total_farmers ?? '—')
  const activeFarms = summary.data?.active_farms ?? 0
  const totalFarmersNum = summary.data?.total_farmers ?? 0
  const farmerPct = pctActive(activeFarms, totalFarmersNum)
  const farmerSubLabel = !summary.isLoading && activeFarms
    ? `${activeFarms} active farms`
    : undefined

  const totalFisherfolk = summary.isLoading ? '—' : (summary.data?.total_fisherfolk ?? '—')
  const totalFisherfolkNum = summary.data?.total_fisherfolk ?? 0
  const fisherfolkActive = extended.data?.fisherfolk_active ?? 0
  const fisherfolkPct = !extended.isLoading && fisherfolkActive
    ? pctActive(fisherfolkActive, totalFisherfolkNum)
    : null
  const fisherfolkSubLabel = !extended.isLoading && fisherfolkActive
    ? `${fisherfolkActive} currently active`
    : undefined

  return (
    <PageLayout title="Dashboard" subtitle="Overview of agricultural data for Aringay, La Union">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:grid-cols-4">

        {/* ── Hero cards ── */}
        <MetricHeroCard
          title="Total Registered Farmers"
          icon={Users}
          value={totalFarmers}
          subLabel={farmerSubLabel}
          percentLabel={farmerPct}
          percentTone="green"
          className="md:col-span-3 lg:col-span-2"
        />
        <MetricHeroCard
          title="Total Registered Fisherfolk"
          icon={Fish}
          value={totalFisherfolk}
          subLabel={fisherfolkSubLabel}
          percentLabel={fisherfolkPct}
          percentTone="blue"
          className="md:col-span-3 lg:col-span-2"
        />

        {/* ── Fisherfolk sector donut ── */}
        <FisherfolkSectorCard
          data={extended.data?.fisherfolk_breakdown}
          isLoading={extended.isLoading}
          error={extended.error}
          onRetry={extended.retry}
        />

        {/* ── Top commodities bar ── */}
        <CommodityRankingCard
          data={commodities.data}
          isLoading={commodities.isLoading}
          error={commodities.error}
          onRetry={commodities.retry}
        />

        {/* ── 5-Year trend area (full width at lg) ── */}
        <ProductionTrendCard
          data={yearlyTrend.data}
          isLoading={yearlyTrend.isLoading}
          error={yearlyTrend.error}
          onRetry={yearlyTrend.retry}
        />

        {/* ── Seasonal comparison bar ── */}
        <SeasonalComparisonCard
          data={seasonal.data}
          isLoading={seasonal.isLoading}
          error={seasonal.error}
          onRetry={seasonal.retry}
        />

        {/* ── Monitoring metric cards ── */}
        {/* Richer crop monitoring card using municipality dashboard */}
        {municipalityCrops.isLoading || !municipalityCrops.data ? (
          <MetricHeroCard
            title="Barangay Crop Monitoring"
            icon={Activity}
            value={activeMonitoring.isLoading ? '—' : (activeMonitoring.data ?? '—')}
            subLabel="active individual records"
            percentTone="green"
          />
        ) : (() => {
          const mc = municipalityCrops.data
          const tracker = mc.submission_tracker
          const submittedPct = tracker.total_barangays
            ? Math.round((tracker.submitted / tracker.total_barangays) * 100)
            : 0
          const highAlertCount = mc.alerts?.filter(a => a.alert_level === 'High').length || 0
          const pendingNames = tracker.not_submitted_list?.slice(0, 3).join(', ') || ''
          const moreCount = (tracker.not_submitted_list?.length || 0) - 3
          return (
            <div style={{
              background: '#fff',
              borderRadius: 12,
              padding: '16px 20px',
              border: '1px solid #e0e0e0',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Activity size={18} color="#1E4620" />
                <span style={{ fontSize: 13, color: '#555', fontWeight: 600 }}>Barangay Crop Monitoring</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#212121' }}>
                {tracker.submitted}
                <span style={{ fontSize: 14, color: '#9e9e9e', fontWeight: 400 }}> / {tracker.total_barangays} barangays</span>
              </div>
              {/* Progress bar */}
              <div style={{ height: 6, borderRadius: 3, background: '#f0f7f0' }}>
                <div style={{
                  height: '100%', borderRadius: 3, background: '#4CAF50',
                  width: `${submittedPct}%`, transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ color: '#757575' }}>
                  {tracker.not_submitted} pending
                  {pendingNames && `: ${pendingNames}${moreCount > 0 ? ` +${moreCount} more` : ''}`}
                </span>
                {highAlertCount > 0 && (
                  <span style={{
                    background: '#fff3e0', color: '#E65100', borderRadius: 10,
                    padding: '2px 8px', fontWeight: 600, fontSize: 11,
                  }}>
                    {highAlertCount} High Alert{highAlertCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <Link
                to="/monitoring"
                style={{ fontSize: 12, color: '#1E4620', fontWeight: 500, textDecoration: 'none', alignSelf: 'flex-end' }}
              >
                View Monitoring →
              </Link>
            </div>
          )
        })()}
        <MetricHeroCard
          title="Upcoming Farm Visits (14 days)"
          icon={MapPin}
          value={upcomingVisits.isLoading ? '—' : (upcomingVisits.data ?? '—')}
          percentTone="blue"
        />
        <MetricHeroCard
          title="Expiring Vessel Licenses (30 days)"
          icon={AlertTriangle}
          value={expiringLicenses.isLoading ? '—' : (expiringLicenses.data ?? '—')}
          percentTone="amber"
        />

      </div>
    </PageLayout>
  )
}

export default DashboardPage
