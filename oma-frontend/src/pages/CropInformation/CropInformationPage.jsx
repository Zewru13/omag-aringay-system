import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react";
import BarangaySelect from "../../components/UI/BarangaySelect.jsx";
import api from "../../api/axiosInstance.js";
import PageLayout from "../../components/Layout/PageLayout.jsx";
import RowActions from "../../components/UI/RowActions.jsx";
import ConfirmDialog from "../../components/UI/ConfirmDialog.jsx";
import ErrorMessage from "../../components/UI/ErrorMessage.jsx";
import FilterPanel from "../../components/UI/FilterPanel.jsx";
import HarvestVarianceBadge from "../../components/UI/HarvestVarianceBadge.jsx";
import FormField, { baseInputClasses } from "../../components/UI/FormField.jsx";
import ModalShell from "../../components/UI/ModalShell.jsx";
import PaginationBar from "../../components/UI/PaginationBar.jsx";
import StatusPill from "../../components/UI/StatusPill.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import AddCropMonitoringModal from "../Monitoring/AddCropMonitoringModal.jsx";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtShort(v) {
  if (!v) return "—";
  const d = new Date(v + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function fmtLong(v) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(v + "T00:00:00"));
}

function getDisplayStatus(rec) {
  if (rec.status === "Total Loss") return "Total Loss";
  if (rec.status === "Harvested") return "Harvested";
  if (rec.status === "Near Harvest") return "Near Harvest";
  if (rec.expected_harvest_date) {
    const today = new Date();
    const harvest = new Date(rec.expected_harvest_date + "T00:00:00");
    const daysLeft = Math.ceil((harvest - today) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) return "Near Harvest";
  }
  return "Planted";
}

const STATUS_TONES = {
  Planted: "green",
  "Near Harvest": "amber",
  Harvested: "blue",
  "Total Loss": "rose",
};

const COLUMNS = [
  { key: "crop_type_name", label: "CROP" },
  { key: "area_ha_fmt", label: "AREA PLANTED (HA)" },
  { key: "date_planted_fmt", label: "DATE PLANTED" },
  { key: "expected_harvest_fmt", label: "ESTIMATED HARVEST DATE" },
  { key: "est_yield_fmt", label: "ESTIMATED YIELD (KG)" },
  { key: "assoc_name", label: "ORGANIZATION" },
  { key: "status_cell", label: "STATUS" },
  { key: "actions_cell", label: "ACTIONS" },
];

const filterSelectCls =
  "rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none";

const STATUS_FILTER_OPTIONS = [
  "All Status",
  "Planted",
  "Near Harvest",
  "Harvested",
  "Total Loss",
];

// ─── Add Remark Modal ─────────────────────────────────────────────────────────

function AddRemarkModal({ record, onClose, onSuccess }) {
  const { showToast } = useToast();
  const [customStatus, setCustomStatus] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) {
      setError("Remark content is required.");
      return;
    }
    setError("");
    setShowConfirm(true);
  };

  const handleConfirmed = async () => {
    setShowConfirm(false);
    setIsSubmitting(true);
    try {
      await api.post(`/production/monitoring/${record.id}/remarks/`, {
        custom_status: customStatus.trim(),
        content: content.trim(),
      });
      showToast("Remark added.", "success");
      onSuccess();
    } catch {
      showToast("Failed to save remark.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <ModalShell title="Add Remark" onClose={onClose} maxWidth="max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Custom Status">
            <input
              className={baseInputClasses}
              placeholder="e.g. FOR MONITORING, GOOD CONDITION"
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value.toUpperCase())}
            />
          </FormField>
          <FormField label="Remark Content" required>
            <textarea
              className={`${baseInputClasses} h-auto py-2`}
              rows={4}
              placeholder="ENTER REMARK CONTENT..."
              value={content}
              onChange={(e) => setContent(e.target.value.toUpperCase())}
            />
          </FormField>
          {error && (
            <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#4A5E4A] border border-[#C8D5C8] hover:bg-[#F5F7F5] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !content.trim()}
              className="flex items-center gap-2 rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] disabled:opacity-60 transition-colors"
            >
              {isSubmitting && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              Save Remark
            </button>
          </div>
        </form>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Add Remark"
          message="Are you sure you want to save this remark?"
          confirmLabel="Yes, Save Remark"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

// ─── Remarks Modal (two-panel) ────────────────────────────────────────────────

function RemarksModal({ record, onClose }) {
  const { showToast } = useToast();
  const [remarks, setRemarks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchRemarks = useCallback(async () => {
    setIsLoading(true);
    try {
      const r = await api.get(`/production/monitoring/${record.id}/remarks/`);
      setRemarks(Array.isArray(r.data) ? r.data : r.data.results || []);
    } catch {
      showToast("Failed to load remarks.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [record.id]);

  useEffect(() => {
    fetchRemarks();
  }, [fetchRemarks]);

  const handleDelete = async (id) => {
    try {
      await api.delete(`/production/remarks/${id}/`);
      showToast("Remark deleted.", "success");
      fetchRemarks();
    } catch {
      showToast("Failed to delete remark.", "error");
    }
  };

  const displayStatus = getDisplayStatus(record);

  return (
    <>
      <ModalShell
        title={`Crop Remarks — ${record.crop_type_name}`}
        onClose={onClose}
        maxWidth="max-w-4xl"
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* LEFT: Crop Details */}
          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-5">
            <p className="mb-4 text-[13px] font-semibold text-[#1B4D2E]">
              Crop Details
            </p>
            <div className="space-y-3">
              {[
                { label: "Crop Type", value: record.crop_type_name },
                {
                  label: "Farmer Organization",
                  value: record.organization_name || "—",
                },
                {
                  label: "Area Planted (ha)",
                  value: record.area_planted_ha
                    ? Number(record.area_planted_ha).toFixed(2)
                    : "—",
                },
                { label: "Date Planted", value: fmtLong(record.date_planted) },
                {
                  label: "Est. Harvest Date",
                  value: fmtLong(record.expected_harvest_date),
                },
                { label: "Status", value: displayStatus },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-4"
                >
                  <span className="whitespace-nowrap text-[12px] font-medium text-[#7A8E7A]">
                    {label}
                  </span>
                  <span className="text-right text-[13px] font-semibold text-[#1A2B1A]">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Remarks History */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-[#1A2B1A]">
                Remarks History
              </p>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#235E38] transition-colors"
              >
                <Plus size={12} /> Add Remark
              </button>
            </div>

            {isLoading ? (
              <p className="py-8 text-center text-[13px] text-[#7A8E7A]">
                Loading…
              </p>
            ) : remarks.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-[#7A8E7A]">
                <MessageCircle size={32} className="opacity-40" />
                <p className="text-[13px]">
                  No remarks yet for this crop record.
                </p>
              </div>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {remarks.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-r-lg border border-[#E2E8E2] bg-white px-4 py-3"
                    style={{ borderLeft: "3px solid #1B4D2E" }}
                  >
                    {r.custom_status && (
                      <span className="mb-1.5 inline-block rounded-full bg-[#EBF5EE] px-2.5 py-0.5 text-[11px] font-semibold text-[#1B4D2E]">
                        {r.custom_status}
                      </span>
                    )}
                    <p className="text-[13px] font-medium text-[#1A2B1A]">
                      {r.content}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <p className="text-[12px] text-[#7A8E7A]">
                        {r.created_by_name || "System"} ·{" "}
                        {r.date_created
                          ? fmtLong(r.date_created.slice(0, 10))
                          : "—"}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="text-[12px] font-medium text-[#C0392B] hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ModalShell>

      {showAddModal && (
        <AddRemarkModal
          record={record}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchRemarks();
          }}
        />
      )}
    </>
  );
}

// ─── Edit Crop Modal ──────────────────────────────────────────────────────────

const editLabelCls = "block text-[13px] font-medium text-[#4A5E4A] mb-1.5";

function EditCropModal({ record, onClose, onSaved }) {
  const { showToast } = useToast();

  // Farmer search
  const [farmerQuery, setFarmerQuery] = useState(record.farmer_name || "");
  const [farmerResults, setFarmerResults] = useState([]);
  const [searchingFarmer, setSearchingFarmer] = useState(false);
  const [showFarmerDrop, setShowFarmerDrop] = useState(false);
  const [selectedFarmer, setSelectedFarmer] = useState({
    farmer_id: record.farmer || null,
    farmer_full_name: record.farmer_name || "",
    farmer_home_barangay: "",
    farmer_assoc_id: record.farmers_organization || null,
    farmer_assoc_name: record.organization_name || "",
  });
  const farmerWrapperRef = useRef(null);
  const farmerDebounceRef = useRef(null);

  // Crop types (for harvest preview)
  const [cropTypes, setCropTypes] = useState([]);

  // Form
  const originalData = {
    farm_location_barangay: record.farm_location_barangay || "",
    land_status: record.land_status || "",
    land_status_other_specify: record.land_status_other_specify || "",
    date_planted: record.date_planted || "",
    area_planted_ha: record.area_planted_ha
      ? String(record.area_planted_ha)
      : "",
    season: record.season || "",
    variety_used: record.variety_used || "",
    seed_source: record.seed_source || "",
    seed_source_other_specify: record.seed_source_other_specify || "",
    quantity_of_seeds: record.quantity_of_seeds
      ? String(record.quantity_of_seeds)
      : "",
    seed_quantity_unit: record.seed_quantity_unit || "kg",
  };
  const [form, setForm] = useState(originalData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const normalize = (v) =>
    v === null || v === undefined ? "" : String(v).trim();
  const isDirty =
    Object.keys(originalData).some(
      (k) => normalize(form[k]) !== normalize(originalData[k]),
    ) || selectedFarmer.farmer_id !== (record.farmer || null);

  useEffect(() => {
    api
      .get("/production/crop-types/")
      .then((r) => {
        setCropTypes(Array.isArray(r.data) ? r.data : r.data.results || []);
      })
      .catch(() => {});
  }, []);

  // Close farmer dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        farmerWrapperRef.current &&
        !farmerWrapperRef.current.contains(e.target)
      ) {
        setShowFarmerDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Harvest preview
  const cropType = cropTypes.find(
    (c) => String(c.id) === String(record.crop_type),
  );
  const harvestDate = useMemo(() => {
    if (!form.date_planted || !cropType?.days_to_harvest) return null;
    const d = new Date(form.date_planted + "T00:00:00");
    d.setDate(d.getDate() + cropType.days_to_harvest);
    return d;
  }, [form.date_planted, cropType]);
  const estimatedYield = useMemo(() => {
    if (!form.area_planted_ha || !cropType?.yield_per_ha_kg) return null;
    return (
      parseFloat(form.area_planted_ha) * parseFloat(cropType.yield_per_ha_kg)
    );
  }, [form.area_planted_ha, cropType]);

  // Farmer search handlers
  const handleFarmerQueryChange = (e) => {
    const q = e.target.value;
    setFarmerQuery(q);
    setSelectedFarmer((f) => ({ ...f, farmer_id: null, farmer_full_name: "" }));
    clearTimeout(farmerDebounceRef.current);
    if (!q.trim()) {
      setFarmerResults([]);
      setShowFarmerDrop(false);
      return;
    }
    farmerDebounceRef.current = setTimeout(async () => {
      setSearchingFarmer(true);
      try {
        const r = await api.get("/farmers/", { params: { search: q } });
        const list = Array.isArray(r.data) ? r.data : r.data.results || [];
        setFarmerResults(list.slice(0, 8));
        setShowFarmerDrop(true);
      } catch {
        setFarmerResults([]);
      } finally {
        setSearchingFarmer(false);
      }
    }, 300);
  };

  const handleFarmerSelect = (farmer) => {
    setSelectedFarmer({
      farmer_id: farmer.id,
      farmer_full_name: farmer.full_name,
      farmer_home_barangay: farmer.barangay || "",
      farmer_assoc_id: farmer.organization_id || null,
      farmer_assoc_name: farmer.organization_name || "",
    });
    setFarmerQuery(farmer.full_name);
    setFarmerResults([]);
    setShowFarmerDrop(false);
    if (farmer.barangay && !form.farm_location_barangay) {
      set("farm_location_barangay", farmer.barangay);
    }
  };

  const detectSeason = (dateStr) => {
    if (!dateStr) return form.season;
    const month = new Date(dateStr).getMonth() + 1;
    return month >= 6 && month <= 11 ? "Wet" : "Dry";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFarmer.farmer_id) {
      setError("Please select a farmer.");
      return;
    }
    if (!form.date_planted) {
      setError("Date planted is required.");
      return;
    }
    if (!form.area_planted_ha) {
      setError("Area planted (ha) is required.");
      return;
    }
    const nextFieldErrors = {};
    if (!form.farm_location_barangay) {
      nextFieldErrors.farm_location_barangay = "Farm location (barangay) is required.";
    }
    if (!form.land_status) {
      nextFieldErrors.land_status = "Land status is required.";
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setError("Please fix the highlighted fields.");
      return;
    }
    setFieldErrors({});
    setError("");
    setIsSubmitting(true);
    try {
      await api.patch(`/production/monitoring/${record.id}/`, {
        farmer: selectedFarmer.farmer_id,
        farmers_organization: selectedFarmer.farmer_assoc_id || null,
        farm_location_barangay: form.farm_location_barangay,
        land_status: form.land_status,
        land_status_other_specify: form.land_status === "Other" ? form.land_status_other_specify : "",
        date_planted: form.date_planted,
        area_planted_ha: form.area_planted_ha || null,
        season: form.season,
        variety_used: form.variety_used,
        seed_source: form.seed_source,
        seed_source_other_specify: form.seed_source === "Other" ? form.seed_source_other_specify : "",
        quantity_of_seeds: form.quantity_of_seeds
          ? parseFloat(form.quantity_of_seeds)
          : null,
        seed_quantity_unit: form.seed_quantity_unit,
      });
      showToast("Crop record updated successfully.", "success");
      onSaved();
    } catch {
      setError("Failed to update crop record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell
      title={`Edit — ${record.crop_type_name}`}
      subtitle="Update crop record details."
      icon={Pencil}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Farmer Search */}
        <div ref={farmerWrapperRef} className="relative">
          <label className={editLabelCls}>
            Farmer <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8BCA8] pointer-events-none"
            />
            <input
              type="text"
              className={`${baseInputClasses} pl-8`}
              placeholder="Search farmer name or RSBSA..."
              value={farmerQuery}
              onChange={handleFarmerQueryChange}
              onFocus={() => {
                if (farmerResults.length > 0) setShowFarmerDrop(true);
              }}
            />
            {searchingFarmer && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-[#1B4D2E] border-t-transparent" />
            )}
          </div>
          {selectedFarmer.farmer_id && (
            <div className="mt-1.5 rounded-lg bg-[#EBF5EE] border border-[#C8E6D0] px-3 py-2 flex items-center gap-2">
              <User size={13} className="text-[#1B4D2E] flex-shrink-0" />
              <div>
                <p className="text-[12px] font-semibold text-[#1B4D2E]">
                  {selectedFarmer.farmer_full_name}
                </p>
                {selectedFarmer.farmer_home_barangay && (
                  <p className="text-[11px] text-[#4A5E4A]">
                    {selectedFarmer.farmer_home_barangay}
                  </p>
                )}
              </div>
            </div>
          )}
          {showFarmerDrop && farmerResults.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-[#E2E8E2] rounded-xl shadow-lg max-h-48 overflow-y-auto">
              {farmerResults.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleFarmerSelect(f)}
                  className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-[#EBF5EE] transition-colors"
                >
                  <User size={13} className="text-[#7A8E7A] flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-medium text-[#1A2B1A]">
                      {f.full_name}
                    </p>
                    <p className="text-[11px] text-[#7A8E7A]">
                      {f.rsbsa_number || ""} · {f.barangay || ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Crop Type — read-only */}
        <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#A8BCA8] mb-1">
            Crop Type (Read-Only)
          </p>
          <p className="text-[14px] font-semibold text-[#1A2B1A]">
            {record.crop_type_name}
          </p>
          {cropType && (
            <p className="text-[12px] text-[#7A8E7A] mt-0.5">
              {cropType.days_to_harvest
                ? `${cropType.days_to_harvest} days to harvest`
                : ""}
              {cropType.yield_per_ha_kg
                ? ` · ${Number(cropType.yield_per_ha_kg).toLocaleString()} kg/ha yield`
                : ""}
            </p>
          )}
        </div>

        {/* Farm Location + Land Status */}
        <div className="grid gap-3 sm:grid-cols-2">
          <BarangaySelect
            label="Farm Location (Barangay)"
            required
            value={form.farm_location_barangay}
            onChange={(e) => set("farm_location_barangay", e.target.value)}
            error={fieldErrors.farm_location_barangay}
          />
          <div>
            <label className={editLabelCls}>
              Land Status <span className="text-rose-500">*</span>
            </label>
            <select
              className={baseInputClasses}
              value={form.land_status}
              onChange={(e) => {
                set("land_status", e.target.value);
                if (e.target.value !== "Other") set("land_status_other_specify", "");
              }}
            >
              <option value="">Select…</option>
              <option value="Owner">Owner</option>
              <option value="Lessee">Lessee</option>
              <option value="Tenant">Tenant</option>
              <option value="Other">Other</option>
            </select>
            {form.land_status === "Other" && (
              <input
                type="text"
                className={`${baseInputClasses} mt-2`}
                placeholder="Please specify land status"
                value={form.land_status_other_specify}
                onChange={(e) => set("land_status_other_specify", e.target.value)}
              />
            )}
            {fieldErrors.land_status && (
              <p className="text-[12px] text-[#C0392B] mt-1">{fieldErrors.land_status}</p>
            )}
          </div>
        </div>

        {/* Date Planted + Area */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={editLabelCls}>
              Date Planted <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              className={baseInputClasses}
              value={form.date_planted}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => {
                set("date_planted", e.target.value);
                if (!form.season) set("season", detectSeason(e.target.value));
              }}
            />
          </div>
          <div>
            <label className={editLabelCls}>
              Area Planted (ha) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={baseInputClasses}
              placeholder="e.g. 2.50"
              value={form.area_planted_ha}
              onChange={(e) => set("area_planted_ha", e.target.value)}
            />
          </div>
        </div>

        {/* Harvest Preview */}
        {(harvestDate || estimatedYield != null) && (
          <div className="rounded-xl border border-[#C8E6D0] bg-[#EBF5EE] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B4D2E] mb-2">
              Harvest Preview
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {harvestDate && (
                <div>
                  <p className="text-[11px] text-[#4A5E4A]">
                    Est. Harvest Date
                  </p>
                  <p className="text-[13px] font-semibold text-[#1A2B1A]">
                    {harvestDate.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              )}
              {estimatedYield != null && (
                <div>
                  <p className="text-[11px] text-[#4A5E4A]">Est. Yield</p>
                  <p className="text-[13px] font-semibold text-[#1A2B1A]">
                    {estimatedYield.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    kg
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Season */}
        <div>
          <label className={editLabelCls}>Season</label>
          <select
            className={baseInputClasses}
            value={form.season}
            onChange={(e) => set("season", e.target.value)}
          >
            <option value="">Select…</option>
            <option value="Wet">Wet</option>
            <option value="Dry">Dry</option>
          </select>
        </div>

        {/* Variety Used */}
        <div>
          <label className={editLabelCls}>
            Variety Used{" "}
            <span className="text-[12px] font-normal text-[#7A8E7A]">
              (optional)
            </span>
          </label>
          <input
            type="text"
            className={baseInputClasses}
            placeholder="e.g. RC9, PSB Rc18"
            value={form.variety_used}
            onChange={(e) => set("variety_used", e.target.value)}
          />
        </div>

        {/* Seed Source */}
        <div>
          <label className={editLabelCls}>
            Seed Source{" "}
            <span className="text-[12px] font-normal text-[#7A8E7A]">
              (optional)
            </span>
          </label>
          <select
            className={baseInputClasses}
            value={form.seed_source}
            onChange={(e) => {
              set("seed_source", e.target.value);
              if (e.target.value !== "Other") set("seed_source_other_specify", "");
            }}
          >
            <option value="">Select…</option>
            <option value="Own Seeds">Own Seeds</option>
            <option value="DA/LGU Provided">DA/LGU Provided</option>
            <option value="Commercial">Commercial</option>
            <option value="Organization">Organization</option>
            <option value="Other">Other</option>
          </select>
          {form.seed_source === "Other" && (
            <input
              type="text"
              className={`${baseInputClasses} mt-2`}
              placeholder="Please specify seed source"
              value={form.seed_source_other_specify}
              onChange={(e) => set("seed_source_other_specify", e.target.value)}
            />
          )}
        </div>

        {/* Quantity + Unit */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={editLabelCls}>
              Quantity of Seeds{" "}
              <span className="text-[12px] font-normal text-[#7A8E7A]">
                (optional)
              </span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className={baseInputClasses}
              placeholder="e.g. 25"
              value={form.quantity_of_seeds}
              onChange={(e) => set("quantity_of_seeds", e.target.value)}
            />
          </div>
          <div>
            <label className={editLabelCls}>Unit</label>
            <select
              className={baseInputClasses}
              value={form.seed_quantity_unit}
              onChange={(e) => set("seed_quantity_unit", e.target.value)}
            >
              <option value="kg">kg</option>
              <option value="bags">bags</option>
              <option value="pcs">pcs</option>
              <option value="bundles">bundles</option>
            </select>
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !isDirty}
            className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Detail Modal (Eye) ────────────────────────────────────────────────────────

function CropDetailModal({ record, onClose }) {
  const displayStatus = getDisplayStatus(record);
  const fmtNum = (v) =>
    v == null
      ? "—"
      : Number(v).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  const seedSourceDisplay =
    record.seed_source === "Other"
      ? `Other — ${record.seed_source_other_specify || ""}`
      : record.seed_source || "—";
  const landStatusDisplay =
    record.land_status === "Other"
      ? `Other — ${record.land_status_other_specify || ""}`
      : record.land_status || "—";

  const rows = [
    ["Crop Type", record.crop_type_name || "—"],
    ["Farmer", record.farmer_full_name || record.farmer_name || "—"],
    ["Organization", record.organization_name || "—"],
    ["Farm Location", record.farmer_barangay || record.farm_location_barangay || "—"],
    ["Land Status", landStatusDisplay],
    ["Season / Year", `${record.season || "—"} ${record.year || ""}`],
    ["Date Planted", fmtLong(record.date_planted)],
    ["Area Planted (ha)", record.area_planted_ha ? Number(record.area_planted_ha).toFixed(2) : "—"],
    ["Expected Harvest Date", fmtLong(record.expected_harvest_date)],
    [
      "Actual Harvest Date",
      <span className="flex items-center justify-end gap-1.5" key="ahd">
        {fmtLong(record.actual_harvest_date)}
        <HarvestVarianceBadge days={record.harvest_variance_days} />
      </span>,
    ],
    ["Status", displayStatus],
    ["Current Growth Stage", record.current_growth_stage || "—"],
    ["Estimated Yield (kg)", fmtNum(record.estimated_yield_kg)],
    ["Actual Yield (kg)", fmtNum(record.actual_yield_kg)],
    [
      "Yield Variance",
      record.yield_variance_pct != null ? `${Number(record.yield_variance_pct).toFixed(1)}%` : "—",
    ],
    ["Variety Used", record.variety_used || "—"],
    ["Seed Source", seedSourceDisplay],
    [
      "Quantity of Seeds",
      record.quantity_of_seeds ? `${record.quantity_of_seeds} ${record.seed_quantity_unit || ""}` : "—",
    ],
    ["Notes", record.notes || "—"],
  ];

  return (
    <ModalShell
      title={`Crop Record — ${record.crop_type_name}`}
      subtitle="Read-only detail view"
      icon={Eye}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-4 border-b border-[#F0F4F0] pb-2"
            >
              <span className="text-[12px] font-medium text-[#7A8E7A]">{label}</span>
              <span className="text-right text-[13px] font-semibold text-[#1A2B1A]">{value}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3 text-center">
            <p className="text-[20px] font-bold text-[#1B4D2E]">{record.log_count ?? 0}</p>
            <p className="text-[11px] text-[#7A8E7A]">Activity Log(s)</p>
          </div>
          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3 text-center">
            <p className="text-[20px] font-bold text-[#1B4D2E]">{record.disaster_report_count ?? 0}</p>
            <p className="text-[11px] text-[#7A8E7A]">Disaster Report(s)</p>
          </div>
          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3 text-center">
            <p className="text-[20px] font-bold text-[#1B4D2E]">{record.harvest_count ?? 0}</p>
            <p className="text-[11px] text-[#7A8E7A]">Harvest Record(s)</p>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── Delete Modal (Trash, type-DELETE, admin only) ────────────────────────────

function DeleteCropModal({ record, onClose, onDeleted }) {
  const { showToast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await api.delete(`/production/monitoring/${record.id}/`);
      showToast("Crop record deleted.", "success");
      onDeleted();
    } catch (err) {
      showToast(err?.response?.data?.detail || "Failed to delete crop record.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  const details = `${record.log_count ?? 0} activity log(s), ${record.disaster_report_count ?? 0} disaster report(s), ${record.harvest_count ?? 0} harvest record(s).`;

  return (
    <ConfirmDialog
      title={`Delete ${record.crop_type_name}?`}
      message="This action cannot be undone."
      details={details}
      confirmLabel={isDeleting ? "Deleting…" : "Delete Record"}
      requireTypedConfirmation
      typedConfirmationText="DELETE"
      variant="danger"
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}

// ─── Row Actions: View Details / Edit / Remarks / Delete ──────────────────────
// Action-count rule (Batch B): Admin sees up to 4 (always ⋮); Evaluator sees
// up to 3, but only 2 (View Details + Remarks) once the record is Harvested —
// RowActions renders plain icons for that case instead of a pointless ⋮.

function CropRowActionsMenu({ rec, isAdmin, onViewDetails, onEdit, onRemarks, onDelete }) {
  const canEdit = rec.status !== "Harvested";

  const actions = [
    { key: 'view', label: 'View Details', icon: Eye, onClick: onViewDetails },
    canEdit && { key: 'edit', label: 'Edit', icon: Pencil, onClick: onEdit },
    { key: 'remarks', label: 'View/Add Remarks', icon: FileText, onClick: onRemarks },
    isAdmin && { key: 'delete', label: 'Delete', icon: Trash2, onClick: onDelete, tone: 'rose' },
  ];

  return <RowActions actions={actions} menuWidthClassName="w-48" />;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CropInformationPage() {
  const { isAdmin } = useAuth();
  const [records, setRecords] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [seasonFilter, setSeasonFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [remarksRec, setRemarksRec] = useState(null);
  const [editingRec, setEditingRec] = useState(null);
  const [viewingRec, setViewingRec] = useState(null);
  const [deletingRec, setDeletingRec] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const fetchRecords = useCallback(
    async (pageNum = 1) => {
      setIsLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: pageNum });
        if (seasonFilter) params.set("season", seasonFilter);
        if (yearFilter) params.set("year", yearFilter);
        // "Near Harvest" is partly client-derived (see getDisplayStatus) from
        // records still stored as "Planted" whose expected_harvest_date has
        // crept close — don't filter it server-side or those go missing.
        if (statusFilter && statusFilter !== "All Status" && statusFilter !== "Near Harvest") {
          params.set("status", statusFilter);
        }
        const r = await api.get(`/production/monitoring/?${params.toString()}`);
        setRecords(Array.isArray(r.data) ? r.data : r.data.results || []);
        setTotalCount(typeof r.data?.count === "number" ? r.data.count : 0);
      } catch {
        setError("Failed to load crop records.");
      } finally {
        setIsLoading(false);
      }
    },
    [seasonFilter, yearFilter, statusFilter],
  );

  useEffect(() => {
    setPage(1);
    fetchRecords(1);
  }, [seasonFilter, yearFilter, statusFilter]);

  useEffect(() => {
    fetchRecords(page);
  }, [fetchRecords, page]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter((rec) => {
      const matchSearch =
        !q ||
        rec.crop_type_name?.toLowerCase().includes(q) ||
        rec.organization_name?.toLowerCase().includes(q);
      const displayStatus = getDisplayStatus(rec);
      const matchStatus =
        statusFilter === "All Status" || displayStatus === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [records, search, statusFilter]);

  const rows = filtered.map((rec) => {
    const displayStatus = getDisplayStatus(rec);
    return {
      ...rec,
      area_ha_fmt: rec.area_planted_ha
        ? Number(rec.area_planted_ha).toFixed(2)
        : "—",
      date_planted_fmt: fmtShort(rec.date_planted),
      expected_harvest_fmt: fmtShort(rec.expected_harvest_date),
      est_yield_fmt:
        rec.status === "Harvested" && rec.actual_yield_kg ? (
          <span className="text-slate-400">
            {Number(rec.actual_yield_kg).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        ) : rec.estimated_yield_kg ? (
          Number(rec.estimated_yield_kg).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        ) : (
          "—"
        ),
      assoc_name: rec.organization_name || "—",
      status_cell: (
        <span className="flex items-center gap-1.5">
          <StatusPill tone={STATUS_TONES[displayStatus] || "slate"}>
            {displayStatus}
          </StatusPill>
          {rec.disasters_count > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
              <AlertTriangle className="w-2.5 h-2.5" /> {rec.disasters_count > 1 ? rec.disasters_count : "Disaster"}
            </span>
          )}
          {rec.disasters_count === 0 && rec.has_recovered_disaster && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
              <CheckCircle2 className="w-2.5 h-2.5" /> Recovered
            </span>
          )}
          <HarvestVarianceBadge days={rec.harvest_variance_days} />
        </span>
      ),
      actions_cell: (
        <CropRowActionsMenu
          rec={rec}
          isAdmin={isAdmin}
          onViewDetails={() => setViewingRec(rec)}
          onEdit={() => setEditingRec(rec)}
          onRemarks={() => setRemarksRec(rec)}
          onDelete={() => setDeletingRec(rec)}
        />
      ),
    };
  });

  return (
    <PageLayout
      title="Crop Information Management"
      subtitle="Monitor and manage crop records and activities."
      action={
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors"
          onClick={() => setShowAdd(true)}
        >
          <Plus size={15} /> Add Crop
        </button>
      }
    >
      <div className="space-y-4">
        <FilterPanel
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by crop, organization..."
          activeCount={[statusFilter !== 'All Status', Boolean(seasonFilter), Boolean(yearFilter)].filter(Boolean).length}
        >
          <select className={filterSelectCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTER_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select className={filterSelectCls} value={seasonFilter} onChange={(e) => setSeasonFilter(e.target.value)}>
            <option value="">All Seasons</option>
            <option value="Dry">Dry Season</option>
            <option value="Wet">Wet Season</option>
          </select>
          <select className={filterSelectCls} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            <option value="">All Years</option>
            {Array.from(
              { length: 8 },
              (_, i) => new Date().getFullYear() + 1 - i,
            ).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </FilterPanel>

        {error && <ErrorMessage message={error} />}

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1B4D2E] text-white">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="whitespace-nowrap px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em]"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr
                    key={i}
                    className="border-b border-[#F0F4F0] animate-pulse"
                  >
                    {COLUMNS.map((col) => (
                      <td key={col.key} className="px-4 py-[13px]">
                        <div className="h-4 bg-[#E8EEE8] rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-[#C8D5C8]">
                      <svg
                        width="48"
                        height="48"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        viewBox="0 0 24 24"
                      >
                        <path d="M9 17H7A5 5 0 0 1 7 7h2" />
                        <path d="M15 7h2a5 5 0 0 1 0 10h-2" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                      <p className="text-[14px] font-medium text-[#4A5E4A]">
                        No crop records found
                      </p>
                      <p className="text-[13px] text-[#7A8E7A]">
                        Try adjusting your search or filters
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#F0F4F0] transition-colors hover:bg-[#F9FAF9]"
                  >
                    {COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className="whitespace-nowrap px-4 py-[13px] text-[13px] text-[#1A2B1A] align-middle"
                      >
                        {row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={page}
          totalCount={totalCount}
          pageSize={10}
          onPageChange={(p) => {
            setPage(p);
          }}
        />
      </div>

      {showAdd && (
        <AddCropMonitoringModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            setPage(1);
            fetchRecords(1);
          }}
        />
      )}

      {remarksRec && (
        <RemarksModal record={remarksRec} onClose={() => setRemarksRec(null)} />
      )}

      {editingRec && (
        <EditCropModal
          record={editingRec}
          onClose={() => setEditingRec(null)}
          onSaved={() => {
            setEditingRec(null);
            fetchRecords();
          }}
        />
      )}

      {viewingRec && (
        <CropDetailModal record={viewingRec} onClose={() => setViewingRec(null)} />
      )}

      {deletingRec && (
        <DeleteCropModal
          record={deletingRec}
          onClose={() => setDeletingRec(null)}
          onDeleted={() => {
            setDeletingRec(null);
            fetchRecords(page);
          }}
        />
      )}
    </PageLayout>
  );
}
