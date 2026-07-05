import React, { useState, useCallback } from 'react';
import axiosInstance from '../../api/axiosInstance';

const GROWTH_STAGES = [
  'Land Preparation', 'Planted', 'Vegetative', 'Reproductive',
  'Maturity', 'Near Harvest', 'Harvested',
]

const CAUSAL_FACTORS = [
  { value: '', label: 'None / Normal Season' },
  { value: 'Typhoon-Flooding', label: 'Typhoon / Flooding' },
  { value: 'Drought', label: 'Drought / Dry Spell' },
  { value: 'Pest', label: 'Pest Infestation' },
  { value: 'Disease', label: 'Crop Disease' },
  { value: 'Poor Soil', label: 'Poor Soil Condition' },
  { value: 'Delayed Input', label: 'Delayed Farm Inputs' },
  { value: 'Other', label: 'Other' },
]

const ALERT_LEVELS = ['None', 'Low', 'Medium', 'High'];
const STATUS_CHOICES = ['Draft', 'Submitted', 'Verified'];

const ALERT_COLORS = {
  None: '#757575',
  Low: '#388e3c',
  Medium: '#f57c00',
  High: '#c62828',
};

export default function BarangayCropDetailModal({ record, onClose, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...record });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      await axiosInstance.patch(`/production/barangay-crop-summary/${record.id}/`, form);
      onSaved();
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Save failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete this record for ${record.barangay} — ${record.crop_name}?`)) return;
    try {
      await axiosInstance.delete(`/production/barangay-crop-summary/${record.id}/`);
      onSaved();
      onClose();
    } catch {
      setError('Delete failed.');
    }
  };

  const alertColor = ALERT_COLORS[record.alert_level] || '#757575';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: 620 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {record.barangay} — {record.crop_name}
            <span style={{
              marginLeft: 10, fontSize: 12, padding: '2px 8px', borderRadius: 12,
              background: alertColor + '22', color: alertColor, fontWeight: 600,
            }}>
              {record.alert_level} Alert
            </span>
          </h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {!editing ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: 14 }}>
                {[
                  ['Season / Year', `${record.season} Season ${record.year}`],
                  ['Status', record.submission_status],
                  ['Area Planted (ha)', record.area_planted_ha],
                  ['Number of Farmers', record.number_of_farmers],
                  ['Growth Stage', record.current_growth_stage || '—'],
                  ['Causal Factor', record.causal_factor || '—'],
                  ['Planting Start', record.planting_date_start || '—'],
                  ['Planting End', record.planting_date_end || '—'],
                  ['Expected Harvest Start', record.expected_harvest_start || '—'],
                  ['Expected Harvest End', record.expected_harvest_end || '—'],
                  ['Estimated Yield (kg)', record.estimated_yield_kg != null ? Number(record.estimated_yield_kg).toLocaleString() : '—'],
                  ['Actual Yield (kg)', record.actual_yield_kg != null ? Number(record.actual_yield_kg).toLocaleString() : '—'],
                  ['Yield Variance (kg)', record.yield_variance_kg != null ? Number(record.yield_variance_kg).toLocaleString() : '—'],
                  ['Yield Variance (%)', record.yield_variance_pct != null ? `${Number(record.yield_variance_pct).toFixed(1)}%` : '—'],
                  ['Data Source', record.data_source],
                  ['Coverage %', record.coverage_pct != null ? `${Number(record.coverage_pct).toFixed(1)}%` : '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ color: '#9e9e9e', fontSize: 11, marginBottom: 2 }}>{k}</div>
                    <div style={{ fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
                {record.observed_problems && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ color: '#9e9e9e', fontSize: 11, marginBottom: 2 }}>Observed Problems</div>
                    <div style={{ fontWeight: 500, whiteSpace: 'pre-wrap' }}>{record.observed_problems}</div>
                  </div>
                )}
              </div>

              {record.linked_monitoring_records?.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>
                    Linked Individual Records ({record.linked_monitoring_records.length})
                  </div>
                  <div style={{ color: '#666', fontSize: 13 }}>
                    {record.computed_area_from_records != null && (
                      <span>Computed Area: {Number(record.computed_area_from_records).toFixed(4)} ha | </span>
                    )}
                    {record.computed_yield_from_records != null && (
                      <span>Computed Yield: {Number(record.computed_yield_from_records).toLocaleString()} kg</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Growth Stage</label>
                <select name="current_growth_stage" value={form.current_growth_stage || ''}
                  onChange={handleChange} className="form-control">
                  <option value="">—</option>
                  {GROWTH_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Alert Level</label>
                <select name="alert_level" value={form.alert_level} onChange={handleChange} className="form-control">
                  {ALERT_LEVELS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Area Planted (ha)</label>
                <input type="number" name="area_planted_ha" value={form.area_planted_ha || ''}
                  onChange={handleChange} className="form-control" step="0.0001" min="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Number of Farmers</label>
                <input type="number" name="number_of_farmers" value={form.number_of_farmers || ''}
                  onChange={handleChange} className="form-control" min="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Estimated Yield (kg)</label>
                <input type="number" name="estimated_yield_kg" value={form.estimated_yield_kg || ''}
                  onChange={handleChange} className="form-control" min="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Actual Yield (kg)</label>
                <input type="number" name="actual_yield_kg" value={form.actual_yield_kg || ''}
                  onChange={handleChange} className="form-control" min="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Causal Factor</label>
                <select name="causal_factor" value={form.causal_factor || 'None'}
                  onChange={handleChange} className="form-control">
                  {CAUSAL_FACTORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Submission Status</label>
                <select name="submission_status" value={form.submission_status}
                  onChange={handleChange} className="form-control">
                  {STATUS_CHOICES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Observed Problems</label>
                <textarea name="observed_problems" value={form.observed_problems || ''}
                  onChange={handleChange} className="form-control" rows={3} />
              </div>
            </div>
          )}

          {error && <p style={{ color: '#c62828', marginTop: 12, fontSize: 13 }}>{error}</p>}
        </div>

        <div className="modal-footer">
          {!editing && (
            <button className="btn btn-danger-outline" onClick={handleDelete}
              style={{ border: '1px solid #ef9a9a', color: '#c62828', background: 'none' }}>
              Delete
            </button>
          )}
          <div style={{ flex: 1 }} />
          {!editing ? (
            <button className="btn btn-primary" onClick={() => setEditing(true)}>Edit</button>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => { setEditing(false); setForm({ ...record }); }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
