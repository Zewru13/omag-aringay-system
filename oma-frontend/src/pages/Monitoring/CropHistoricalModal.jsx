import React, { useState, useEffect } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import axiosInstance from '../../api/axiosInstance';
import BarangaySelect from '../../components/UI/BarangaySelect';

const CROP_NAMES = [
  'Palay (Rice)', 'Corn (Mais)', 'Onion', 'Garlic', 'Tomato', 'Eggplant (Talong)',
  'Bitter Gourd (Ampalaya)', 'String Beans (Sitaw)', 'Pechay', 'Cabbage',
  'Mango', 'Cacao (Kakaw)', 'Banana (Saging)', 'Coffee (Kape)', 'Cassava',
  'Sweet Potato (Kamote)', 'Other Vegetables', 'Other Fruits', 'Other Root Crops',
  'Cash Crops', 'Other',
]

export default function CropHistoricalModal({ onClose }) {
  const [cropName, setCropName] = useState('');
  const [barangay, setBarangay] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = async () => {
    if (!cropName) return;
    setLoading(true);
    setError(null);
    try {
      const params = { crop_name: cropName };
      if (barangay) params.barangay = barangay;
      const res = await axiosInstance.get('/production/analytics/crop-history/', { params });
      setData(res.data);
    } catch {
      setError('Failed to load historical data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cropName) fetchHistory();
  }, [cropName, barangay]);

  const chartData = data?.timeline?.map(row => ({
    label: `${row.season.charAt(0)}${row.year}`,
    season: row.season,
    year: row.year,
    area: Number(row.total_area_ha || 0),
    estimated: Number(row.total_estimated_yield_kg || 0),
    actual: Number(row.total_actual_yield_kg || 0),
    variance_pct: row.variance_pct,
    causal: row.primary_causal_factor,
    barangays: row.barangay_count,
  })) || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: 820, maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Crop Historical Timeline</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>Crop *</label>
              <select value={cropName} onChange={e => setCropName(e.target.value)} className="form-control">
                <option value="">— Select Crop —</option>
                {CROP_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 4 }}>
                Barangay (optional)
              </label>
              <BarangaySelect
                value={barangay}
                onChange={e => setBarangay(e.target.value)}
                className="form-control"
                includeAllOption
                allOptionLabel="Municipality-wide"
              />
            </div>
          </div>

          {loading && <p style={{ color: '#888', textAlign: 'center' }}>Loading…</p>}
          {error && <p style={{ color: '#c62828' }}>{error}</p>}

          {!cropName && (
            <p style={{ color: '#9e9e9e', textAlign: 'center', marginTop: 40 }}>
              Select a crop to view historical data.
            </p>
          )}

          {data && !loading && chartData.length === 0 && (
            <p style={{ color: '#9e9e9e', textAlign: 'center', marginTop: 40 }}>
              No historical records found for {data.crop_name} ({data.scope}).
            </p>
          )}

          {chartData.length > 0 && (
            <>
              <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
                <b>{data.crop_name}</b> — {data.scope} — {chartData.length} season record(s)
              </div>

              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === 'Var%') return [`${Number(value).toFixed(1)}%`, name];
                      return [Number(value).toLocaleString(), name];
                    }}
                    labelFormatter={(label) => {
                      const d = chartData.find(r => r.label === label);
                      return d ? `${d.season} ${d.year}` : label;
                    }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="estimated" name="Est. Yield (kg)" fill="#81c784" barSize={18} />
                  <Bar yAxisId="left" dataKey="actual" name="Act. Yield (kg)" fill="#2e7d32" barSize={18} />
                  <Line
                    yAxisId="right" type="monotone" dataKey="variance_pct"
                    name="Var%" stroke="#f44336" dot={{ r: 3 }} strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>

              {/* Data table */}
              <div style={{ overflowX: 'auto', marginTop: 18 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#1B4D2E' }}>
                      {['Season', 'Year', 'Area (ha)', 'Est. Yield', 'Act. Yield', 'Var%', 'Causal Factor', 'Barangays'].map(h => (
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
                        <td style={{ padding: '7px 10px' }}>{row.area.toFixed(4)}</td>
                        <td style={{ padding: '7px 10px' }}>{row.estimated > 0 ? row.estimated.toLocaleString() : '—'}</td>
                        <td style={{ padding: '7px 10px' }}>{row.actual > 0 ? row.actual.toLocaleString() : '—'}</td>
                        <td style={{ padding: '7px 10px', color: row.variance_pct != null ? (row.variance_pct < 0 ? '#c62828' : '#2e7d32') : '#999' }}>
                          {row.variance_pct != null ? `${Number(row.variance_pct).toFixed(1)}%` : '—'}
                        </td>
                        <td style={{ padding: '7px 10px' }}>{row.causal || 'None'}</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>{row.barangays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
