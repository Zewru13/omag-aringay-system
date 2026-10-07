import React, { useState, useCallback } from 'react';
import axiosInstance from '../../api/axiosInstance';
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect';

const CROP_NAMES = [
  'Palay (Rice)', 'Corn (Mais)', 'Onion', 'Garlic', 'Tomato', 'Eggplant (Talong)',
  'Bitter Gourd (Ampalaya)', 'String Beans (Sitaw)', 'Pechay', 'Cabbage',
  'Mango', 'Cacao (Kakaw)', 'Banana (Saging)', 'Coffee (Kape)', 'Cassava',
  'Sweet Potato (Kamote)', 'Other Vegetables', 'Other Fruits', 'Other Root Crops',
  'Cash Crops', 'Other',
]

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

const SEASONS = ['Dry', 'Wet'];
const ALERT_LEVELS = ['None', 'Low', 'Medium', 'High'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);

const STEPS = ['Basic Info', 'Yield & Stage', 'Submit'];

const emptyForm = {
  barangay: '',
  crop_name: '',
  season: '',
  year: CURRENT_YEAR,
  area_planted_ha: '',
  number_of_farmers: '',
  planting_date_start: '',
  planting_date_end: '',
  expected_harvest_start: '',
  expected_harvest_end: '',
  current_growth_stage: '',
  observed_problems: '',
  alert_level: 'None',
  estimated_yield_kg: '',
  actual_yield_kg: '',
  causal_factor: 'None',
  submission_status: 'Draft',
};

export default function EncodeBarangayReportModal({ onClose, onSaved }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }, []);

  const checkDuplicate = useCallback(async () => {
    if (!form.barangay || !form.crop_name || !form.season || !form.year) return;
    try {
      const res = await axiosInstance.get('/production/barangay-crop-summary/', {
        params: {
          barangay: form.barangay,
          crop_name: form.crop_name,
          season: form.season,
          year: form.year,
        },
      });
      if (res.data.results?.length > 0 || (Array.isArray(res.data) && res.data.length > 0)) {
        const existing = res.data.results?.[0] || res.data[0];
        setDuplicateWarning(
          `A record already exists for ${form.barangay} — ${form.crop_name} (${form.season} ${form.year}). ` +
          `Status: ${existing.submission_status}. Proceeding will create a duplicate.`
        );
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      // non-blocking
    }
  }, [form.barangay, form.crop_name, form.season, form.year]);

  const nextStep = async () => {
    if (step === 0) await checkDuplicate();
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const prevStep = () => setStep(s => Math.max(s - 1, 0));

  const handleSubmit = async (submitAs) => {
    setLoading(true);
    setError(null);
    const payload = { ...form, submission_status: submitAs };
    ['area_planted_ha', 'number_of_farmers', 'year', 'estimated_yield_kg', 'actual_yield_kg'].forEach(k => {
      if (payload[k] === '') payload[k] = null;
    });
    try {
      await axiosInstance.post('/production/barangay-crop-summary/', payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || JSON.stringify(err.response?.data) || 'Failed to save.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Encode Barangay Crop Report</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 24px 0' }}>
          {STEPS.map((label, i) => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                height: 4, borderRadius: 2,
                background: i <= step ? 'var(--color-primary, #2e7d32)' : '#e0e0e0',
                marginBottom: 4,
              }} />
              <span style={{ fontSize: 11, color: i <= step ? '#2e7d32' : '#9e9e9e' }}>{label}</span>
            </div>
          ))}
        </div>

        <div className="modal-body">
          {duplicateWarning && (
            <div style={{
              background: '#fff3e0', border: '1px solid #ff9800', borderRadius: 6,
              padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#e65100',
            }}>
              ⚠ {duplicateWarning}
            </div>
          )}

          {step === 0 && (
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Barangay *</label>
                <BarangaySelect
                  name="barangay"
                  value={form.barangay}
                  onChange={handleChange}
                  className="form-control"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Crop *</label>
                <select name="crop_name" value={form.crop_name} onChange={handleChange} className="form-control">
                  <option value="">— Select Crop —</option>
                  {CROP_NAMES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Season *</label>
                <select name="season" value={form.season} onChange={handleChange} className="form-control">
                  <option value="">— Select Season —</option>
                  {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Year *</label>
                <select name="year" value={form.year} onChange={handleChange} className="form-control">
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Area Planted (ha)</label>
                <DecimalInput decimals={4} value={form.area_planted_ha}
                  onChange={(v) => handleChange({ target: { name: 'area_planted_ha', value: v } })} className="form-control" />
              </div>
              <div className="form-group">
                <label className="form-label">Number of Farmers</label>
                <input type="number" name="number_of_farmers" value={form.number_of_farmers}
                  onChange={handleChange} className="form-control" min="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Planting Date Start</label>
                <input type="date" name="planting_date_start" value={form.planting_date_start}
                  onChange={handleChange} className="form-control" />
              </div>
              <div className="form-group">
                <label className="form-label">Planting Date End</label>
                <input type="date" name="planting_date_end" value={form.planting_date_end}
                  onChange={handleChange} className="form-control" />
              </div>
              <div className="form-group">
                <label className="form-label">Expected Harvest Start</label>
                <input type="date" name="expected_harvest_start" value={form.expected_harvest_start}
                  onChange={handleChange} className="form-control" />
              </div>
              <div className="form-group">
                <label className="form-label">Expected Harvest End</label>
                <input type="date" name="expected_harvest_end" value={form.expected_harvest_end}
                  onChange={handleChange} className="form-control" />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Current Growth Stage</label>
                <select name="current_growth_stage" value={form.current_growth_stage}
                  onChange={handleChange} className="form-control">
                  <option value="">— Select Stage —</option>
                  {GROWTH_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Alert Level</label>
                <select name="alert_level" value={form.alert_level} onChange={handleChange} className="form-control">
                  {ALERT_LEVELS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Observed Problems</label>
                <textarea name="observed_problems" value={form.observed_problems}
                  onChange={handleChange} className="form-control" rows={3} />
              </div>
              <div className="form-group">
                <label className="form-label">Estimated Yield (kg)</label>
                <input type="number" name="estimated_yield_kg" value={form.estimated_yield_kg}
                  onChange={handleChange} className="form-control" min="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Actual Yield (kg)</label>
                <input type="number" name="actual_yield_kg" value={form.actual_yield_kg}
                  onChange={handleChange} className="form-control" min="0" />
              </div>
              <div className="form-group">
                <label className="form-label">Causal Factor</label>
                <select name="causal_factor" value={form.causal_factor} onChange={handleChange} className="form-control">
                  {CAUSAL_FACTORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <p style={{ marginBottom: 16, color: '#555', fontSize: 14 }}>
                Review and choose a save option. You can save as <b>Draft</b> to continue editing later,
                or <b>Submit</b> to mark it as awaiting verification.
              </p>
              <div style={{ background: '#f5f5f5', borderRadius: 8, padding: '14px 16px', fontSize: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {[
                      ['Barangay', form.barangay],
                      ['Crop', form.crop_name],
                      ['Season / Year', `${form.season} ${form.year}`],
                      ['Area (ha)', form.area_planted_ha || '—'],
                      ['Farmers', form.number_of_farmers || '—'],
                      ['Stage', form.current_growth_stage || '—'],
                      ['Alert Level', form.alert_level],
                      ['Est. Yield (kg)', form.estimated_yield_kg || '—'],
                      ['Act. Yield (kg)', form.actual_yield_kg || '—'],
                    ].map(([k, v]) => (
                      <tr key={k}>
                        <td style={{ color: '#777', paddingBottom: 4, width: 140 }}>{k}</td>
                        <td style={{ fontWeight: 500 }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <p style={{ color: '#c62828', marginTop: 12, fontSize: 13 }}>{error}</p>
          )}
        </div>

        <div className="modal-footer">
          {step > 0 && (
            <button className="btn btn-secondary" onClick={prevStep} disabled={loading}>Back</button>
          )}
          <div style={{ flex: 1 }} />
          {step < STEPS.length - 1 && (
            <button className="btn btn-primary" onClick={nextStep}>Next</button>
          )}
          {step === STEPS.length - 1 && (
            <>
              <button className="btn btn-secondary" onClick={() => handleSubmit('Draft')} disabled={loading}>
                Save as Draft
              </button>
              <button className="btn btn-primary" onClick={() => handleSubmit('Submitted')} disabled={loading}>
                {loading ? 'Saving…' : 'Submit Report'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
