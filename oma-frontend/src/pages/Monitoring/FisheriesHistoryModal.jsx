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
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Barangay</label>
              <BarangaySelect
                value={barangay}
                onChange={e => setBarangay(e.target.value)}
                className="form-control"
                includeAllOption
                allOptionLabel="Municipality-wide"
              />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Fisherfolk Type</label>
              <select value={fisherfolkType} onChange={e => setFisherfolkType(e.target.value)} className={baseInputClasses}>
                {FISHERFOLK_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {loading && <p style={{ color: '#888', textAlign: 'center' }}>Loading…</p>}
          {error && <p style={{ color: '#c62828' }}>{error}</p>}

          {!loading && chartData.length === 0 && (
            <p style={{ color: '#9e9e9e', textAlign: 'center', marginTop: 40 }}>
              No catch records found for the selected filters.
            </p>
          )}

          {chartData.length > 0 && (
            <>
              <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
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

              <div style={{ overflowX: 'auto', marginTop: 18 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#1B4D2E' }}>
                      {['Season', 'Year', 'Total Catch (kg)', 'Trips', 'Active Fisherfolk'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#fff', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.15)', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                        <td style={{ padding: '7px 10px' }}>{row.season}</td>
                        <td style={{ padding: '7px 10px' }}>{row.year}</td>
                        <td style={{ padding: '7px 10px' }}>{row.volume_kg.toLocaleString()} kg</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>{row.trips}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>{row.fisherfolk}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
    </ModalShell>
  );
}
