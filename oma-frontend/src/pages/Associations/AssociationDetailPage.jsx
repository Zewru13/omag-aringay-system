import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import api from "../../api/axiosInstance.js";
import PageLayout from "../../components/Layout/PageLayout.jsx";
import Button from "../../components/UI/Button.jsx";
import StatusPill from "../../components/UI/StatusPill.jsx";
import Tabs from "../../components/UI/Tabs.jsx";
import ModalShell from "../../components/UI/ModalShell.jsx";
import ConfirmDialog from "../../components/UI/ConfirmDialog.jsx";
import { baseInputClasses } from "../../components/UI/FormField.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

const labelCls = "block text-[13px] font-medium text-[#4A5E4A] mb-1.5";

const POSITIONS = [
  "President",
  "Chairperson",
  "Vice President",
  "Vice Chairperson",
  "Secretary",
  "Treasurer",
  "Auditor",
  "Board Member",
  "Manager",
  "Member",
];

const FARMERS_EQUIPMENT = [
  "Hand Tractor",
  "Four-Wheel Tractor",
  "Rice Thresher",
  "Corn Sheller",
  "Water Pump/Irrigation Pump",
  "Knapsack Sprayer",
  "Power Sprayer",
  "Rice Mill",
  "Dryer",
  "Storage Facility",
  "Post-Harvest Equipment",
  "Farm Tools (Shovel, Hoe, etc.)",
  "Harvesting Equipment",
  "Seedling Tray",
  "Greenhouse/Net House",
  "Generator",
  "Other",
];

const FISHERFOLK_EQUIPMENT = [
  "Fishing Boat/Banca",
  "Motorized Banca",
  "Outboard Motor",
  "Fish Cage",
  "Fish Net (Gill Net)",
  "Fish Net (Cast Net)",
  "Fish Net (Trawl Net)",
  "Fishing Lines and Hooks",
  "Fish Pond/Tank",
  "Aerator/Air Pump",
  "Water Pump",
  "Life Vest/Safety Gear",
  "Ice Box/Cooler",
  "Fish Weighing Scale",
  "GPS/Navigation Equipment",
  "Feeding Equipment",
  "Harvesting Net",
  "Generator",
  "Other",
];

const CONDITIONS = ["Good", "Needs Repair", "Not Operational"];

function positionTone(pos) {
  if (pos === "President") return "navy";
  if (pos === "Chairperson" || pos === "Vice Chairperson") return "green";
  if (["Vice President", "Secretary", "Treasurer", "Auditor"].includes(pos)) return "blue";
  if (["Board Member", "Manager"].includes(pos)) return "amber";
  return "slate";
}

function conditionTone(cond) {
  if (cond === "Good") return "green";
  if (cond === "Needs Repair") return "amber";
  return "rose";
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────

function AddMemberModal({ type, associationId, onClose, onSuccess }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [position, setPosition] = useState("Member");
  const [dateJoined, setDateJoined] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const searchEndpoint = type === "farmers" ? "/farmers/" : "/fisheries/";
  const memberKey = type === "farmers" ? "farmer" : "fisherfolk";
  const idLabel =
    type === "farmers" ? "rsbsa_number" : "lgu_registration_number";
  const idDisplayLabel = type === "farmers" ? "RSBSA No." : "LGU No.";

  const handleSearch = async () => {
    if (!search.trim()) return;
    setIsSearching(true);
    setResults([]);
    setSelected(null);
    try {
      const response = await api.get(
        `${searchEndpoint}?search=${encodeURIComponent(search)}`,
      );
      setResults(Array.isArray(response.data) ? response.data : []);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selected) {
      setError("Please search for and select a member first.");
      return;
    }
    if (!dateJoined) {
      setError("Date joined is required.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await api.post(`/associations/${type}/${associationId}/members/`, {
        [memberKey]: selected.id,
        position,
        date_joined: dateJoined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      const data = err.response?.data;
      setError(data?.detail || "Unable to add member.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell title="Add Member" onClose={onClose}>
      <form className="space-y-5" onSubmit={handleSubmit}>
        {/* Search */}
        <div>
          <label className={labelCls}>
            Search {type === "farmers" ? "Farmer" : "Fisherfolk"}
          </label>
          <div className="mt-1 flex gap-2">
            <input
              className={`${baseInputClasses} flex-1`}
              placeholder="Name or ID number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.preventDefault(), handleSearch())
              }
            />
            <Button
              onClick={handleSearch}
              size="sm"
              type="button"
              variant="outline"
            >
              Search
            </Button>
          </div>
        </div>

        {/* Results */}
        {isSearching && (
          <p className="text-[13px] text-[#7A8E7A]">Searching...</p>
        )}

        {!isSearching && results.length > 0 && (
          <div className="max-h-48 overflow-y-auto rounded-xl border border-[#E2E8E2]">
            {results.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className={`w-full rounded-lg p-2 text-left text-[13px] transition-colors ${
                  selected?.id === item.id
                    ? "bg-[#EBF5EE] font-semibold text-[#1B4D2E]"
                    : "hover:bg-[#F9FAF9]"
                }`}
              >
                <span className="font-medium text-[#1A2B1A]">
                  {item.full_name}
                </span>
                <span className="ml-2 text-[#7A8E7A]">
                  {idDisplayLabel}: {item[idLabel]}
                </span>
              </button>
            ))}
          </div>
        )}

        {!isSearching && results.length === 0 && search && (
          <p className="text-[13px] text-[#7A8E7A]">
            No results. Try a different name or ID.
          </p>
        )}

        {selected && (
          <p className="rounded-lg bg-[#EBF5EE] px-3 py-2 text-[13px] font-medium text-[#1B4D2E]">
            Selected: {selected.full_name} ({selected[idLabel]})
          </p>
        )}

        {/* Position */}
        <div>
          <label className={labelCls}>Position</label>
          <select
            className={`${baseInputClasses} mt-1`}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Date Joined */}
        <div>
          <label className={labelCls}>Date Joined</label>
          <input
            className={`${baseInputClasses} mt-1`}
            required
            type="date"
            value={dateJoined}
            max={new Date().toISOString().split('T')[0]}
            onChange={(e) => setDateJoined(e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-4">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">
            Add Member
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Add Equipment Modal ──────────────────────────────────────────────────────

function AddEquipmentModal({ type, associationId, onClose, onSuccess }) {
  const equipmentChoices =
    type === "farmers" ? FARMERS_EQUIPMENT : FISHERFOLK_EQUIPMENT;

  const [form, setForm] = useState({
    equipment_name: equipmentChoices[0],
    equipment_name_other: "",
    quantity: 1,
    condition: "Good",
    acquisition_date: "",
    remarks: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const payload = { ...form };
      if (!payload.acquisition_date) delete payload.acquisition_date;
      if (payload.equipment_name !== "Other")
        delete payload.equipment_name_other;
      await api.post(
        `/associations/${type}/${associationId}/equipment/`,
        payload,
      );
      onSuccess();
      onClose();
    } catch (err) {
      const data = err.response?.data;
      setError(data?.detail || "Unable to add equipment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell title="Add Equipment" onClose={onClose}>
      <form className="space-y-4" onSubmit={handleSubmit}>
        {/* Equipment Name */}
        <div>
          <label className={labelCls}>Equipment Name</label>
          <select
            className={`${baseInputClasses} mt-1`}
            value={form.equipment_name}
            onChange={(e) => updateField("equipment_name", e.target.value)}
          >
            {equipmentChoices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Specify if Other */}
        {form.equipment_name === "Other" && (
          <div>
            <label className={labelCls}>Specify Equipment</label>
            <input
              className={`${baseInputClasses} mt-1`}
              required
              value={form.equipment_name_other}
              onChange={(e) =>
                updateField("equipment_name_other", e.target.value)
              }
            />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Quantity */}
          <div>
            <label className={labelCls}>Quantity</label>
            <input
              className={`${baseInputClasses} mt-1`}
              min={1}
              required
              type="number"
              value={form.quantity}
              onChange={(e) => updateField("quantity", e.target.value)}
            />
          </div>

          {/* Condition */}
          <div>
            <label className={labelCls}>Condition</label>
            <select
              className={`${baseInputClasses} mt-1`}
              value={form.condition}
              onChange={(e) => updateField("condition", e.target.value)}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Acquisition Date */}
          <div>
            <label className={labelCls}>
              Acquisition Date{" "}
              <span className="font-normal text-[#7A8E7A] text-[12px]">(optional)</span>
            </label>
            <input
              className={`${baseInputClasses} mt-1`}
              type="date"
              value={form.acquisition_date}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => updateField("acquisition_date", e.target.value)}
            />
          </div>
        </div>

        {/* Remarks */}
        <div>
          <label className={labelCls}>
            Remarks{" "}
            <span className="font-normal text-[#7A8E7A] text-[12px]">(optional)</span>
          </label>
          <textarea
            className={`${baseInputClasses} mt-1 resize-none h-auto py-2`}
            rows={2}
            value={form.remarks}
            onChange={(e) => updateField("remarks", e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-4">
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">
            Add Equipment
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Field display ────────────────────────────────────────────────────────────

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[12px] text-[#7A8E7A] mb-0.5">{label}</p>
      <p className="text-[14px] font-medium text-[#1A2B1A]">{value || "—"}</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function AssociationDetailPage() {
  const { type, id } = useParams();
  const { isAdmin, isEvaluator } = useAuth();
  const { showToast } = useToast();

  const sectionTabs = type === "farmers"
    ? [{ value: "members", label: "Members" }]
    : [{ value: "members", label: "Members" }, { value: "equipment", label: "Equipment Inventory" }];

  const [association, setAssociation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("members");
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState(null);
  const [confirmRemoveEquipment, setConfirmRemoveEquipment] = useState(null);
  const [members, setMembers] = useState([]);

  const typeLabel = type === "farmers" ? "Farmers" : "Fisherfolk";
  const memberIdLabel = type === "farmers" ? "RSBSA Number" : "LGU Number";
  const memberIdField =
    type === "farmers" ? "farmer_rsbsa_number" : "fisherfolk_lgu_number";
  const memberNameField =
    type === "farmers" ? "farmer_full_name" : "fisherfolk_full_name";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await api.get(`/associations/${type}/${id}/`);
        if (!cancelled) setAssociation(response.data);
      } catch {
        if (!cancelled) setError("Unable to load association details.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [type, id, refreshKey]);

  useEffect(() => {
    if (type !== "farmers") return;
    api.get(`/farmers/?farmers_association=${id}`)
      .then(r => setMembers(r.data.results || r.data))
      .catch(console.error);
  }, [type, id, refreshKey]);

  const handleRemoveMember = async (memberId) => {
    try {
      await api.delete(`/associations/${type}/members/${memberId}/`);
      showToast("Member removed.", "success");
      setRefreshKey((k) => k + 1);
    } catch {
      showToast("Unable to remove member.", "error");
    } finally {
      setConfirmRemoveMember(null);
    }
  };

  const handleRemoveEquipment = async (equipId) => {
    try {
      await api.delete(`/associations/${type}/equipment/${equipId}/`);
      showToast("Equipment removed.", "success");
      setRefreshKey((k) => k + 1);
    } catch {
      showToast("Unable to remove equipment.", "error");
    } finally {
      setConfirmRemoveEquipment(null);
    }
  };

  const handleMemberAdded = () => setRefreshKey((k) => k + 1);
  const handleEquipmentAdded = () => setRefreshKey((k) => k + 1);

  return (
    <PageLayout
      title={`${typeLabel} Association Details`}
      subtitle="View members, equipment, and association information"
    >
      <div className="space-y-4">
        <Link
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#4A5E4A] hover:text-[#1A2B1A] transition-colors"
          to="/associations"
        >
          <ArrowLeft size={15} />
          Back to Associations
        </Link>

        {error && (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="flex min-h-56 items-center justify-center rounded-xl border border-[#E2E8E2] bg-white">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E2E8E2] border-t-[#1B4D2E]" />
          </div>
        )}

        {!isLoading && association && (
          <>
            {/* Association Info */}
            <div className="bg-white border border-[#E2E8E2] rounded-xl p-6">
              <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-[#F0F4F0] pb-4">
                <h1 className="text-[18px] font-semibold text-[#1A2B1A]">
                  {association.name}
                </h1>
                <StatusPill tone={association.is_active ? "green" : "slate"}>
                  {association.is_active ? "Active" : "Inactive"}
                </StatusPill>
              </div>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                <Field label="Barangay" value={association.barangay} />
                <Field
                  label="Registration Number"
                  value={association.registration_number}
                />
                <Field
                  label="Date Established"
                  value={formatDate(association.date_established)}
                />
                <Field
                  label="Contact Person"
                  value={association.contact_person}
                />
                <Field
                  label="Contact Number"
                  value={association.contact_number}
                />
                <Field
                  label="Date Created"
                  value={formatDate(association.date_created)}
                />
                {association.dole_registration_number != null && (
                  <Field
                    label="DOLE Registration No."
                    value={association.dole_registration_number || "—"}
                  />
                )}
                {association.bir_number != null && (
                  <Field
                    label="BIR Number"
                    value={association.bir_number || "—"}
                  />
                )}
              </div>
            </div>

            {/* Members & Equipment */}
            <div className="bg-white border border-[#E2E8E2] rounded-xl p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <Tabs
                  activeTab={activeSection}
                  tabs={sectionTabs}
                  onChange={setActiveSection}
                />
                {(isAdmin || isEvaluator) && type !== "farmers" &&
                  (activeSection === "members" ? (
                    <button
                      className="flex items-center gap-1.5 bg-[#1B4D2E] hover:bg-[#235E38] text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
                      onClick={() => setShowAddMember(true)}
                    >
                      <Plus size={15} />
                      Add Member
                    </button>
                  ) : (
                    <button
                      className="flex items-center gap-1.5 bg-[#1B4D2E] hover:bg-[#235E38] text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors"
                      onClick={() => setShowAddEquipment(true)}
                    >
                      <Plus size={15} />
                      Add Equipment
                    </button>
                  ))}
              </div>

              {/* Members tab — farmers (auto-populated from farmer profiles) */}
              {activeSection === "members" && type === "farmers" && (
                <div className="rounded-xl border border-[#E2E8E2] overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F4F0]">
                    <div>
                      <h3 className="text-[14px] font-semibold text-[#1A2B1A]">Association Members</h3>
                      <p className="text-[12px] text-[#7A8E7A] mt-0.5">Farmers registered under this association</p>
                    </div>
                    <span className="text-[12px] font-medium bg-[#EBF5EE] text-[#1B4D2E] px-2.5 py-1 rounded-full">
                      {members.length} members
                    </span>
                  </div>
                  {members.length === 0 ? (
                    <div className="text-center py-10 px-6">
                      <Users className="w-10 h-10 text-[#C8D5C8] mx-auto mb-2" />
                      <p className="text-[13px] text-[#7A8E7A]">No members yet</p>
                      <p className="text-[12px] text-[#7A8E7A] mt-1">
                        Farmers can be linked to this association through their profile registration or edit.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-[#1B4D2E]">
                            <th className="text-white text-[11px] font-semibold uppercase tracking-wider px-4 py-[11px] text-left">Name</th>
                            <th className="text-white text-[11px] font-semibold uppercase tracking-wider px-4 py-[11px] text-left">Barangay</th>
                            <th className="text-white text-[11px] font-semibold uppercase tracking-wider px-4 py-[11px] text-left">RSBSA No.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {members.map(m => (
                            <tr key={m.id} className="border-b border-[#F0F4F0] hover:bg-[#F9FAF9] transition-colors">
                              <td className="px-4 py-[13px] text-[13px] font-medium text-[#1A2B1A]">{m.full_name}</td>
                              <td className="px-4 py-[13px] text-[13px] text-[#4A5E4A]">{m.barangay}</td>
                              <td className="px-4 py-[13px] text-[13px] text-[#4A5E4A]">{m.rsbsa_number}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Members tab — fisherfolk (manual add/remove) */}
              {activeSection === "members" && type !== "farmers" &&
                (association.members.length === 0 ? (
                  <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">
                    No members recorded.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[#E2E8E2]">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left">
                        <thead>
                          <tr className="bg-[#1B4D2E]">
                            <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-white">Full Name</th>
                            <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-white">{memberIdLabel}</th>
                            <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-white">Position</th>
                            <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-white">Date Joined</th>
                            {(isAdmin || isEvaluator) && (
                              <th className="px-4 py-[11px]" />
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {association.members.map((m) => (
                            <tr key={m.id} className="border-b border-[#F0F4F0] hover:bg-[#F9FAF9] transition-colors">
                              <td className="px-4 py-[13px] text-[13px] font-medium text-[#1A2B1A]">
                                {m[memberNameField]}
                              </td>
                              <td className="px-4 py-[13px] text-[13px] text-[#4A5E4A]">
                                {m[memberIdField]}
                              </td>
                              <td className="px-4 py-[13px]">
                                <StatusPill tone={positionTone(m.position)}>
                                  {m.position}
                                </StatusPill>
                              </td>
                              <td className="px-4 py-[13px] text-[13px] text-[#4A5E4A]">
                                {formatDate(m.date_joined)}
                              </td>
                              {(isAdmin || isEvaluator) && (
                                <td className="px-4 py-[13px]">
                                  <Button
                                    className="!text-rose-600"
                                    icon={Trash2}
                                    onClick={() => setConfirmRemoveMember(m.id)}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                  >
                                    Remove
                                  </Button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

              {/* Equipment tab */}
              {activeSection === "equipment" &&
                (association.equipment.length === 0 ? (
                  <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">
                    No equipment recorded.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[#E2E8E2]">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left">
                        <thead>
                          <tr className="bg-[#1B4D2E]">
                            <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-white">Equipment</th>
                            <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-white">Qty</th>
                            <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-white">Condition</th>
                            <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-white">Acquired</th>
                            <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-white">Remarks</th>
                            {(isAdmin || isEvaluator) && (
                              <th className="px-4 py-[11px]" />
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {association.equipment.map((eq) => (
                            <tr key={eq.id} className="border-b border-[#F0F4F0] hover:bg-[#F9FAF9] transition-colors">
                              <td className="px-4 py-[13px] text-[13px] font-medium text-[#1A2B1A]">
                                {eq.equipment_name === "Other" &&
                                eq.equipment_name_other
                                  ? `Other — ${eq.equipment_name_other}`
                                  : eq.equipment_name}
                              </td>
                              <td className="px-4 py-[13px] text-[13px] text-[#4A5E4A]">
                                {eq.quantity}
                              </td>
                              <td className="px-4 py-[13px]">
                                <StatusPill tone={conditionTone(eq.condition)}>
                                  {eq.condition}
                                </StatusPill>
                              </td>
                              <td className="px-4 py-[13px] text-[13px] text-[#4A5E4A]">
                                {formatDate(eq.acquisition_date)}
                              </td>
                              <td className="px-4 py-[13px] text-[13px] text-[#4A5E4A]">
                                {eq.remarks || "—"}
                              </td>
                              {(isAdmin || isEvaluator) && (
                                <td className="px-4 py-[13px]">
                                  <Button
                                    className="!text-rose-600"
                                    icon={Trash2}
                                    onClick={() =>
                                      setConfirmRemoveEquipment(eq.id)
                                    }
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                  >
                                    Remove
                                  </Button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
            </div>

            {/* Officers Table (farmers associations only) */}
            {type === "farmers" && association.officers && association.officers.length > 0 && (
              <div className="mt-6 bg-white border border-[#E2E8E2] rounded-xl p-6">
                <h3 className="text-[14px] font-semibold text-[#1A2B1A] mb-4">Association Officers</h3>
                <div className="rounded-xl border border-[#E2E8E2] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#1B4D2E]">
                        <th className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white">Position</th>
                        <th className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white">Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {association.officers.map((officer) => (
                        <tr key={officer.id} className="border-t border-[#F0F4F0] hover:bg-[#F5F7F5]">
                          <td className="px-4 py-3 text-[12px] font-semibold text-[#4A5E4A]">{officer.position}</td>
                          <td className="px-4 py-3 text-[13px] text-[#1A2B1A]">{officer.full_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showAddMember && type !== "farmers" && (
        <AddMemberModal
          type={type}
          associationId={id}
          onClose={() => setShowAddMember(false)}
          onSuccess={handleMemberAdded}
        />
      )}

      {showAddEquipment && (
        <AddEquipmentModal
          type={type}
          associationId={id}
          onClose={() => setShowAddEquipment(false)}
          onSuccess={handleEquipmentAdded}
        />
      )}

      {confirmRemoveMember && (
        <ConfirmDialog
          title="Remove Member"
          message="Are you sure you want to remove this member from the association?"
          confirmLabel="Remove"
          danger
          onConfirm={() => handleRemoveMember(confirmRemoveMember)}
          onCancel={() => setConfirmRemoveMember(null)}
        />
      )}

      {confirmRemoveEquipment && (
        <ConfirmDialog
          title="Remove Equipment"
          message="Are you sure you want to remove this equipment record?"
          confirmLabel="Remove"
          danger
          onConfirm={() => handleRemoveEquipment(confirmRemoveEquipment)}
          onCancel={() => setConfirmRemoveEquipment(null)}
        />
      )}
    </PageLayout>
  );
}

export default AssociationDetailPage;
