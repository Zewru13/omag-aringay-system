import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import axiosInstance from '../../api/axiosInstance';
import { History } from 'lucide-react';
import BarangaySelect from '../../components/UI/BarangaySelect';
import Button from '../../components/UI/Button.jsx';
import { baseInputClasses } from '../../components/UI/FormField.jsx';
import ModalShell from '../../components/UI/ModalShell.jsx';
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx';
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx';

const FISHERFOLK_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'Capture', label: 'Capture' },
  { value: 'Aquaculture', label: 'Aquaculture' },
];

export default function FisheriesHistoryModal({ onClose }) {
  const [barangay, setBarangay] = useState('');
  const [fisherfolkType, setFisherfolkType] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (barangay) params.barangay = barangay;
      if (fisherfolkType) params.fisherfolk_type = fisherfolkType;
      const res = await axiosInstance.get('/fisheries/fishing-trips/history/', { params });
      setData(res.data);
    } catch {
      setError('Failed to load historical data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [barangay, fisherfolkType]);

  const chartData = data?.timeline?.map(row => ({
    label: `${row.season.charAt(0)}${row.year}`,
    season: row.season,
    year: row.year,
    volume_kg: Number(row.total_volume_kg || 0),
    trips: row.trip_count,
    fisherfolk: row.active_fisherfolk,
  })) || [];

  return (
    <ModalShell
      title="Fisheries Historical Timeline"
      subtitle="Catch volume by season, municipality-wide or per barangay."
      icon={History}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={<Button type="button" variant="outline" onClick={onClose}>Close</Button>}
    >
        <div className="space-y-3">
          <FormSection title="Filters">
            <FormRows label="Filters">
              <FormRow>
                <FormCell label="Barangay">
                  <BarangaySelect
                    value={barangay}
                    onChange={e => setBarangay(e.target.value)}
                    className={baseInputClasses}
                    includeAllOption
                    allOptionLabel="Municipality-wide"
                  />
                </FormCell>
                <FormCell label="Fisherfolk Type">
                  <select value={fisherfolkType} onChange={e => setFisherfolkType(e.target.value)} className={baseInputClasses}>
                    {FISHERFOLK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </FormCell>
              </FormRow>
            </FormRows>
          </FormSection>

          {loading && <p className="text-center text-[13px] text-[#7A8E7A]">Loading…</p>}
          {error && <p className="text-[13px] text-rose-600" role="alert">{error}</p>}

          {!loading && chartData.length === 0 && (
            <p className="py-8 text-center text-[13px] italic text-[#7A8E7A]">
              No catch records found for the selected filters.
            </p>
          )}

          {chartData.length > 0 && (
            <>
              <div className="text-[13px] text-[#4A5E4A]">
                <b>{data?.scope}</b> — {data?.fisherfolk_type} — {chartData.length} season record(s)
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1565c0" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#1565c0" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value, name) => [Number(value).toLocaleString(), name]}
                    labelFormatter={(label) => {
                      const d = chartData.find(r => r.label === label);
                      return d ? `${d.season} ${d.year}` : label;
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone" dataKey="volume_kg" name="Total Catch (kg)"
                    stroke="#1565c0" fill="url(#gradVolume)" strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>

              <FormSection title="Catch by Season">
                <EntryTable bare label="Catch by season">
                  <EntryHead>
                    <EntryTh>Season</EntryTh>
                    <EntryTh>Year</EntryTh>
                    <EntryTh className="md:text-right">Total Catch (kg)</EntryTh>
                    <EntryTh className="md:text-center">Trips</EntryTh>
                    <EntryTh className="md:text-center">Active Fisherfolk</EntryTh>
                  </EntryHead>
                  <tbody>
                    {chartData.map((row, i) => (
                      <EntryRow key={i}>
                        <EntryCell label="Season">{row.season}</EntryCell>
                        <EntryCell label="Year">{row.year}</EntryCell>
                        <EntryCell label="Total Catch (kg)" className="tabular-nums md:text-right">{row.volume_kg.toLocaleString()} kg</EntryCell>
                        <EntryCell label="Trips" className="md:text-center">{row.trips}</EntryCell>
                        <EntryCell label="Active Fisherfolk" className="md:text-center">{row.fisherfolk}</EntryCell>
                      </EntryRow>
                    ))}
                  </tbody>
                </EntryTable>
              </FormSection>
            </>
          )}
        </div>
    </ModalShell>
  );
}
