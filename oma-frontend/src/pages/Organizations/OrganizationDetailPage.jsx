import { useEffect, useRef, useState } from "react";
import { ArrowLeft, HandHelping, Plus, Power, Search, Trash2, Upload, UserCog, UserX } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import api from "../../api/axiosInstance.js";
import ActivateCitizenAccountButton from "../../components/ActivateCitizenAccountButton.jsx";
import ImportFileModal from "../../components/ImportFileModal.jsx";
import PageLayout from "../../components/Layout/PageLayout.jsx";
import Button from "../../components/UI/Button.jsx";
import StatusPill from "../../components/UI/StatusPill.jsx";
import Tabs from "../../components/UI/Tabs.jsx";
import ModalShell from "../../components/UI/ModalShell.jsx";
import ComboboxWithOther from "../../components/UI/ComboboxWithOther.jsx";
import ConfirmDialog from "../../components/UI/ConfirmDialog.jsx";
import { baseInputClasses } from "../../components/UI/FormField.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useToast } from "../../context/ToastContext.jsx";
import useSuggestSearch from "../../hooks/useSuggestSearch.js";
import { CONDITIONS, apiMessage, conditionTone, groupEquipment, openRequestCount } from "../../utils/equipmentLoans.js";
import { filterOptions } from "../../utils/orgListFilter.js";
import { agencyLabel } from "./agencyOptions.js";
import BorrowedPanel from "./BorrowedPanel.jsx";
import EquipmentGroupBody from "./EquipmentGroupBody.jsx";
import OrgCompactList from "./OrgCompactList.jsx";
import {
  ChangeConditionDialog, EquipmentHistoryDialog, LendDialog, RepairDialog,
} from "./EquipmentActionDialogs.jsx";

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

// Matches OrganizationOfficer.POSITION_CHOICES / FisherfolkOrganizationOfficer.POSITION_CHOICES
// on the backend — narrower than the Member-position list above (no "Chairperson" /
// "Vice Chairperson" / "Member").
const OFFICER_POSITIONS = ["President", "Vice President", "Secretary", "Treasurer", "Auditor", "Board Member", "Manager"];

function positionTone(pos) {
  if (pos === "President") return "navy";
  if (pos === "Chairperson" || pos === "Vice Chairperson") return "green";
  if (["Vice President", "Secretary", "Treasurer", "Auditor"].includes(pos)) return "blue";
  if (["Board Member", "Manager"].includes(pos)) return "amber";
  return "slate";
}

// Header actions of the member / equipment / officer cards: two equal buttons on a phone, natural width from `sm` up.
const ACTION_ROW = "grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center";
const BTN_BASE = "flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[12px] font-medium transition-colors sm:px-4 sm:text-[13px]";
const BTN_OUTLINE = `${BTN_BASE} border border-[#C8D5C8] bg-white text-[#1B4D2E] hover:bg-[#F0F4F0]`;
const BTN_SOLID = `${BTN_BASE} bg-[#1B4D2E] text-white hover:bg-[#235E38]`;

// ─── Add Member Modal ─────────────────────────────────────────────────────────

// Today's date in the user's own timezone (toISOString() is UTC, which is yesterday before 08:00 in the Philippines).
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function AddMemberModal({ type, organizationId, organizationName, own = false, onClose, onSuccess }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [position, setPosition] = useState("Member");
  // An organization adds members as of today (the same default its older portal used); staff enter the date.
  const [dateJoined, setDateJoined] = useState(own ? localToday() : "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set when the server refuses the add until staff choose whether this
  // organization becomes the person's main (the person's other active
  // memberships have no main). Holds those other organizations' names.
  const [mainChoice, setMainChoice] = useState(null);
  const [submittedIsMain, setSubmittedIsMain] = useState(undefined);

  const searchEndpoint = type === "farmers" ? "/farmers/" : "/fisheries/fisherfolk/";
  const memberKey = type === "farmers" ? "farmer" : "fisherfolk";
  const idLabel =
    type === "farmers" ? "rsbsa_number" : "lgu_registration_number";
  const idDisplayLabel = type === "farmers" ? "RSBSA No." : "LGU No.";
  // The organization-scoped candidate search returns a masked id hint instead of the full registry number.
  const idOf = (item) => (own ? item.id_hint : item[idLabel]);

  // Suggestions appear as staff type a name or ID number; the only people
  // offered are registry records, and one must be picked from the list.
  const { results, isSearching, hasSearched } = useSuggestSearch(
    search,
    (q) => (own
      ? api.get(`/organizations/${type}/${organizationId}/member-search/`, { params: { search: q } })
      : api.get(`${searchEndpoint}?search=${encodeURIComponent(q)}`))
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data.results || []))),
  );

  // `isMain` is only sent once staff have answered the main-organization
  // choice; the first attempt omits it and lets the server decide.
  const submitMember = async (isMain) => {
    setError("");
    setSubmittedIsMain(isMain);
    setIsSubmitting(true);
    try {
      await api.post(`/organizations/${type}/${organizationId}/members/`, {
        [memberKey]: selected.id,
        position,
        date_joined: dateJoined,
        ...(isMain === undefined ? {} : { is_main: isMain }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      const data = err.response?.data;
      if (data?.main_choice_required && own) {
        // Choosing a person's main organization is OMAg staff's call, not the organization's.
        setError("This person is already in another organization and has no main one yet. Ask OMAg staff to set it first.");
      } else if (data?.main_choice_required) {
        setMainChoice({
          otherNames: (data.other_organizations || []).map((o) => o.organization_name),
        });
      } else {
        setError(data?.detail || "Unable to add member.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selected) {
      setError("Please search for and select a member first.");
      return;
    }
    if (!dateJoined) {
      setError("Date joined is required.");
      return;
    }
    submitMember();
  };

  if (mainChoice) {
    return (
      <ModalShell
        title="Choose Main Organization"
        onClose={onClose}
        maxWidth="max-w-xl"
        footer={
          <>
            <Button onClick={() => setMainChoice(null)} disabled={isSubmitting} type="button" variant="secondary">
              Cancel
            </Button>
            <Button onClick={() => submitMember(false)} isLoading={isSubmitting && submittedIsMain === false} disabled={isSubmitting} type="button" variant="outline">
              Add, but not as main
            </Button>
            <Button onClick={() => submitMember(true)} isLoading={isSubmitting && submittedIsMain === true} disabled={isSubmitting} type="button" variant="primary">
              Make {organizationName} their main
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[14px] leading-relaxed text-[#1A2B1A]">
            <span className="font-semibold">{selected.full_name}</span> is already in{" "}
            <span className="font-semibold">{mainChoice.otherNames.join(", ")}</span> but has no
            main organization. Should <span className="font-semibold">{organizationName}</span> be
            their main?
          </p>
          <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-[12px] text-[#7A8E7A]">
            They have not been added yet. Cancel to go back and change the details.
          </p>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="Add Member"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button isLoading={isSubmitting} type="submit" form="add-member-form" variant="primary">
            Add Member
          </Button>
        </>
      }
    >
      <form id="add-member-form" className="space-y-5" onSubmit={handleSubmit}>
        {/* Search */}
        <div>
          <label className={labelCls}>
            Search {type === "farmers" ? "Farmer" : "Fisherfolk"}
          </label>
          <input
            className={`${baseInputClasses} mt-1`}
            placeholder="Name or ID number..."
            autoComplete="off"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
            onKeyDown={(e) => {
              // Enter picks the first suggestion instead of submitting the form.
              if (e.key === "Enter") {
                e.preventDefault();
                if (results[0]) setSelected(results[0]);
              }
            }}
          />
          <p className="mt-1.5 text-[12px] text-[#7A8E7A]">
            Only registered {type === "farmers" ? "farmers" : "fisherfolk"} can be added — pick one from the list.
          </p>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className={`max-h-48 overflow-y-auto rounded-xl border border-[#E2E8E2] transition-opacity duration-150 ${isSearching ? "opacity-60" : ""}`}>
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
                  {idDisplayLabel}: {idOf(item)}
                </span>
                {own && item.current_organizations?.length > 0 && (
                  <span className="mt-0.5 block text-[11px] text-[#7A8E7A]">
                    Also in: {item.current_organizations.map((o) => o.name).join(", ")}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {hasSearched && results.length === 0 && (
          <p className="text-[13px] text-[#7A8E7A]">
            No results. Try a different name or ID.
          </p>
        )}

        {selected && (
          <p className="rounded-lg bg-[#EBF5EE] px-3 py-2 text-[13px] font-medium text-[#1B4D2E]">
            Selected: {selected.full_name} ({idOf(selected)})
          </p>
        )}

        {/* Position (an organization adds a plain member; officers are assigned from the Officers table) */}
        {!own && (
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
        )}

        {/* Date Joined */}
        <div>
          <label className={labelCls}>Date Joined</label>
          <input
            className={`${baseInputClasses} mt-1`}
            required
            type="date"
            value={dateJoined}
            max={localToday()}
            onChange={(e) => setDateJoined(e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">
            {error}
          </p>
        )}

      </form>
    </ModalShell>
  );
}

// ─── Member Search Input (officer assignment — this organization's members only) ──

function MemberSearchInput({ type, organizationId, onSelect, selected }) {
  const [query, setQuery] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const wrapperRef = useRef(null);

  // Batch (Phase B): both domains' member-search results are real join
  // rows now — `item.id` is the JOIN ROW id, not the person's, on either
  // side (matches the Members tab shape below).
  const getId = (item) => (type === "farmers" ? item.farmer : item.fisherfolk);
  const getName = (item) => (type === "farmers" ? item.farmer_full_name : item.fisherfolk_full_name);
  const getBarangay = (item) => (type === "farmers" ? item.farmer_barangay : item.fisherfolk_barangay);

  // Stale answers are thrown away (the server can take seconds, so an older,
  // slower answer used to overwrite the one being waited for).
  const { results, isSearching: searching, failed, active } = useSuggestSearch(
    selected?.id ? "" : query,
    (q) => api
      .get(`/organizations/${type}/${organizationId}/members/`, { params: { search: q, active_only: true } })
      .then((r) => (Array.isArray(r.data) ? r.data : r.data.results || []).slice(0, 10)),
  );

  const handleChange = (e) => {
    setQuery(e.target.value);
    setShowDrop(true);
  };

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowDrop(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (item) => {
    onSelect({ id: getId(item), full_name: getName(item), barangay: getBarangay(item) });
    setQuery(getName(item));
    setShowDrop(false);
  };

  const displayValue = selected?.id ? selected.full_name : query;

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A8BCA8] pointer-events-none" />
        <input
          className={`${baseInputClasses} pl-8`}
          placeholder="Search this organization's members…"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => {
            if (results.length > 0) setShowDrop(true);
          }}
        />
      </div>
      {showDrop && (
        <div className={`absolute z-50 mt-1 w-full rounded-xl border border-[#E2E8E2] bg-white shadow-lg max-h-52 overflow-y-auto transition-opacity ${searching && results.length > 0 ? "opacity-60" : ""}`}>
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#7A8E7A]">
              {!active ? "Type at least 2 characters." : searching ? "Searching…" : failed ? "Search failed — please try again." : "No matching members in this organization."}
            </p>
          ) : (
            results.map((item) => (
              <button
                key={getId(item)}
                type="button"
                onMouseDown={() => handleSelect(item)}
                className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-[#F5F7F5] transition-colors"
              >
                <span className="text-xs font-semibold text-[#1A2B1A]">{getName(item)}</span>
                <span className="text-[11px] text-[#7A8E7A]">{getBarangay(item)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Assign Officer Modal ──────────────────────────────────────────────────────

function AssignOfficerModal({ type, organizationId, existingOfficers, own = false, onClose, onSuccess }) {
  const [position, setPosition] = useState(OFFICER_POSITIONS[0]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const memberKey = type === "farmers" ? "farmer" : "fisherfolk";

  const positionFilled = existingOfficers.some((o) => o.position === position);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selected) {
      setError("Please search for and select a member first.");
      return;
    }
    if (positionFilled) {
      setError(own
        ? "This position is currently held by someone else. End their term first (open the officer and choose End term early), then assign the new officer."
        : "This position is currently held by someone else. End their term first before assigning a new officer.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await api.post(`/organizations/${type}/${organizationId}/officers/`, {
        position,
        [memberKey]: selected.id,
      });
      onSuccess();
      onClose();
    } catch (err) {
      const data = err.response?.data;
      setError(data?.[memberKey]?.[0] || data?.detail || "Unable to assign officer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell
      title="Assign Officer"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button
            isLoading={isSubmitting}
            disabled={positionFilled}
            type="submit"
            form="assign-officer-form"
            variant="primary"
          >
            Assign Officer
          </Button>
        </>
      }
    >
      <form id="assign-officer-form" className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className={labelCls}>Position</label>
          <select
            className={`${baseInputClasses} mt-1`}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            {OFFICER_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {positionFilled && (
            <p className="mt-1 text-[11px] text-amber-600">
              {own
                ? "This position is currently held by someone else. End their term first (open the officer and choose End term early), then assign the new officer."
                : "This position is currently held by someone else. End their term first before assigning a new officer."}
            </p>
          )}
        </div>

        <div>
          <label className={labelCls}>Member</label>
          <div className="mt-1">
            <MemberSearchInput
              type={type}
              organizationId={organizationId}
              onSelect={setSelected}
              selected={selected}
            />
          </div>
          <p className="mt-1 text-[11px] text-[#7A8E7A]">
            Only people already a member of this organization can be assigned as an officer.
          </p>
        </div>

        {selected && (
          <p className="rounded-lg bg-[#EBF5EE] px-3 py-2 text-[13px] font-medium text-[#1B4D2E]">
            Selected: {selected.full_name}
          </p>
        )}

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">
            {error}
          </p>
        )}

      </form>
    </ModalShell>
  );
}

// ─── End Term Early Modal ──────────────────────────────────────────────────────
// Replaces the old plain-removal (hard delete) flow. Same required-field
// discipline as CropMonitoringPage's disaster manual-recovery notes:
// Confirm is disabled client-side until the reason is non-empty; the
// backend enforces the same rule regardless.

function EndTermModal({ type, officer, onClose, onSuccess }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("A reason is required to end a term early.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await api.post(`/organizations/${type}/officers/${officer.id}/end-term/`, { reason: trimmed });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to end this term.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell
      title="End Term Early"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button
            isLoading={isSubmitting}
            disabled={!reason.trim()}
            type="submit"
            form="end-term-form"
            variant="primary"
          >
            End Term
          </Button>
        </>
      }
    >
      <form id="end-term-form" className="space-y-5" onSubmit={handleSubmit}>
        <p className="text-[13px] text-[#4A5E4A]">
          End {officer.name}'s term as {officer.position}? This does not remove their organization
          membership — the position becomes vacant and can be assigned to someone new. Their term
          is kept as a permanent historical record, not deleted.
        </p>

        <div>
          <label className={labelCls}>Reason (required)</label>
          <textarea
            className={`${baseInputClasses} mt-1`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this term ending early?"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">
            {error}
          </p>
        )}

      </form>
    </ModalShell>
  );
}

// ─── Officer History Modal ──────────────────────────────────────────────────────

function OfficerHistoryModal({ history, onClose }) {
  return (
    <ModalShell title="Officer History" onClose={onClose} maxWidth="max-w-3xl">
      {history.length === 0 ? (
        <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">
          No officer history yet.
        </p>
      ) : (
        <>
        {/* Phone: one card per term, so nothing is hidden behind a sideways scroll. */}
        <ul className="space-y-2.5 sm:hidden" aria-label="Officer terms">
          {history.map((officer) => (
            <li key={officer.id} className="rounded-xl border border-[#E2E8E2] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[#1A2B1A]">{officer.full_name}</p>
                  <p className="text-[12px] font-semibold text-[#4A5E4A]">{officer.position}</p>
                </div>
                <StatusPill tone={officer.is_active ? "green" : officer.early_exit_reason ? "rose" : "slate"}>
                  {officer.is_active ? "Current" : officer.early_exit_reason ? "Ended Early" : "Completed"}
                </StatusPill>
              </div>
              <p className="mt-2 text-[12px] text-[#4A5E4A]">
                {formatDate(officer.term_start_date)} – {formatDate(officer.term_end_date)}
              </p>
              {officer.early_exit_reason && <p className="mt-1 text-[12px] text-[#7A8E7A]">Reason: {officer.early_exit_reason}</p>}
            </li>
          ))}
        </ul>
        <div className="hidden rounded-xl border border-[#E2E8E2] overflow-hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#1B4D2E]">
                <th className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white">Position</th>
                <th className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white">Name</th>
                <th className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white">Term Start</th>
                <th className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white">Term End</th>
                <th className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white">Status</th>
                <th className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white">Early-Exit Reason</th>
              </tr>
            </thead>
            <tbody>
              {history.map((officer) => (
                <tr key={officer.id} className="border-t border-[#F0F4F0] hover:bg-[#F5F7F5]">
                  <td className="px-4 py-3 text-[12px] font-semibold text-[#4A5E4A]">{officer.position}</td>
                  <td className="px-4 py-3 text-[13px] text-[#1A2B1A]">{officer.full_name}</td>
                  <td className="px-4 py-3 text-[13px] text-[#4A5E4A]">{formatDate(officer.term_start_date)}</td>
                  <td className="px-4 py-3 text-[13px] text-[#4A5E4A]">{formatDate(officer.term_end_date)}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={officer.is_active ? "green" : officer.early_exit_reason ? "rose" : "slate"}>
                      {officer.is_active ? "Current" : officer.early_exit_reason ? "Ended Early" : "Completed"}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-[#4A5E4A]">{officer.early_exit_reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </ModalShell>
  );
}

// ─── Add Equipment Modal ──────────────────────────────────────────────────────

function AddEquipmentModal({ type, organizationId, onClose, onSuccess }) {
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
    if (form.equipment_name === "Other" && !form.equipment_name_other.trim()) {
      setError("Say what the equipment is.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = { ...form };
      if (!payload.acquisition_date) delete payload.acquisition_date;
      if (payload.equipment_name !== "Other")
        delete payload.equipment_name_other;
      await api.post(
        `/organizations/${type}/${organizationId}/equipment/`,
        payload,
      );
      onSuccess();
      onClose();
    } catch (err) {
      setError(apiMessage(err, "Unable to add equipment."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell
      title="Add Equipment"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} type="button" variant="secondary">
            Cancel
          </Button>
          <Button isLoading={isSubmitting} type="submit" form="add-equipment-form" variant="primary">
            Add Equipment
          </Button>
        </>
      }
    >
      <form id="add-equipment-form" className="space-y-4" onSubmit={handleSubmit}>
        {/* Equipment Name */}
        <div>
          <label className={labelCls}>Equipment Name</label>
          <ComboboxWithOther
            options={equipmentChoices.filter((c) => c !== "Other")}
            value={form.equipment_name}
            otherValue={form.equipment_name_other}
            onChange={(v) => updateField("equipment_name", v)}
            onOtherChange={(v) => updateField("equipment_name_other", v)}
          />
        </div>

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

      </form>
    </ModalShell>
  );
}

// ─── Field display ────────────────────────────────────────────────────────────

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-[#7A8E7A] mb-0.5">{label}</p>
      <p className="break-words text-[14px] font-medium text-[#1A2B1A]">{value || "—"}</p>
    </div>
  );
}

// Same identity-card + info-card structure as FarmerDetailPage/FisherfolkDetailPage
// (see FarmerDetailPage's own comment for the reference this is built against).
// Farmers Org gets the farmer green, Fisherfolk Org gets the same fisheries
// blue used everywhere else for that domain (--color-cz-fish-header) --
// same idea, different color. Realigned to #155E82 (Phase 2 color fix,
// 2026-09-07) to match --color-cz-fish-header's corrected value.
const FISH_BLUE = "#155E82";

function initialsOf(name) {
  return (name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join("") || "?";
}

// ─── Main page ────────────────────────────────────────────────────────────────

function OrganizationDetailPage({ own = false }) {
  const params = useParams();
  const { isAdmin, isEvaluator, user, orgType } = useAuth();
  // Own-organization mode (an organization account): the organization comes from the signed-in account, not the
  // URL. The organization manages members, equipment and officers itself; the staff-only controls (Back,
  // Activate Account, Set as main, End Term Early) stay hidden.
  const type = own ? (orgType === "FISHERFOLK_ORG" ? "fisherfolk" : "farmers") : params.type;
  const id = own ? user?.linked_record?.id : params.id;
  const isStaff = isAdmin || isEvaluator;
  const canManage = isStaff || own;
  const { showToast } = useToast();

  // Both organization types carry an equipment inventory: the backend has
  // Add/Remove equipment endpoints and a serializer for each, and
  // AddEquipmentModal's per-type lists mirror each model's choices.
  // An organization account's loans, loaded below; the Borrowed tab shows how many requests are waiting.
  const [loans, setLoans] = useState([]);
  const sectionTabs = own
    ? [
        { value: "members", label: "Members" },
        { value: "equipment", label: "Equipment" },
        { value: "borrowed", label: openRequestCount(loans) > 0 ? `Borrowed (${openRequestCount(loans)})` : "Borrowed" },
        { value: "officers", label: "Officers" },
      ]
    : [
        { value: "members", label: "Members" },
        { value: "equipment", label: "Equipment Inventory" },
      ];

  const [organization, setOrganization] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  // An organization account can open straight onto a tab (the bell links to ?tab=borrowed, the Home shortcuts to the others).
  const [activeSection, setActiveSection] = useState(
    own && ["members", "equipment", "borrowed", "officers"].includes(searchParams.get("tab")) ? searchParams.get("tab") : "members",
  );
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [showImportMembers, setShowImportMembers] = useState(false);
  const [showImportEquipment, setShowImportEquipment] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Toggle-not-delete batch: { id, name, targetActive, heldPosition } —
  // heldPosition only matters when deactivating (targetActive === false),
  // sourced from the same officer roster the roster tab already renders.
  const [confirmSetMemberActive, setConfirmSetMemberActive] = useState(null);
  const [deactivateReason, setDeactivateReason] = useState("");
  const [confirmRemoveEquipment, setConfirmRemoveEquipment] = useState(null);
  // The equipment action in progress: { kind: "condition" | "repair" | "lend" | "history", line }.
  const [equipAction, setEquipAction] = useState(null);
  const [endTermOfficer, setEndTermOfficer] = useState(null);
  const [showAssignOfficer, setShowAssignOfficer] = useState(false);
  const [showOfficerHistory, setShowOfficerHistory] = useState(false);

  const typeLabel = type === "farmers" ? "Farmers" : "Fisherfolk";
  const memberIdLabel = type === "farmers" ? "RSBSA Number" : "LGU Number";
  const memberIdField =
    type === "farmers" ? "farmer_rsbsa_number" : "fisherfolk_lgu_number";
  const memberNameField =
    type === "farmers" ? "farmer_full_name" : "fisherfolk_full_name";

  // Toggle-not-delete batch: which officer position (if any) a member row
  // currently holds, so the deactivate confirmation can warn about it —
  // same warning the citizen-side flow already gives. Batch (Phase B):
  // both domains' members are now join rows the same shape — m[farmer|
  // fisherfolk] is the PERSON's id (m.id is the join row's own id), which
  // is what officer.farmer_id / officer.fisherfolk_id actually match.
  const heldPositionFor = (m) => {
    const officers = organization?.officers || [];
    const officer = type === "farmers"
      ? officers.find((o) => o.farmer_id === m.farmer)
      : officers.find((o) => o.fisherfolk_id === m.fisherfolk);
    return officer ? officer.position : null;
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await api.get(`/organizations/${type}/${id}/`);
        if (!cancelled) setOrganization(response.data);
      } catch {
        if (!cancelled) setError("Unable to load organization details.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [type, id, refreshKey]);

  // Toggle-not-delete batch: was a hard DELETE (Farmers: nulled
  // Farmer.farmers_organization; Fisherfolk: deleted the join row). Both
  // sides now PATCH {is_active} on the exact same URLs instead — the
  // member's record and history stay intact either way, and this same
  // action run again with the opposite target reverses it. Batch (Phase B):
  // both domains now use the identical staff-only URL shape.
  const handleSetMemberActive = async () => {
    if (!confirmSetMemberActive) return;
    const { id: memberId, targetActive } = confirmSetMemberActive;
    const payload = targetActive
      ? { is_active: targetActive }
      : { is_active: targetActive, reason: deactivateReason.trim() };
    try {
      await api.patch(
        own ? `/organizations/${type}/${id}/members/${memberId}/` : `/organizations/${type}/members/${memberId}/`,
        payload,
      );
      showToast(targetActive ? "Member reactivated." : "Member deactivated.", "success");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showToast(err.response?.data?.detail || "Unable to update member.", "error");
    } finally {
      setConfirmSetMemberActive(null);
      setDeactivateReason("");
    }
  };

  // Batch (Phase B): explicit "make this the main organization" override —
  // low-risk/reversible (just re-run on a different membership), so no
  // confirmation dialog, matching how lightweight the action actually is.
  const handleSetMain = async (memberId) => {
    try {
      await api.post(`/organizations/${type}/${id}/members/${memberId}/set-main/`);
      showToast("Main organization updated.", "success");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showToast(err.response?.data?.detail || "Unable to update main organization.", "error");
    }
  };

  const handleRemoveEquipment = async (equipId) => {
    try {
      await api.delete(`/organizations/${type}/equipment/${equipId}/`);
      showToast("Equipment removed.", "success");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      showToast(apiMessage(err, "Unable to remove equipment."), "error");
    } finally {
      setConfirmRemoveEquipment(null);
    }
  };

  // An organization account also loads its loans (for the Borrowed tab and the count of open requests).
  useEffect(() => {
    if (!own) return undefined;
    let cancelled = false;
    api.get(`/organizations/${type}/${id}/equipment-loans/`)
      .then((r) => { if (!cancelled) setLoans(r.data); })
      .catch(() => { if (!cancelled) setLoans([]); });
    return () => { cancelled = true; };
  }, [own, type, id, refreshKey]);

  const handleMemberAdded = () => setRefreshKey((k) => k + 1);
  const handleEquipmentAdded = () => setRefreshKey((k) => k + 1);
  const handleOfficerAssigned = () => setRefreshKey((k) => k + 1);

  // Own-organization mode shows short lists (just the name on each row, details on tap) with a search and filters.
  const choices = (items, key) => filterOptions(items, key).map((value) => ({ value, label: value }));
  const memberItems = (organization?.members || []).map((m) => {
    const isActive = m.is_active !== false;
    return {
      id: m.id,
      name: m[memberNameField],
      dim: !isActive,
      attrs: { status: isActive ? "Active" : "Inactive", position: m.position || "Member", main: m.is_main ? "Main" : "Other" },
      details: [
        { label: memberIdLabel, value: m[memberIdField] || "—" },
        { label: "Position", value: <StatusPill tone={positionTone(m.position)}>{m.position}</StatusPill> },
        { label: "Date joined", value: formatDate(m.date_joined) },
        { label: "Main organization", value: m.is_main ? "Yes" : "No" },
        { label: "Status", value: <StatusPill tone={isActive ? "green" : "slate"}>{isActive ? "Active" : "Inactive"}</StatusPill> },
      ],
      actions: [{
        key: "toggle",
        label: isActive ? "Deactivate" : "Activate",
        icon: Power,
        tone: isActive ? "danger" : "default",
        onClick: () => setConfirmSetMemberActive({
          id: m.id, name: m[memberNameField], targetActive: !isActive, heldPosition: heldPositionFor(m),
        }),
      }],
    };
  });
  const memberFilters = [
    { key: "status", label: "Status", allLabel: "All statuses", options: choices(memberItems, "status") },
    { key: "position", label: "Position", allLabel: "All positions", options: choices(memberItems, "position") },
    { key: "main", label: "Main organization", allLabel: "Main or not", options: memberItems.some((i) => i.attrs.main === "Main") ? [{ value: "Main", label: "Main organization only" }] : [] },
  ];
  // One entry per kind of equipment; tapping it drops down its conditions one by one, each with its own details and actions.
  const equipmentItems = groupEquipment(organization?.equipment || []).map((group) => ({
    id: group.id,
    name: group.label,
    subtitle: group.summary + (group.onLoan ? ` \u00b7 ${group.onLoan} on loan` : ""),
    attrs: { condition: group.conditions },
    renderBody: ({ close }) => (
      <EquipmentGroupBody
        group={group}
        onAction={(kind, line) => { close(); setEquipAction({ kind, line }); }}
        onRemove={(line) => { close(); setConfirmRemoveEquipment(line.id); }}
      />
    ),
  }));
  const personField = type === "farmers" ? "farmer" : "fisherfolk";
  const lendableMembers = (organization?.members || [])
    .filter((m) => m.is_active !== false)
    .map((m) => ({ id: m[personField], name: m[memberNameField] }));
  const equipmentFilters = [{ key: "condition", label: "Condition", allLabel: "All conditions", options: choices(equipmentItems, "condition") }];
  const officerItems = (organization?.officers || []).map((o) => ({
    id: o.id,
    name: o.full_name,
    subtitle: o.position,
    attrs: { position: o.position },
    details: [
      { label: "Position", value: o.position },
      { label: "Term start", value: formatDate(o.term_start_date) },
      { label: "Term end", value: formatDate(o.term_end_date) },
    ],
    actions: [{ key: "end-term", label: "End term early", icon: UserX, tone: "danger", onClick: () => setEndTermOfficer({ id: o.id, position: o.position, name: o.full_name }) }],
  }));
  const officerFilters = [{ key: "position", label: "Position", allLabel: "All positions", options: choices(officerItems, "position") }];

  return (
    <PageLayout
      title={own ? "My Organization" : `${typeLabel} Organization Details`}
      subtitle={own ? "Your organization's members, equipment and officers." : "View members, equipment, and organization information"}
    >
      <div className="space-y-4">
        {/* Batch A: was hardcoded to /organizations, which has no route (404) —
            the real destination is the type-specific hub's Organizations tab. */}
        {!own && <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#4A5E4A] hover:text-[#1A2B1A] transition-colors"
            to={type === "farmers" ? "/farmers?tab=organizations" : "/fisherfolk?tab=organizations"}
          >
            <ArrowLeft size={15} />
            Back to Organizations
          </Link>
          {!isLoading && organization && isStaff && (
            <ActivateCitizenAccountButton
              citizenAccount={organization.citizen_account}
              personLabel={organization.name}
              onActivated={() => setRefreshKey((k) => k + 1)}
            />
          )}
        </div>}

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

        {!isLoading && organization && (
          <>
            {/* Identity + Organization Information (staff view only: an organization sees these on My Profile) */}
            {!own && (() => {
              const themeColor = type === "farmers" ? "#1B4D2E" : FISH_BLUE;
              const themeBg = type === "farmers" ? "#EBF5EE" : "#EAF1F5";
              return (
                <div className="grid gap-4 lg:grid-cols-[320px_1fr] lg:items-start">
                  <div className="lg:sticky lg:top-20">
                    <section className="rounded-xl border border-[#E2E8E2] bg-white overflow-hidden">
                      <div className="h-20" style={{ backgroundColor: themeColor }} />
                      <div className="px-5 pb-5 -mt-8">
                        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border-2 bg-white text-[18px] font-semibold" style={{ color: themeColor, borderColor: themeColor }}>
                          {organization.logo ? (
                            <img src={organization.logo} alt={`${organization.name} logo`} className="h-full w-full object-cover" />
                          ) : (
                            initialsOf(organization.name)
                          )}
                        </div>
                        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#A8BCA8]">Organization Name</p>
                        <h1 className="mt-0.5 text-[16px] font-semibold text-[#1A2B1A]">
                          {organization.name}
                        </h1>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <StatusPill tone={organization.is_active ? "green" : "slate"}>
                            {organization.is_active ? "Active" : "Inactive"}
                          </StatusPill>
                        </div>
                        <p className="mt-1.5 text-[12px] text-[#7A8E7A]">{typeLabel} Organization</p>
                      </div>
                    </section>

                    <div className="mt-3 rounded-xl border border-[#E2E8E2] px-4 py-3" style={{ backgroundColor: themeBg }}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: themeColor }}>Registration Number</p>
                      <p className="mt-1 text-[13px] font-semibold text-[#1A2B1A]">{organization.registration_number}</p>
                    </div>
                  </div>

                  <div className="space-y-4 lg:sticky lg:top-20">
                    <section className="rounded-xl border border-[#E2E8E2] bg-white overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-[#E2E8E2]" style={{ backgroundColor: themeBg }}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: themeColor }}>
                          Registered Information
                        </p>
                      </div>
                      <div className="p-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        <Field
                          label="Registration Number"
                          value={organization.registration_number}
                        />
                        <Field
                          label="Registration Agency"
                          value={agencyLabel(organization.registration_agency)}
                        />
                        <Field
                          label="Date Organized"
                          value={formatDate(organization.date_organized)}
                        />
                        <Field
                          label="Date Registered"
                          value={formatDate(organization.date_registered)}
                        />
                        <Field
                          label="Added to System"
                          value={formatDate(organization.date_created)}
                        />
                        {/* Farmers Organizations only, and no create/edit/import
                            path fills them — shown only when a value exists
                            instead of a permanent row of dashes. */}
                        {organization.dole_registration_number && (
                          <Field
                            label="DOLE Registration No."
                            value={organization.dole_registration_number}
                          />
                        )}
                        {organization.bir_number && (
                          <Field
                            label="BIR Number"
                            value={organization.bir_number}
                          />
                        )}
                      </div>
                    </section>

                    <section className="rounded-xl border border-[#E2E8E2] bg-white overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-[#E2E8E2]" style={{ backgroundColor: themeBg }}>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: themeColor }}>
                          Contact
                        </p>
                      </div>
                      <div className="p-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                        <Field label="Contact Person" value={organization.contact_person} />
                        <Field label="Contact Number" value={organization.contact_number} />
                        <Field label="Email" value={organization.email_address} />
                        <Field label="Barangay" value={organization.barangay} />
                        <Field label="Street Address" value={organization.street_address} />
                      </div>
                    </section>
                  </div>
                </div>
              );
            })()}

            {/* Members & Equipment */}
            <div className="bg-white border border-[#E2E8E2] rounded-xl p-4 sm:p-6">
              <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <Tabs
                  activeTab={activeSection}
                  tabs={sectionTabs}
                  onChange={setActiveSection}
                />
                {canManage &&
                  (activeSection === "members" ? (
                    <div className={ACTION_ROW}>
                      <button
                        className={BTN_OUTLINE}
                        onClick={() => setShowImportMembers(true)}
                      >
                        <Upload size={15} />
                        Import<span className="hidden sm:inline"> Members</span>
                      </button>
                      <button
                        className={BTN_SOLID}
                        onClick={() => setShowAddMember(true)}
                      >
                        <Plus size={15} />
                        Add Member
                      </button>
                    </div>
                  ) : own && activeSection === "borrowed" ? (
                    <div className={ACTION_ROW}>
                      <button className={`${BTN_SOLID} col-span-2`} onClick={() => setActiveSection("equipment")} type="button">
                        <HandHelping size={15} />
                        Lend equipment
                      </button>
                    </div>
                  ) : own && activeSection === "officers" ? (
                    <div className={ACTION_ROW}>
                      <button className={BTN_OUTLINE} onClick={() => setShowOfficerHistory(true)} type="button">
                        Officer History
                      </button>
                      <button
                        className={BTN_SOLID}
                        onClick={() => setShowAssignOfficer(true)}
                      >
                        <UserCog size={15} />
                        Assign Officer
                      </button>
                    </div>
                  ) : (
                    <div className={ACTION_ROW}>
                      <button
                        className={BTN_OUTLINE}
                        onClick={() => setShowImportEquipment(true)}
                      >
                        <Upload size={15} />
                        Import<span className="hidden sm:inline"> Equipment</span>
                      </button>
                      <button
                        className={BTN_SOLID}
                        onClick={() => setShowAddEquipment(true)}
                      >
                        <Plus size={15} />
                        Add Equipment
                      </button>
                    </div>
                  ))}
              </div>

              {/* Members tab — Batch (Phase B): both domains are real join
                  rows now (organization.members, from
                  Farmers/FisherfolkOrganizationMemberSerializer), so this is
                  one shared table shape instead of two near-duplicates. */}
              {activeSection === "members" &&
                (organization.members.length === 0 ? (
                  <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">
                    No members recorded.
                  </p>
                ) : own ? (
                  <OrgCompactList items={memberItems} filters={memberFilters} searchPlaceholder="Search name..." emptyText="No members recorded." />
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
                            <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-white">Main</th>
                            <th className="px-4 py-[11px] text-[11px] font-semibold uppercase tracking-wider text-white">Status</th>
                            {canManage && (
                              <th className="px-4 py-[11px]" />
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {organization.members.map((m) => {
                            const isActive = m.is_active !== false;
                            return (
                            <tr key={m.id} className={`border-b border-[#F0F4F0] hover:bg-[#F9FAF9] transition-colors ${isActive ? '' : 'opacity-60'}`}>
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
                              <td className="px-4 py-[13px]">
                                {m.is_main ? (
                                  <StatusPill tone="green">Main</StatusPill>
                                ) : isActive && isStaff ? (
                                  <button
                                    type="button"
                                    onClick={() => handleSetMain(m.id)}
                                    className="text-[12px] font-medium text-[#7A8E7A] hover:text-[#1B4D2E] transition-colors underline decoration-dotted underline-offset-2"
                                  >
                                    Set as main
                                  </button>
                                ) : (
                                  <span className="text-[12px] text-[#A8BCA8]">—</span>
                                )}
                              </td>
                              <td className="px-4 py-[13px]">
                                <span title={!isActive ? m.deactivation_reason || '' : undefined}>
                                  <StatusPill tone={isActive ? 'green' : 'slate'}>{isActive ? 'Active' : 'Inactive'}</StatusPill>
                                </span>
                              </td>
                              {canManage && (
                                <td className="px-4 py-[13px]">
                                  <Button
                                    className={isActive ? '!text-rose-600' : '!text-[#1B4D2E]'}
                                    icon={Power}
                                    onClick={() => setConfirmSetMemberActive({
                                      id: m.id, name: m[memberNameField], targetActive: !isActive,
                                      heldPosition: heldPositionFor(m),
                                    })}
                                    size="sm"
                                    type="button"
                                    variant="ghost"
                                  >
                                    {isActive ? 'Deactivate' : 'Activate'}
                                  </Button>
                                </td>
                              )}
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

              {/* Equipment tab */}
              {activeSection === "equipment" &&
                (organization.equipment.length === 0 ? (
                  <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">
                    No equipment recorded.
                  </p>
                ) : own ? (
                  <OrgCompactList items={equipmentItems} filters={equipmentFilters} searchPlaceholder="Search name..." emptyText="No equipment recorded." />
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
                            {canManage && (
                              <th className="px-4 py-[11px]" />
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {organization.equipment.map((eq) => (
                            <tr key={eq.id} className="border-b border-[#F0F4F0] hover:bg-[#F9FAF9] transition-colors">
                              <td className="px-4 py-[13px] text-[13px] font-medium text-[#1A2B1A]">
                                {eq.equipment_name === "Other" &&
                                eq.equipment_name_other
                                  ? `Other — ${eq.equipment_name_other}`
                                  : eq.equipment_name}
                              </td>
                              <td className="px-4 py-[13px] text-[13px] text-[#4A5E4A]">
                                {eq.quantity}
                                {eq.on_loan ? ` (${eq.on_loan} on loan)` : ""}
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
                              {canManage && (
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

              {own && activeSection === "borrowed" && (
                <BorrowedPanel type={type} loans={loans} onChanged={() => setRefreshKey((k) => k + 1)} />
              )}

              {/* Officers tab (an organization's own page) */}
              {own && activeSection === "officers" &&
                (organization.officers.length === 0 ? (
                  <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">
                    No officers assigned yet.
                  </p>
                ) : (
                  <OrgCompactList items={officerItems} filters={officerFilters} searchPlaceholder="Search name..." emptyText="No officers assigned yet." />
                ))}
            </div>

            {/* Officers: a tab above for an organization's own page, this card for staff */}
            {!own && organization.officers && (
              <div className="mt-6 bg-white border border-[#E2E8E2] rounded-xl p-4 sm:p-6">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <h3 className="text-[14px] font-semibold text-[#1A2B1A]">Organization Officers</h3>
                  <div className={ACTION_ROW}>
                    <button className={BTN_OUTLINE} onClick={() => setShowOfficerHistory(true)} type="button">
                      Officer History
                    </button>
                    {canManage && (
                      <button
                        className={BTN_SOLID}
                        onClick={() => setShowAssignOfficer(true)}
                      >
                        <UserCog size={15} />
                        Assign Officer
                      </button>
                    )}
                  </div>
                </div>
                {organization.officers.length === 0 ? (
                  <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">
                    No officers assigned yet.
                  </p>
                ) : (
                  <div className="rounded-xl border border-[#E2E8E2] overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#1B4D2E]">
                          <th className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white">Position</th>
                          <th className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white">Name</th>
                          <th className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white">Term Start</th>
                          <th className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-wider text-white">Term End</th>
                          {isStaff && (
                            <th className="px-4 py-[11px]" />
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {organization.officers.map((officer) => (
                          <tr key={officer.id} className="border-t border-[#F0F4F0] hover:bg-[#F5F7F5]">
                            <td className="px-4 py-3 text-[12px] font-semibold text-[#4A5E4A]">{officer.position}</td>
                            <td className="px-4 py-3 text-[13px] text-[#1A2B1A]">{officer.full_name}</td>
                            <td className="px-4 py-3 text-[13px] text-[#4A5E4A]">{formatDate(officer.term_start_date)}</td>
                            <td className="px-4 py-3 text-[13px] text-[#4A5E4A]">{formatDate(officer.term_end_date)}</td>
                            {isStaff && (
                              <td className="px-4 py-3">
                                <Button
                                  className="!text-rose-600"
                                  icon={Trash2}
                                  onClick={() => setEndTermOfficer({ id: officer.id, position: officer.position, name: officer.full_name })}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  End Term Early
                                </Button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showAddMember && (
        <AddMemberModal
          type={type}
          organizationId={id}
          organizationName={organization.name}
          own={own}
          onClose={() => setShowAddMember(false)}
          onSuccess={handleMemberAdded}
        />
      )}

      {showImportMembers && (
        <ImportFileModal
          title="Import Members"
          subtitle={`Add already-registered ${type === "farmers" ? "farmers" : "fisherfolk"} to ${organization.name} from a spreadsheet.`}
          importUrl={`/organizations/${type}/${id}/members/import/`}
          templateUrl={`/organizations/${type}/${id}/members/import/template/`}
          templateFilename={`${type}_organization_members_import_template.xlsx`}
          onClose={() => setShowImportMembers(false)}
          onImported={handleMemberAdded}
        />
      )}

      {showImportEquipment && (
        <ImportFileModal
          title="Import Equipment"
          subtitle={`Add equipment to ${organization.name} from a spreadsheet.`}
          importUrl={`/organizations/${type}/${id}/equipment/import/`}
          templateUrl={`/organizations/${type}/${id}/equipment/import/template/`}
          templateFilename={`${type}_organization_equipment_import_template.xlsx`}
          onClose={() => setShowImportEquipment(false)}
          onImported={handleEquipmentAdded}
        />
      )}

      {showAddEquipment && (
        <AddEquipmentModal
          type={type}
          organizationId={id}
          onClose={() => setShowAddEquipment(false)}
          onSuccess={handleEquipmentAdded}
        />
      )}

      {showAssignOfficer && organization && (
        <AssignOfficerModal
          type={type}
          organizationId={id}
          existingOfficers={organization.officers || []}
          own={own}
          onClose={() => setShowAssignOfficer(false)}
          onSuccess={handleOfficerAssigned}
        />
      )}

      {confirmSetMemberActive && organization && (
        <ConfirmDialog
          title={confirmSetMemberActive.targetActive ? "Reactivate Member" : "Deactivate Member"}
          message={
            confirmSetMemberActive.targetActive
              ? `Reactivate ${confirmSetMemberActive.name} in ${organization.name}?`
              : `Deactivate ${confirmSetMemberActive.name} in ${organization.name}? Their ${type === "farmers" ? "farmer" : "fisherfolk"} profile and history are not affected — this can be reversed at any time.`
          }
          details={
            !confirmSetMemberActive.targetActive && confirmSetMemberActive.heldPosition
              ? `They currently hold the ${confirmSetMemberActive.heldPosition} position. Deactivating them will also clear this position, leaving it vacant.`
              : null
          }
          confirmLabel={confirmSetMemberActive.targetActive ? "Reactivate" : "Deactivate"}
          danger={!confirmSetMemberActive.targetActive}
          showReasonInput={!confirmSetMemberActive.targetActive}
          reasonValue={deactivateReason}
          onReasonChange={setDeactivateReason}
          reasonPlaceholder="Why is this member being deactivated? (optional)"
          onConfirm={handleSetMemberActive}
          onCancel={() => { setConfirmSetMemberActive(null); setDeactivateReason(""); }}
        />
      )}

      {equipAction?.kind === "condition" && (
        <ChangeConditionDialog line={equipAction.line} type={type} onClose={() => setEquipAction(null)}
          onDone={() => { setEquipAction(null); setRefreshKey((k) => k + 1); }} />
      )}
      {equipAction?.kind === "repair" && (
        <RepairDialog line={equipAction.line} type={type} onClose={() => setEquipAction(null)}
          onDone={() => { setEquipAction(null); setRefreshKey((k) => k + 1); }} />
      )}
      {equipAction?.kind === "lend" && (
        <LendDialog line={equipAction.line} type={type} members={lendableMembers} onClose={() => setEquipAction(null)}
          onDone={() => { setEquipAction(null); setRefreshKey((k) => k + 1); }} />
      )}
      {equipAction?.kind === "history" && (
        <EquipmentHistoryDialog line={equipAction.line} type={type} onClose={() => setEquipAction(null)} />
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

      {endTermOfficer && (
        <EndTermModal
          type={type}
          officer={endTermOfficer}
          onClose={() => setEndTermOfficer(null)}
          onSuccess={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {showOfficerHistory && (
        <OfficerHistoryModal
          history={organization?.officer_history || []}
          onClose={() => setShowOfficerHistory(false)}
        />
      )}
    </PageLayout>
  );
}

export default OrganizationDetailPage;
