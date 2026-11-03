# Report signatories (saved officials + four-role picker)

Source of the idea: the BasaJuan capstone manuscript (`chap 1-4 RENEvise.docx`), Appendix I User Manual, "8. Reports" (Signatories block) and "Utilities → Manage Signatories". Only that part is copied; the on-page paper preview, the "selected report" box and the report history log were offered and **not** chosen.

## Intent

Today every report's PDF/Excel asks for the signature names in a pop-up, typed again each time, with only Prepared / Reviewed / Noted by; Print carries no signatures at all. The Admin should keep one saved list of officials, and every report should pick its signers from that list.

Success: an officer opens any of the six reports, sees a Signatories block above the buttons, picks the four signers (or leaves them empty), and Print, Preview PDF and Download Excel all carry exactly those signers.

## Decisions (agreed with the user 2026-11-03)

- Scope: saved signatories + four-role picker only.
- Placement: on the page above Print / Preview PDF / Download Excel (not in a pop-up). The typing pop-up (`SignatureModal`) is removed.
- Delivery: PR A (table, API, Manage Signatories page), PR B (picker + four-slot PDF block on all six reports), PR C (User Manual + Help text). Each from `origin/master`, never stacked.

## Data

`reports.Signatory` (the `reports` app has no models yet, so this is its first migration, `reports 0001_signatory`):

| field | type | note |
| --- | --- | --- |
| `name` | CharField(150) | required |
| `position` | CharField(150) | printed under the name; may be blank |
| `role` | CharField, choices `prepared`, `checked`, `noted`, `approved` | one role per row; the same person twice if they sign in two roles |
| `sort_order` | PositiveIntegerField, default 0 | order inside its dropdown |
| `is_active` | BooleanField, default True | inactive rows are not offered in the dropdowns |

Ordering: `role`, `sort_order`, `name`. Live DB: the table needs `enable row level security` plus the `django_migrations` row (user runs the SQL; I verify read-only).

## API

- `GET /reports/signatories/` — any authenticated user who can use Reports; returns active rows (`id, name, position, role, sort_order`). `?all=1` also returns inactive rows (Admin only; used by the manage page).
- `POST /reports/signatories/`, `PUT|PATCH|DELETE /reports/signatories/<id>/` — Admin only.
- Report endpoints (`format=pdf|excel`) keep today's query parameters (`prepared_by`, `prepared_role`/`position`, `reviewed_by`, `reviewed_role`, `noted_by`, `noted_role`) and gain `approved_by`, `approved_role`. The `reviewed_*` pair is the **Checked by** slot (label change only; URL unchanged so old links keep working).

## Manage Signatories page (Admin menu, admin-only, `/signatories`)

Sidebar entry beside Backup. Table: name, position, role, order, active. Add / Edit / Delete in the existing `ModalShell` style, row actions in the usual ⋮ menu. Empty state explains that the Reports pages offer these names.

## Picker on the six reports (PR B)

A `SignatoriesPanel` in `pages/Reports/ReportParts.jsx` plus a `useSignatories()` hook:

- Four dropdowns: Prepared by, Checked by, Noted by, Approved by, each listing the active signatories of that role in order.
- Prepared by defaults to "me" (logged-in user's full name, role label as position); Checked / Noted / Approved default to "None".
- Help text: "Filled in from Manage Signatories. Change a line here for this printout only." (Selection is not saved; it resets per page visit.)
- Print, Preview PDF and Download Excel all append the chosen signers to the report URL through one helper, `signatureParams(selection)`; the six tabs stop building those params by hand.

## PDF signature block

`build_signature_block` grows from three slots to up to four, in the order Prepared | Checked | Noted | Approved, omitting empty slots. If neither Noted nor Approved is chosen, the existing "Certified by: MUNICIPAL AGRICULTURIST" column stays, so printouts without the new picks do not change. "Reviewed by" is relabelled "Checked by".

## Testing

- Backend: model/serializer; permissions (staff read, only Admin writes, active filter, `?all=1` Admin only); `build_signature_block` with 1, 2, 3 and 4 signers and the fallback; one report endpoint end to end with `approved_by`.
- Frontend (`node --test`): `signatureParams` with every combination, defaults for "me".
- Browser check on the throwaway stack at desktop and 390px: Manage Signatories add/edit/delete, picker on all six reports, Print/PDF output.
- Existing tests that pin "Reviewed by" are updated to "Checked by".

## Out of scope

On-page paper preview, "selected report" summary box, report history log, remembering picks between visits, per-user signature defaults.
