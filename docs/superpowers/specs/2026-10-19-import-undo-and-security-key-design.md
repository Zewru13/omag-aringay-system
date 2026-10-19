# Undo for every import, and a security key for bulk operations

Status: draft for review (2026-10-19). Nothing in this document is built yet.

## 1. What was asked, and what was decided

OMAg wants "Undo a recent import" on **every** import file in the system, not just the RSBSA registry import, and
wants a rule so that a hacker who gets into an account cannot wipe data in bulk through it.

Decisions from the user:

| Question | Decision |
|---|---|
| Which operations need the secret key? | Only **bulk** ones, like "undo an import". Deleting a single record does not need it. |
| Until a key has been set | Bulk operations are **blocked** (fail closed). |
| Forgotten key | A developer with server access resets it with a command. |
| Who may undo an import | OMAg staff: **Admins and Evaluators**. Farmers, fisherfolk and organization accounts never. |
| Who sets or changes the key | **Admins** only. |

The key is chosen by OMAg and known to its staff. It is shared, not per person.

## 2. Part A: the security key

### Behaviour

- One key for the whole system. It is stored only as a salted hash (Django's password hasher). Nobody, including the
  developers, can read it back.
- Every bulk operation asks for the key **each time**. The key is never stored in the browser. Wrong keys are refused.
- Today the only bulk operations are the import undos (the existing RSBSA undo and the new ones below). The rule is a
  single reusable check, so a bulk operation added later opts in with one line.
- **Lockout:** 5 wrong keys by one account within 15 minutes locks bulk operations for that account for 15 minutes.
  Every attempt (success or failure, who, when, from which address) is recorded.
- **Not set yet:** the operation is refused with the message "Ask the administrator to set the security key first". An
  Admin sees a link to set it up.
- **Changing the key:** Admin only, and the current key is required. **Setting it the first time:** Admin only.
- **Forgotten:** `python manage.py reset_security_key` (needs server access) sets a new key or clears it.

### Parts

- Model `SecuritySetting` (one row: key hash, who and when it was last changed) and `SecurityKeyAttempt` (user, time,
  address, success), both in the `core` app.
- Permission class `RequiresSecurityKey`: reads the `X-Security-Key` header, checks the hash, applies the lockout, and
  answers `403` with a `code` of `security_key_required`, `security_key_invalid`, `security_key_not_set` or
  `security_key_locked` (plus `retry_after`).
- Endpoints: `GET /api/security/key/` (is a key set, Admin and staff) and `POST /api/security/key/` (set or change).
- Frontend: an axios response handler turns those `403` codes into a small "Enter the security key" box, then repeats
  the request once with the header. A new Admin page, "Security Key", sets or changes it.

### Honest limits

The key protects the application: its buttons and its API. It does not protect against someone who already has your
Supabase or Render passwords, or the server itself. Those still need strong passwords and two-step sign-in.

## 3. Part B: undo for every import

### What gets undone

The RSBSA registry import already has undo (`farmers/rsbsa_import_undo.py`). Seven more imports get it:

| Import | What it adds when committed | What undo does |
|---|---|---|
| Crop records | planting records | removes the ones nobody has touched and nothing depends on |
| Farmers organizations | organizations, and a login for each one that has an email | removes the organization; removes the login only if it was never used |
| Fisherfolk organizations | same | same |
| Organization members (both kinds) | member rows, and it **deactivates** the person's previous membership | removes the new member rows and **reactivates** the memberships it deactivated, if nothing changed them since |
| Organization equipment (both kinds) | equipment lines | removes untouched lines |
| Crop assistance | assistance records | removes untouched records |
| Fisheries assistance | assistance records | removes untouched records |
| Stocking (forecasting import) | stocking records | removes untouched records |

### The safety rule (same as the RSBSA undo)

A record the import added is removed **only if all of these are true**: nobody has edited it since (it still matches a
fingerprint taken when the import ran); nothing else depends on it (checked with Django's own delete collector, so it
cannot drift from the real relations); and any login the import created was never activated or used. Anything else is
**kept**, and the screen shows the reason. Deleting a record that already has activity attached would destroy real data.

Things undo cannot take back, and the screen says so: emails already sent, and notifications already delivered.

### How the system remembers an import

Two new shared tables, written inside the same database transaction as the import so they cannot disagree with it:

- `ImportBatch`: id, import type, who ran it, when, how many rows, when (and by whom) it was undone.
- `ImportBatchItem`: batch, the table and id of the record added, the action (created, or "deactivated" for the member
  import's side effect), and the fingerprint described above.

Imports done **before** this ships were not tracked and cannot be undone. The RSBSA registry import keeps its own log.

### Undo flow

1. In an import's dialog, "Undo a recent import" lists that import type's batches from the last 30 days.
2. Choosing one shows a **preview**: how many records can be removed and which are kept, with reasons. Nothing changes yet.
3. Confirming asks for the **security key**, then runs the undo in slices of 100 records so a large batch cannot time
   out. Running it again after an interruption is safe: a record already undone is skipped.

Endpoints: `GET /api/imports/batches/?type=`, `GET /api/imports/batches/<id>/undo-plan/`,
`POST /api/imports/batches/<id>/undo/` (key required). Admin and Evaluator only.

## 4. Database changes

One additive migration in `core`: four new tables (`SecuritySetting`, `SecurityKeyAttempt`, `ImportBatch`,
`ImportBatchItem`). No existing table changes. As with the PCIC change: the SQL is applied to the live
`omag-aringay` Supabase project **before** the code is merged, and I give you the exact script.

## 5. Testing

- Key: set, change (needs the current key), wrong key, lockout and its expiry, not-set refusal, Admin-only setup,
  Evaluator can use but not set it.
- Each of the eight imports: a batch is recorded on commit; undo removes untouched records; edited or depended-on
  records are kept with a reason; undo twice changes nothing more; farmers, fisherfolk and organization accounts are
  refused; a missing or wrong key is refused.
- Member import: the deactivated membership comes back; if someone changed it since, it is left alone.
- Frontend: key prompt flow and the shared undo panel in the real browser.

## 6. Delivery

Two pull requests, so each can be reviewed and rolled back on its own:

1. **Security key** (Part A), including gating the existing RSBSA undo.
2. **Undo for the seven other imports** (Part B), which uses the key.

## 7. Out of scope

Deleting a single record (not key-gated, per the decision above); imports done before this ships; protecting the
database or server directly.
