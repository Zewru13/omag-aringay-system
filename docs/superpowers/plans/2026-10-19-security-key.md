# Security Key for Bulk Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One shared security key, chosen by OMAg, that every bulk operation (today: the RSBSA import undo) must be given each time, so a hacker inside an account cannot wipe data in bulk.

**Architecture:** A hashed key and an attempt log in the `core` app; one reusable permission/check (`require_security_key`) that bulk views call; a small admin page to set or change the key; an axios handler that turns the server's "key needed" answers into a prompt and repeats the request once with the `X-Security-Key` header.

**Tech Stack:** Django 5.2 + DRF (`oma_aringay/core`), React 19 + Vite + Tailwind (`oma-frontend`), Django `TestCase`/`APITestCase`, `node --test` for frontend helpers.

**Spec:** `docs/superpowers/specs/2026-10-19-import-undo-and-security-key-design.md` (Part A). Part B (undo for the other imports) is a separate plan that uses this key.

## Global Constraints

- Header name `X-Security-Key`. Refusals are HTTP 403 with JSON `{"detail": str, "code": one of "security_key_required" | "security_key_invalid" | "security_key_not_set" | "security_key_locked", "retry_after": seconds (only for locked)}`.
- One shared key. Stored only as a salted hash (`django.contrib.auth.hashers`). Never returned by any endpoint, never logged.
- Lockout: **5** wrong keys by one account within **15 minutes** locks bulk operations for that account until the window clears. Every attempt is recorded (account, time, address, outcome).
- Only an **ADMIN** sets or changes the key; changing needs the current key. ADMIN and EVALUATOR may *use* it. Farmers, fisherfolk and organization accounts never reach a gated operation (the view's role check runs first).
- Not set yet: gated operations are refused with `security_key_not_set` (fail closed).
- The key is asked **every time** and never stored in the browser (not localStorage, not memory beyond the one retried request).
- Forgotten key: `python manage.py reset_security_key` (server access).
- Single-record deletes are **not** gated. No existing table changes: one additive migration in `core`.
- Plan rulings (spec is silent): the key is trimmed of surrounding spaces when set and when checked; minimum length **8** characters; a wrong key sent while no key is set is not counted as a failed attempt.
- Tests run on a throwaway MariaDB (never the live Supabase database); recipe in memory `browser-check-recipes` / `working-agreements-and-pr-state`, runner `runsec2.sh` in the old scratchpad. Commit after each task; do not push or run anything against the live database.

## Review Focus

1. A key typed with leading/trailing spaces or unicode characters is stored and checked the same way both times — pinned in Task 1.
2. A locked account sending the *correct* key is still refused until the window clears — Task 1.
3. A wrong key while no key is set is not counted toward a lockout — Task 1.
4. A citizen (or any non-staff) calling a gated endpoint with any header gets the endpoint's normal 403 and can never probe the key — Task 3.
5. Changing the key to the same value, or with a wrong current key, leaves the old key working — Task 2.

---

### Task 1: Key storage, checking and lockout

**Files:**
- Modify: `oma_aringay/core/models.py` (add `SecuritySetting`, `SecurityKeyAttempt`)
- Create: `oma_aringay/core/security_key.py`, `oma_aringay/core/migrations/0007_securitysetting_securitykeyattempt.py` (via `makemigrations core`)
- Test: `oma_aringay/core/test_security_key.py`

**Interfaces:**
- Produces (`core/security_key.py`):
  - `MAX_FAILED = 5`, `LOCK_MINUTES = 15`, `MIN_LENGTH = 8`
  - `is_key_set() -> bool`
  - `set_key(raw: str, user) -> None` — raises `KeyAlreadySet` if one exists, `KeyTooShort` if under `MIN_LENGTH` after trimming
  - `change_key(current: str, new: str, user, request=None) -> None` — raises `WrongKey`/`KeyLocked` if the current key does not check out, `KeyTooShort`
  - `check_key(user, raw: str | None, request=None) -> KeyCheck` where `KeyCheck` is a dataclass `status: Literal['ok','required','invalid','not_set','locked']`, `retry_after: int = 0`. Records a `SecurityKeyAttempt` for `ok`, `invalid` and `locked` (not for `required` or `not_set`).
  - `reset_key(raw: str | None) -> None` — sets a new key, or clears it when `None`
- Models: `SecuritySetting(key_hash: CharField(255, blank), changed_by: FK User null SET_NULL, changed_at: DateTimeField null)` (single row, pk=1); `SecurityKeyAttempt(user FK null SET_NULL, at: DateTimeField(auto_now_add, db_index), success: bool, status: CharField(12), ip_address: GenericIPAddressField null)`.

- [ ] **Step 1: Write the failing tests** in `core/test_security_key.py::KeyCoreTests`: `test_not_set_until_a_key_is_set`; `test_set_then_check_ok_and_wrong`; `test_the_key_is_stored_hashed_never_plain` (the stored `key_hash` does not contain the key and starts with a Django hasher prefix); `test_surrounding_spaces_are_ignored_when_setting_and_checking` (`"  my-key-1234  "` set, `"my-key-1234"` checks ok); `test_unicode_keys_work`; `test_a_key_under_8_characters_is_refused`; `test_setting_twice_is_refused`; `test_missing_key_is_required_not_invalid` (`raw=None` or blank → `required`, no attempt row); `test_five_wrong_keys_lock_the_account` (6th call → `locked`, `retry_after` between 1 and 900); `test_a_locked_account_with_the_correct_key_is_still_refused`; `test_the_lock_clears_after_fifteen_minutes` (move the attempt times back 16 minutes); `test_lockout_is_per_account` (a second user is unaffected); `test_a_wrong_key_while_none_is_set_is_not_a_failed_attempt` (status `not_set`, zero rows); `test_change_key_needs_the_current_key` (wrong current → old key still ok; same value as new is accepted and still works); `test_each_attempt_records_user_outcome_and_address`.
- [ ] **Step 2: Run** `python manage.py test core.test_security_key --noinput` from `oma_aringay`. Expected: all fail (module missing).
- [ ] **Step 3: Implement** the models and `core/security_key.py` per the Interfaces. Hash with `make_password`/`check_password`; lockout counts `SecurityKeyAttempt` rows with `success=False` and `status='invalid'` for that user in the last `LOCK_MINUTES`; `retry_after` = seconds until the oldest of the last `MAX_FAILED` failures leaves the window. Run `python manage.py makemigrations core` and keep the generated file.
- [ ] **Step 4: Run** the same command. Expected: all pass. Also run one mutation check: change `MAX_FAILED` to 99 and confirm `test_five_wrong_keys_lock_the_account` fails, then restore.
- [ ] **Step 5: Commit** `git add oma_aringay/core && git commit -m "Security key: storage, checking and lockout"`.

### Task 2: Set / change endpoints and the reusable check

**Files:**
- Create: `oma_aringay/core/security_key_views.py`
- Modify: `oma_aringay/core/security_key.py` (add `SecurityKeyRequired`, `require_security_key`), `oma_aringay/core/urls.py`
- Test: `oma_aringay/core/test_security_key.py::KeyEndpointTests`

**Interfaces:**
- Consumes: Task 1 functions.
- Produces:
  - `require_security_key(request) -> None` — reads `request.headers.get('X-Security-Key')`, calls `check_key(request.user, ..., request)`, raises `SecurityKeyRequired` (an `APIException`, status 403, `detail` = the JSON body from Global Constraints) unless `ok`. Messages: required → "Enter the security key to do this."; invalid → "That security key is not correct."; not_set → "Ask the administrator to set the security key first."; locked → "Too many wrong keys. Try again in N minutes."
  - `class RequiresSecurityKey(BasePermission)` whose `has_permission` calls `require_security_key` (for views that gate every method).
  - `GET /api/security/key/` → `{"is_set": bool, "changed_at": iso|null}` (ADMIN, EVALUATOR). `POST /api/security/key/` body `{"key": str, "current_key": str?}` (ADMIN only): first time sets; if a key exists, `current_key` is required and checked; 400 on too short.

- [ ] **Step 1: Write the failing tests** (`KeyEndpointTests`, `APITestCase`): `test_status_is_visible_to_staff_but_never_shows_the_key`; `test_citizen_cannot_read_or_set`; `test_evaluator_cannot_set_or_change`; `test_admin_sets_the_first_key`; `test_setting_a_short_key_is_400`; `test_changing_needs_the_current_key` (missing → 403 `security_key_required`, wrong → 403 `security_key_invalid`, right → 200 and the new key checks ok, the old one no longer does); `test_require_security_key_bodies` (a throwaway view calling `require_security_key` returns exactly the four `code` values and `retry_after` for locked).
- [ ] **Step 2: Run** `python manage.py test core.test_security_key --noinput`. Expected: the new tests fail.
- [ ] **Step 3: Implement** `SecurityKeyRequired`, `require_security_key`, `RequiresSecurityKey`, the view and the route `path('security/key/', ...)` in `core/urls.py`. Confirm the body reaches the client unchanged through `core/exception_handler.py` (adjust the handler only if it rewrites `APIException` bodies).
- [ ] **Step 4: Run** the same command. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "Security key: set/change endpoints and require_security_key"`.

### Task 3: Gate the RSBSA import undo

**Files:**
- Modify: `oma_aringay/farmers/rsbsa_import_undo.py` (`RsbsaImportUndoView.post`)
- Modify (existing tests that execute an undo): every test that POSTs `records` to `/api/farmers/rsbsa-import/batches/<id>/undo/` — find them with `grep -rn "batches/.*undo" oma_aringay --include=test*.py`
- Test: `oma_aringay/farmers/test_rsbsa_undo_key.py`

**Interfaces:** Consumes `require_security_key(request)` from Task 2.

- [ ] **Step 1: Write the failing tests** (`RsbsaUndoKeyTests`): `test_the_preview_does_not_need_the_key` (`dry_run: true` returns the plan with no header); `test_executing_without_a_key_is_refused` (403 `security_key_required`, nothing deleted); `test_executing_with_a_wrong_key_is_refused_and_counted`; `test_executing_with_the_right_key_works`; `test_executing_while_no_key_is_set_is_refused` (`security_key_not_set`); `test_a_citizen_gets_the_normal_403_whatever_the_header` (the role check runs before the key check).
- [ ] **Step 2: Run** `python manage.py test farmers.test_rsbsa_undo_key --noinput`. Expected: fail.
- [ ] **Step 3: Implement**: in `RsbsaImportUndoView.post`, call `require_security_key(request)` only on the execute branch (the branch that reads `records`), after the existing role/ownership checks. Update the existing undo tests to `set_key` in `setUp` and send `HTTP_X_SECURITY_KEY`.
- [ ] **Step 4: Run** `python manage.py test farmers core --noinput`. Expected: all pass.
- [ ] **Step 5: Commit** `git commit -m "Gate the RSBSA import undo with the security key"`.

### Task 4: `reset_security_key` command

**Files:**
- Create: `oma_aringay/core/management/__init__.py`, `core/management/commands/__init__.py`, `core/management/commands/reset_security_key.py`
- Test: `oma_aringay/core/test_security_key.py::ResetCommandTests`

**Interfaces:** Consumes `reset_key`. Command: `python manage.py reset_security_key` prompts twice (`getpass`) for a new key; `--clear` removes the key (bulk operations are then blocked until an Admin sets one); `--key` is **not** supported (keys must not appear in shell history).

- [ ] **Step 1: Write the failing tests**: `test_reset_sets_a_new_key_and_the_old_one_stops_working` (patch `getpass.getpass` to return the new key twice); `test_mismatched_entries_change_nothing`; `test_clear_blocks_bulk_operations`; `test_reset_also_clears_lockouts` (a locked account can use the new key).
- [ ] **Step 2: Run** the tests. Expected: fail.
- [ ] **Step 3: Implement** the command (`BaseCommand`); `reset_key` also deletes that table's failed-attempt rows so a reset ends a lockout.
- [ ] **Step 4: Run** the tests. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Security key: reset_security_key command"`.

### Task 5: Frontend prompt and axios handler

**Files:**
- Create: `oma-frontend/src/utils/securityKey.js`, `oma-frontend/src/components/SecurityKeyHost.jsx`
- Modify: `oma-frontend/src/api/axiosInstance.js`, the app shell that mounts global components (the same place `ToastProvider` children render; find with `grep -n "ToastProvider" oma-frontend/src/main.jsx oma-frontend/src/App.jsx`)
- Test: `oma-frontend/tests/securityKey.test.mjs`

**Interfaces:**
- Produces (`utils/securityKey.js`): `SECURITY_KEY_CODES` (the four codes); `isSecurityKeyRefusal(error) -> {code, detail, retryAfter} | null` (true only for HTTP 403 with one of the codes); `setSecurityKeyPrompter(fn | null)`; `askForSecurityKey({code, detail, retryAfter}) -> Promise<string | null>` (null when cancelled or no prompter registered); `nextAttemptAllowed(code) -> boolean` (false for `security_key_not_set` and `security_key_locked`, true otherwise); `retryWithKey(api, originalConfig, key)` sets `originalConfig.headers['X-Security-Key']` and re-sends.
- `SecurityKeyHost` renders a modal (password input, "Confirm", "Cancel", shows the refusal text; for `not_set` shows the message and, for admins, a link to `/security-key`; for `locked` shows the wait and no input).

- [ ] **Step 1: Write the failing tests** (`securityKey.test.mjs`): `isSecurityKeyRefusal` is non-null only for 403 + a known code (not 403 with another body, not 401); `nextAttemptAllowed` per code; `askForSecurityKey` resolves `null` with no prompter and resolves the prompter's value otherwise; `retryWithKey` adds the header and does not mutate other headers; the key is not kept anywhere after the call (module exposes no getter).
- [ ] **Step 2: Run** `npm test` in `oma-frontend`. Expected: the new file fails (module missing).
- [ ] **Step 3: Implement** the helpers and `SecurityKeyHost`; in `axiosInstance.js`'s response error branch, after the 401 branch: if `isSecurityKeyRefusal(error)` and the request has not already been retried with a key, loop: `askForSecurityKey` → if null reject with the original error; else `retryWithKey`; on another `security_key_invalid` ask again showing "That key is not correct" until cancelled or locked. Mount `SecurityKeyHost` once in the app shell and register its prompter in an effect (cleanup sets `null`).
- [ ] **Step 4: Run** `npm test`, `npx eslint` on the changed files (compare error counts with `origin/master`; only pre-existing findings allowed), `npx vite build`. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Security key: prompt and request handler"`.

### Task 6: Admin page "Security Key"

**Files:**
- Create: `oma-frontend/src/pages/Admin/SecurityKeyPage.jsx`, `oma-frontend/src/utils/securityKeyForm.js`
- Modify: `oma-frontend/src/App.jsx` (route `/security-key`, `ProtectedRoute allowedRoles={["ADMIN"]}`), `oma-frontend/src/components/Layout/Sidebar.jsx` (`ADMIN_GROUP` item `{ to: "/security-key", icon: KeyRound, label: "Security Key" }`)
- Test: `oma-frontend/tests/securityKeyForm.test.mjs`

**Interfaces:** `validateNewKey({key, confirm}) -> string` (error text or `''`: required; at least 8 characters after trimming; the two entries must match). The page: shows "No key set / Key set on <date>"; when none: form (new key + confirm) → `POST /security/key/`; when set: form (current key, new key, confirm) → `POST` with `current_key`. Wrong current key surfaces the server's message; the form never prefills or shows the key.

- [ ] **Step 1: Write the failing tests** for `validateNewKey` (blank, 7 characters, spaces-only, mismatch, valid with surrounding spaces).
- [ ] **Step 2: Run** `npm test`. Expected: fail.
- [ ] **Step 3: Implement** the helper, page, route and sidebar item (icon `KeyRound` from `lucide-react`).
- [ ] **Step 4: Run** `npm test`, eslint comparison, `npx vite build`. Expected: pass.
- [ ] **Step 5: Commit** `git commit -m "Security key: admin page"`.

### Task 7: Verify end to end and prepare delivery

- [ ] **Step 1:** Full backend suite on the throwaway MariaDB (`python manage.py test --keepdb --noinput`); every test passes.
- [ ] **Step 2:** Real-browser check on the throwaway stack (Django :8001, Vite :5174): as admin set a key on `/security-key`; run an RSBSA import commit then "Undo this import" → the key box appears; wrong key → "not correct"; 5 wrong → locked message; right key → undo works; change the key with a wrong current key → refused. Report anything not checked.
- [ ] **Step 3:** Write the live-database SQL for the two new tables (read the migration, translate to PostgreSQL `create table` plus the `django_migrations` row for `core 0007_securitysetting_securitykeyattempt`); save it as `docs/superpowers/plans/2026-10-19-security-key-live-db.sql` and include it in the PR description. **Do not run it.** The user runs it in the Supabase SQL editor on project `omag-aringay` (ref `zqvemhtzrccbofvwneph`) before merging.
- [ ] **Step 4:** Open the pull request (only when the user says so). Update the memory note `visits-links-security-key-plan`.
