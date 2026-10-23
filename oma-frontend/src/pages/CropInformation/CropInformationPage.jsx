import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useIsPhone from '../../hooks/useIsPhone.js';
import useDebouncedValue from "../../hooks/useDebouncedValue.js";
import {
  ChevronDown,
  Eye,
  FileText,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import BarangaySelect from "../../components/UI/BarangaySelect.jsx";
import ComboboxWithOther from "../../components/UI/ComboboxWithOther.jsx";
import api from "../../api/axiosInstance.js";
import PageLayout from "../../components/Layout/PageLayout.jsx";
import AddButton from "../../components/UI/AddButton.jsx";
import RowActions from "../../components/UI/RowActions.jsx";
import ConfirmDialog from "../../components/UI/ConfirmDialog.jsx";
import ErrorMessage from "../../components/UI/ErrorMessage.jsx";
import FilterPanel from "../../components/UI/FilterPanel.jsx";
import HarvestVarianceBadge from "../../components/UI/HarvestVarianceBadge.jsx";
import FormField, { baseInputClasses } from "../../components/UI/FormField.jsx";
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import ModalShell from "../../components/UI/ModalShell.jsx";
import PaginationBar from "../../components/UI/PaginationBar.jsx";
import StatusPill from "../../components/UI/StatusPill.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import PcicInsuranceField from "../../components/UI/PcicInsuranceField.jsx";
import PcicBadge from "../../components/UI/PcicBadge.jsx";
import { pcicError, pcicPayload, pcicStateFrom, uploadPcicForm } from "../../utils/pcic.js";
import { ARINGAY_BARANGAYS } from "../../constants/barangays.js";
import { addCropState, cropCountLabel, directoryParams, noParcelParams, parcelLabel, recordActionKeys } from "./parcelRecords.js";

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

// Recomputes against expected_harvest_date for BOTH raw "Planted" and raw
// "Near Harvest" records (not just Planted) — either one can go stale if
// nobody ever records a real harvest, and daysLeft has no lower bound: a
// record thousands of days overdue used to read identically to one due
// tomorrow (both satisfied `daysLeft <= 7`). Overdue is its own distinct
// display state so a genuinely-forgotten record doesn't misreport as
// "about to be harvested."
function getDisplayStatus(rec) {
  if (rec.status === "Total Loss") return "Total Loss";
  if (rec.status === "Harvested") return "Harvested";
  if (rec.expected_harvest_date) {
    const today = new Date();
    const harvest = new Date(rec.expected_harvest_date + "T00:00:00");
    const daysLeft = Math.ceil((harvest - today) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return "Overdue";
    if (daysLeft <= 7) return "Near Harvest";
  }
  if (rec.status === "Near Harvest") return "Near Harvest";
  return "Planted";
}

const STATUS_TONES = {
  Planted: "green",
  "Near Harvest": "amber",
  // Matches this system's established convention (see components/UI/
  // StatusPill.jsx's own STATUS_MAP: OVERDUE already maps to rose there).
  Overdue: "rose",
  Harvested: "blue",
  "Total Loss": "rose",
};

const filterSelectCls =
  "rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none";

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
      <ModalShell
        title="Add Remark"
        onClose={onClose}
        maxWidth="max-w-sm"
        footer={
          <>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#4A5E4A] border border-[#C8D5C8] hover:bg-[#F5F7F5] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-remark-form"
              disabled={isSubmitting || !content.trim()}
              className="flex items-center gap-2 rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] disabled:opacity-60 transition-colors"
            >
              {isSubmitting && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              Save Remark
            </button>
          </>
        }
      >
        <form id="add-remark-form" onSubmit={handleSubmit} className="space-y-4">
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
        </form>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog variant="primary"
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
                { label: "PCIC Insurance", value: <PcicBadge insured={record.has_pcic_insurance} url={record.pcic_form_photo} none="No" /> },
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
  const [pcic, setPcic] = useState(() => pcicStateFrom(record));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const normalize = (v) =>
    v === null || v === undefined ? "" : String(v).trim();
  const isDirty =
    Object.keys(originalData).some(
      (k) => normalize(form[k]) !== normalize(originalData[k]),
    ) || selectedFarmer.farmer_id !== (record.farmer || null)
    || pcic.insured !== !!record.has_pcic_insurance || !!pcic.file;

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
    const pcicProblem = pcicError(pcic);
    if (pcicProblem) {
      setError(pcicProblem);
      return;
    }
    setFieldErrors({});
    setError("");
    setIsSubmitting(true);
    try {
      await api.patch(`/production/monitoring/${record.id}/`, {
        ...pcicPayload(pcic),
        farmer: selectedFarmer.farmer_id,
        farmers_organization: selectedFarmer.farmer_assoc_id || null,
        farm_location_barangay: form.farm_location_barangay,
        land_status: form.land_status,
        land_status_other_specify: form.land_status === "Other" ? form.land_status_other_specify : "",
        date_planted: form.date_planted,
        date_planted_is_estimated: false,
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
      try {
        await uploadPcicForm(api, "planting", record.id, pcic);
      } catch {
        showToast("The record was saved, but the PCIC form photo could not be uploaded. Try again.", "error");
      }
      showToast("Crop record updated successfully.", "success");
      onSaved();
    } catch (err) {
      // Show the server's reason (for example the active-duplicate refusal) instead of a generic failure.
      const data = err?.response?.data;
      const reason = data?.crop_type?.[0] || data?.detail;
      setError(typeof reason === "string" && reason ? reason : "Failed to update crop record.");
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
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-crop-record-form"
            disabled={isSubmitting || !isDirty}
            className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-50"
          >
            {isSubmitting ? "Saving…" : "Save Changes"}
          </button>
        </>
      }
    >
      <form id="edit-crop-record-form" onSubmit={handleSubmit} className="space-y-4">
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
            <ComboboxWithOther
              options={["Owner", "Lessee", "Tenant"]}
              value={form.land_status}
              otherValue={form.land_status_other_specify}
              onChange={(v) => set("land_status", v)}
              onOtherChange={(v) => set("land_status_other_specify", v)}
              placeholder="Select…"
              required
              error={fieldErrors.land_status}
            />
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
            <DecimalInput
              decimals={2}
              className={baseInputClasses}
              placeholder="e.g. 2.50"
              value={form.area_planted_ha}
              onChange={(v) => set("area_planted_ha", v)}
            />
            {record.date_planted_is_estimated && (
              <p className="mt-1.5 text-[11px] text-amber-700">
                This date is an estimate imported from a registry record. Saving this form
                confirms it as the real planting date and unblocks Record Harvest for this crop.
              </p>
            )}
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
          <ComboboxWithOther
            options={["Own Seeds", "DA/LGU Provided", "Commercial", "Organization"]}
            value={form.seed_source}
            otherValue={form.seed_source_other_specify}
            onChange={(v) => set("seed_source", v)}
            onOtherChange={(v) => set("seed_source_other_specify", v)}
            placeholder="Select…"
          />
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

        <PcicInsuranceField value={pcic} onChange={setPcic} subject="planting" />

        {error && (
          <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">
            {error}
          </p>
        )}

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
    ["PCIC Insurance", <PcicBadge key="pcic" insured={record.has_pcic_insurance} url={record.pcic_form_photo} none="No" />],
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

// ─── A crop's row menu: View Details / Edit / Remarks (records are not deleted from this page) ───────────────────────

const ROW_ACTIONS = {
  view: { label: 'View Details', icon: Eye },
  edit: { label: 'Edit', icon: Pencil },
  remarks: { label: 'View/Add Remarks', icon: FileText },
};

function CropRowActionsMenu({ rec, handlers }) {
  const actions = recordActionKeys(rec).map((key) => ({ key, ...ROW_ACTIONS[key], onClick: () => handlers[key](rec) }));
  return <RowActions actions={actions} menuWidthClassName="w-48" />;
}

// ─── The crop records on one parcel (or on no parcel at all), loaded when its row is opened ──────────────────────────

// `params` are the extra filters for the crop list; the parcel itself is `farm_parcel`. A crop edited elsewhere on the page
// bumps `version`, which loads the list again.
function useParcelCrops(parcelId, search, barangay, version) {
  const [state, setState] = useState({ key: "", items: [], count: 0, page: 0, failed: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const key = JSON.stringify([parcelId, search, barangay, version]);

  const request = useCallback(
    (page) => {
      const params = parcelId === "none" ? noParcelParams({ search, barangay }) : { farm_parcel: parcelId };
      return api.get("/production/monitoring/", { params: { ...params, page } });
    },
    [parcelId, search, barangay],
  );

  useEffect(() => {
    let alive = true;
    request(1)
      .then((r) => {
        if (!alive) return;
        const items = Array.isArray(r.data) ? r.data : r.data.results || [];
        setState({ key, items, count: typeof r.data?.count === "number" ? r.data.count : items.length, page: 1, failed: false });
      })
      .catch(() => alive && setState({ key, items: [], count: 0, page: 1, failed: true }));
    return () => {
      alive = false;
    };
  }, [key, request]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await request(state.page + 1);
      const items = Array.isArray(r.data) ? r.data : r.data.results || [];
      setState((s) => ({ ...s, items: [...s.items, ...items], page: s.page + 1 }));
    } catch {
      setState((s) => ({ ...s, failed: true }));
    } finally {
      setLoadingMore(false);
    }
  };

  return { ...state, isLoading: state.key !== key, loadingMore, loadMore };
}

const CROP_COLUMNS = ["Crop", "Variety", "Season", "Date planted", "Est. harvest", "Area (ha)", "Status", ""];

function cropCells(rec) {
  const status = getDisplayStatus(rec);
  return {
    crop: rec.crop_type_name,
    variety: rec.variety_used || "—",
    season: [rec.season, rec.year].filter(Boolean).join(" ") || "—",
    planted: fmtShort(rec.date_planted),
    harvest: fmtShort(rec.expected_harvest_date),
    area: rec.area_planted_ha ? Number(rec.area_planted_ha).toFixed(2) : "—",
    status: (
      <span className="flex items-center gap-1.5">
        <StatusPill tone={STATUS_TONES[status] || "slate"}>{status}</StatusPill>
        <HarvestVarianceBadge days={rec.harvest_variance_days} />
      </span>
    ),
  };
}

function ParcelCrops({ parcelId, search, barangay, version, isPhone, handlers, emptyText }) {
  const { items, count, isLoading, failed, loadingMore, loadMore } = useParcelCrops(parcelId, search, barangay, version);

  if (isLoading) return <p className="px-4 py-4 text-[13px] italic text-[#7A8E7A]">Loading crop records…</p>;
  if (failed) return <p className="px-4 py-4 text-[13px] text-rose-700">Failed to load the crop records for this parcel.</p>;
  if (items.length === 0) return <p className="px-4 py-4 text-[13px] italic text-[#7A8E7A]">{emptyText}</p>;

  return (
    <div className="px-3 pb-3 pt-1 sm:px-4">
      {isPhone ? (
        <ul className="space-y-2">
          {items.map((rec) => {
            const c = cropCells(rec);
            return (
              <li key={rec.id} className="rounded-lg border border-[#E2E8E2] bg-white p-3">
                <div className="flex flex-col gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-[#1A2B1A]">{c.crop}</p>
                    <p className="text-[12px] text-[#7A8E7A]">{[c.variety !== "—" && c.variety, c.season !== "—" && c.season].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <CropRowActionsMenu rec={rec} handlers={handlers} />
                </div>
                <div className="mt-2">{c.status}</div>
                <p className="mt-2 text-[12px] text-[#4A5E4A]">
                  Planted {c.planted} · Est. harvest {c.harvest} · {c.area} ha
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#E2E8E2] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[#F0F4F0] text-[#4A5E4A]">
              <tr>
                {CROP_COLUMNS.map((label) => (
                  <th key={label || "actions"} className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em]">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((rec) => {
                const c = cropCells(rec);
                return (
                  <tr key={rec.id} className="border-t border-[#F0F4F0]">
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-medium text-[#1A2B1A]">{c.crop}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{c.variety}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{c.season}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{c.planted}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{c.harvest}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{c.area}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{c.status}</td>
                    <td className="px-3 py-2.5 text-right">
                      <CropRowActionsMenu rec={rec} handlers={handlers} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {items.length < count && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-[#7A8E7A]">
          <span>
            Showing {items.length} of {count}
          </span>
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="min-h-[36px] rounded-lg border border-[#E2E8E2] px-3 font-medium text-[#1B4D2E] hover:bg-[#F0F4F0] disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── One parcel: its details, "Add crop records", and (when opened) the crops on it ──────────────────────────────────

function AddCropButton({ parcel, onAdd }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(parcel)}
      className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1B4D2E] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#235E38] max-md:min-h-[44px]"
    >
      <Plus size={14} aria-hidden="true" /> Add crop records
    </button>
  );
}

function ParcelRow({ parcel, open, onToggle, onAdd, isPhone, ...cropProps }) {
  const panelId = `parcel-crops-${parcel.id}`;
  const title = parcelLabel(parcel);

  const toggle = (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={`${open ? "Hide" : "Show"} the crops on ${title}`}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#4A5E4A] hover:bg-[#E8EEE8] max-md:h-10 max-md:w-10"
    >
      <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : "-rotate-90"}`} aria-hidden="true" />
    </button>
  );

  if (isPhone) {
    return (
      <li className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-start gap-2 p-3">
          {toggle}
          <div className="min-w-0 flex-1">
            <p className="break-words text-[14px] font-semibold text-[#1A2B1A]">{title}</p>
            <p className="text-[13px] text-[#4A5E4A]">
              {parcel.farmer_name} · {parcel.barangay}
            </p>
            <p className="text-[12px] text-[#7A8E7A]">
              {Number(parcel.area_hectares).toFixed(2)} ha · {parcel.land_ownership} · {cropCountLabel(parcel.crop_count)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AddCropButton parcel={parcel} onAdd={onAdd} />
            </div>
          </div>
        </div>
        {open && (
          <div id={panelId} className="border-t border-[#F0F4F0] bg-[#F9FAF9]">
            <ParcelCrops parcelId={parcel.id} isPhone emptyText="No crop records on this parcel yet." {...cropProps} />
          </div>
        )}
      </li>
    );
  }

  return (
    <>
      <tr className={`border-b border-[#F0F4F0] transition-colors hover:bg-[#F9FAF9] ${open ? "bg-[#F9FAF9]" : ""}`}>
        <td className="w-12 px-2 py-2.5">{toggle}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] font-medium text-[#1A2B1A]">{title}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#1A2B1A]">
          <p className="font-medium">{parcel.farmer_name}</p>
          <p className="text-[11.5px] text-[#7A8E7A]">{parcel.rsbsa_number}</p>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{parcel.barangay}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{Number(parcel.area_hectares).toFixed(2)}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{parcel.land_ownership}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[#4A5E4A]">{cropCountLabel(parcel.crop_count)}</td>
        <td className="whitespace-nowrap px-3 py-2.5 text-right">
          <AddCropButton parcel={parcel} onAdd={onAdd} />
        </td>
      </tr>
      {open && (
        <tr id={panelId} className="border-b border-[#F0F4F0] bg-[#F9FAF9]">
          <td colSpan={PARCEL_COLUMNS.length + 1} className="p-0">
            <ParcelCrops parcelId={parcel.id} isPhone={false} emptyText="No crop records on this parcel yet." {...cropProps} />
          </td>
        </tr>
      )}
    </>
  );
}

const PARCEL_COLUMNS = ["Parcel", "Farmer", "Barangay", "Area (ha)", "Ownership", "Crops", "Actions"];

// ─── The crops with no parcel on file (older records and organization crops) ─────────────────────────────────────────

function NoParcelGroup({ search, barangay, version, isPhone, handlers }) {
  const [open, setOpen] = useState(false);
  // Only the count is needed until it is opened; the list loads itself then.
  const [count, setCount] = useState({ key: "", value: 0 });
  const key = JSON.stringify([search, barangay, version]);

  useEffect(() => {
    let alive = true;
    api
      .get("/production/monitoring/", { params: { ...noParcelParams({ search, barangay }), page: 1 } })
      .then((r) => alive && setCount({ key, value: typeof r.data?.count === "number" ? r.data.count : (r.data?.length ?? 0) }))
      .catch(() => alive && setCount({ key, value: 0 }));
    return () => {
      alive = false;
    };
  }, [key, search, barangay]);

  if (count.key !== key || count.value === 0) return null;

  return (
    <section className="rounded-xl border border-dashed border-[#C8D5C8] bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ChevronDown size={16} className={`shrink-0 text-[#4A5E4A] transition-transform ${open ? "rotate-180" : "-rotate-90"}`} aria-hidden="true" />
        <span className="text-[14px] font-semibold text-[#1A2B1A]">No farm parcel on file</span>
        <span className="text-[13px] text-[#7A8E7A]">
          {count.value} crop record{count.value === 1 ? "" : "s"} · older records and organization crops
        </span>
      </button>
      {open && (
        <div className="border-t border-[#F0F4F0] bg-[#F9FAF9]">
          <ParcelCrops parcelId="none" search={search} barangay={barangay} version={version} isPhone={isPhone} handlers={handlers} emptyText="No crop records." />
        </div>
      )}
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CropInformationPage() {
  const isPhone = useIsPhone();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [barangay, setBarangay] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [openIds, setOpenIds] = useState([]);
  const [remarksRec, setRemarksRec] = useState(null);
  const [editingRec, setEditingRec] = useState(null);
  const [viewingRec, setViewingRec] = useState(null);

  // Server-side search over every parcel (farmer, RSBSA, parcel number) — debounced, so a slower earlier answer can never
  // replace the one for what is typed now (the answer is stored with the request it belongs to).
  const debouncedSearch = useDebouncedValue(search.trim());
  const requestKey = JSON.stringify([debouncedSearch, barangay, page, version]);
  const [result, setResult] = useState({ key: "", rows: [], count: 0, failed: false });

  useEffect(() => {
    let alive = true;
    api
      .get("/farmers/parcels/directory/", { params: directoryParams({ search: debouncedSearch, barangay, page }) })
      .then((r) => {
        if (!alive) return;
        const rows = Array.isArray(r.data) ? r.data : r.data.results || [];
        setResult({ key: requestKey, rows, count: typeof r.data?.count === "number" ? r.data.count : rows.length, failed: false });
      })
      .catch(() => alive && setResult({ key: requestKey, rows: [], count: 0, failed: true }));
    return () => {
      alive = false;
    };
  }, [requestKey, debouncedSearch, barangay, page]);

  const isLoading = result.key !== requestKey;
  const refresh = () => setVersion((v) => v + 1);
  const toggle = (id) => setOpenIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const addCrops = (parcel) => navigate("/crop-records/add", { state: addCropState(parcel) });
  const handlers = { view: setViewingRec, edit: setEditingRec, remarks: setRemarksRec };
  const changeFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const cropProps = { search: debouncedSearch, barangay, version, handlers };
  // Parcel crop lists are not filtered by the typed search (the search chose the parcels); only the no-parcel group is.
  const parcelCropProps = { search: "", barangay: "", version, handlers };

  return (
    <PageLayout title="Crop Records" subtitle="Farm parcels and the crops grown on them. Open a parcel to see its crops.">
      <div className="space-y-4">
        <FilterPanel
          search={search}
          onSearchChange={changeFilter(setSearch)}
          searchPlaceholder="Search by farmer, RSBSA, or parcel number..."
          activeCount={[Boolean(barangay)].filter(Boolean).length}
          actions={<AddButton onClick={() => navigate("/crop-records/add-parcels")}>Add Farm Parcel</AddButton>}
        >
          <select className={filterSelectCls} value={barangay} onChange={(e) => changeFilter(setBarangay)(e.target.value)} aria-label="Barangay">
            <option value="">All Barangays</option>
            {ARINGAY_BARANGAYS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </FilterPanel>

        {result.failed && !isLoading && <ErrorMessage message="Failed to load farm parcels." />}

        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl border border-[#E2E8E2] bg-[#E8EEE8]/60" />
            ))}
          </div>
        ) : result.rows.length === 0 ? (
          <div className="rounded-xl border border-[#E2E8E2] bg-white py-12 text-center">
            <p className="text-[14px] font-medium text-[#4A5E4A]">No farm parcels found</p>
            <p className="text-[13px] text-[#7A8E7A]">Try adjusting your search or filters. A farm parcel is added from the farmer&apos;s profile.</p>
          </div>
        ) : isPhone ? (
          <ul className="space-y-2">
            {result.rows.map((parcel) => (
              <ParcelRow key={parcel.id} parcel={parcel} open={openIds.includes(parcel.id)} onToggle={() => toggle(parcel.id)} onAdd={addCrops} isPhone {...parcelCropProps} />
            ))}
          </ul>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[#1B4D2E] text-white">
                <tr>
                  <th className="w-12 px-2 py-[11px]">
                    <span className="sr-only">Open</span>
                  </th>
                  {PARCEL_COLUMNS.map((label) => (
                    <th key={label} className="whitespace-nowrap px-3 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em]">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((parcel) => (
                  <ParcelRow key={parcel.id} parcel={parcel} open={openIds.includes(parcel.id)} onToggle={() => toggle(parcel.id)} onAdd={addCrops} isPhone={false} {...parcelCropProps} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <PaginationBar page={page} totalCount={result.count} pageSize={10} onPageChange={setPage} />

        <NoParcelGroup {...cropProps} isPhone={isPhone} />
      </div>

      {remarksRec && <RemarksModal record={remarksRec} onClose={() => setRemarksRec(null)} />}

      {editingRec && (
        <EditCropModal
          record={editingRec}
          onClose={() => setEditingRec(null)}
          onSaved={() => {
            setEditingRec(null);
            refresh();
          }}
        />
      )}

      {viewingRec && <CropDetailModal record={viewingRec} onClose={() => setViewingRec(null)} />}
    </PageLayout>
  );
}
