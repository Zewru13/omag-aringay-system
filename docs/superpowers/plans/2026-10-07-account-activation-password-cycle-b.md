# Cycle B — Account Activation, Emailed Default Password, Password Policy: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organization added (or imported) with an email gets an active account and an emailed temporary password (no link); passwords people choose need 1 capital, 1 special character and 3 numbers (minimum length 8); the default password is short and simple, forced to change at first login, and expires.

**Architecture:** One new Django password validator and a rewritten password generator; one nullable `User.temp_password_expires_at` field checked in `LoginView`; one helper `activate_and_email_organization` called by the two organization create views and the organization import; the existing `PasswordRequirementChecklist` is updated from a pure `utils/passwordRules.js`. Admin and Focal Person (Evaluator) creation, link verification and email are untouched.

**Tech Stack:** Django 4.2 + DRF, Django mail (`accounts.utils._send` hybrid fallback), React, Vite.

**Spec:** `docs/superpowers/specs/2026-10-07-account-activation-password-cycle-b-design.md`

## Global Constraints

- Policy: at least 1 capital letter, at least 1 special character (not a letter or digit), at least 3 digits; minimum length 8; maximum 128; common-password, local-denylist, numeric-only and user-attribute-similarity validators stay.
- Temporary password format: capitalised word from a fixed fish/crop list (4-6 letters, none containing a `LOCAL_DENYLIST_TERMS` entry) + one of `#@!$%` + 4 digits, e.g. `Bangus#4827`; generated with `secrets`.
- `TEMP_PASSWORD_VALID_DAYS` = 7 (setting, env override), in both `settings.py` and `settings_production.py`.
- Expired temporary password: HTTP 403, `code: 'temp_password_expired'`, `detail: 'This temporary password has expired. Ask the Office of the Municipal Agriculturist for a new one.'`, checked only AFTER the password is verified.
- The organization email contains the password and NO link; the API never returns the password when the email was sent; the password is never logged.
- Admin/Focal Person creation (`UserCreateView`), `VerifyEmailView` and the verification link stay as they are. Farmers and fisherfolk keep staff-witnessed "Set Up Account".
- `User.Roles.EVALUATOR` label becomes `'Focal Person'` (stored value unchanged).
- Never test against Supabase, never start XAMPP's MySQL service; use the throwaway stack below. Commit only when the user says so; no push.

## Review Focus

1. Two organizations imported in one file where one email fails: the other is still activated and emailed; the failed one's password is returned once. (Task 3)
2. An organization email equal to an existing user's email: `User.email` stays empty, nothing collides, mail goes to the organization's `email_address`. (Task 3)
3. A password whose only "special" or "capital" characters are non-ASCII (é, emoji, Ñ): non-ASCII uppercase letters count as capitals; symbols and emoji count as special; letters never count as special. (Task 1)
4. A wrong password on an expired account answers "Incorrect password", never the expired message. (Task 2)
5. Regenerating an active organization's password: the old password stops working and old tokens are revoked exactly as the staff password change does (`_blacklist_outstanding_tokens`). (Task 2)

## Harness (Tasks 1-3 backend; Task 4 also needs the browser stack)

Same recipe as cycle A: throwaway MariaDB on port 3307 from a scratch datadir (`D:\xampp\mysql\bin\mysql_install_db.exe --datadir=<scratch>\mdb`, then `mysqld.exe --no-defaults --datadir=<scratch>\mdb --port=3307 --skip-grant-tables --standalone --bind-address=127.0.0.1`, database `oma_aringay_db` utf8mb4); `<scratch>\mysqlplain.py` exists; tests run from `oma_aringay/` with `DB_BACKEND=mysql PYTHONPATH=<scratch> ../.venv/Scripts/python.exe manage.py test <labels> --settings=mysqlplain --noinput`. Mail in tests uses Django's locmem outbox (`django.core.mail.outbox`); because `settings.SMTP_CONFIGURED` is false in tests, tests that need a "sent" result use `@override_settings(SMTP_CONFIGURED=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')`. Browser stack: `migrate`, seed via the existing `seed_org.py`/`seed_fix.py` (admin, evaluator, farmer, fisherfolk, organizations; short-lived tokens in `org_tokens.json`), `runserver 127.0.0.1:8001 --settings=mysqlplain --noreload`, `VITE_API_URL=http://127.0.0.1:8001/api npx vite --port 5174 --strictPort`. Cleanup at the end: clear browser localStorage, stop the three processes, delete scratch `mdb`, test media and token file. In the browser use read-only checks except against this throwaway database.

## File Structure

- Backend modified: `accounts/validators.py`, `accounts/models.py` (field + label), `accounts/utils.py`, `accounts/views.py`, `accounts/management/commands/reset_admin_password.py` (prompt text), `oma_aringay/settings.py`, `oma_aringay/settings_production.py`, `associations/views.py`. New: `accounts/migrations/0014_user_temp_password_expires_at.py`.
- Backend new tests: `accounts/test_password_policy.py`, `accounts/test_temp_password.py`, `associations/test_org_activation.py`.
- Frontend new: `utils/passwordRules.js`. Modified: `components/UI/PasswordRequirementChecklist.jsx`, `pages/Auth/ForceChangePasswordPage.jsx`, `pages/Profile/ProfilePage.jsx`, `pages/Citizen/CitizenProfileScreen.jsx`, `pages/Citizen/OrgAccountPages.jsx`, `pages/Login/LoginPage.jsx`, `pages/Organizations/CreateOrganizationModal.jsx`, `components/ImportFileModal.jsx`, `components/ActivateCitizenAccountButton.jsx` (regenerate result copy only if it mentions the old password style).

---

### Task 1: Password policy (validator, settings, command text)

**Files:**
- Modify: `oma_aringay/accounts/validators.py`, `oma_aringay/oma_aringay/settings.py`, `oma_aringay/oma_aringay/settings_production.py`, `oma_aringay/accounts/management/commands/reset_admin_password.py`
- Test: `oma_aringay/accounts/test_password_policy.py` (new)

**Interfaces:**
- Produces: `accounts.validators.CompositionPasswordValidator` with `validate(self, password, user=None)` and `get_help_text(self)`. It raises ONE `ValidationError` carrying a list of messages, one per missing part: `'Add at least 1 capital letter.'`, `'Add at least 1 special character.'`, `'Add at least 3 numbers.'` (codes `password_no_capital`, `password_no_special`, `password_few_digits`). Capital = `str.isupper()` character; digit = `str.isdigit()` ASCII or Unicode decimal (`unicodedata.category == 'Nd'`); special = any character that is neither alphanumeric (`str.isalnum()`) nor whitespace.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing tests** in `test_password_policy.py` (`SimpleTestCase`, calling `django.contrib.auth.password_validation.validate_password` so the real settings list is exercised): `test_accepts_all_parts` (`'Maganda#2024x'` passes); `test_missing_capital_message` (`'maganda#2024x'` → exactly `['Add at least 1 capital letter.']`); `test_missing_special_message`; `test_two_digits_is_not_enough` (`'Maganda#20xx'` → the numbers message; `'Maganda#202x'` passes); `test_all_three_missing_lists_three_messages` (`'maganda'`... use `'abcdefghij'` → three messages in that order, besides no length error); `test_minimum_length_is_eight` (`'Ab#123'` fails length; `'Ab#12345'` passes; confirm the old 15-char floor is gone); `test_non_ascii_capital_and_special` (`'Ñandu€123'` passes: Ñ counts as capital, € as special); `test_emoji_counts_as_special` (`'Maganda😀2024'` passes); `test_letters_are_not_special` (`'Éclair2024x'` fails only the special rule); `test_space_is_not_special` (`'Maganda 2024'` fails the special rule); `test_denylist_still_applies` (`'Aringay#2024x'` still fails the local denylist); `test_passphrase_still_works` (`'Correct Horse Battery #1 2 3'` passes).
- [ ] **Step 2: Run** `manage.py test accounts.test_password_policy`. Expected: FAIL (validator missing, floor still 15).
- [ ] **Step 3: Implement** the validator in `accounts/validators.py`; add it to `AUTH_PASSWORD_VALIDATORS` after the length validators in both settings files and change `MinimumLengthValidator` `min_length` to 8; update the comment above both lists to say the policy is now length 8 + composition + denylist (replace the old "no forced composition rules" text); change the `reset_admin_password` prompt to `'New password (min 8 characters, with a capital letter, a special character and 3 numbers): '`.
- [ ] **Step 4: Run** the new test module. Expected: all PASS.
- [ ] **Step 5: Mutation check:** change the digit threshold in the validator to 2 and confirm `test_two_digits_is_not_enough` fails; restore. Ledger it.
- [ ] **Step 6: Run the whole suite** (`manage.py test --settings=mysqlplain --noinput`). Expected: OK (existing tests do not validate chosen passwords; any failure is reported by name and fixed).

---

### Task 2: Temporary password (generator, expiry, login check, reissue flows)

**Files:**
- Modify: `accounts/models.py`, `accounts/utils.py`, `accounts/views.py`, `oma_aringay/settings.py`, `oma_aringay/settings_production.py`
- Create: `accounts/migrations/0014_user_temp_password_expires_at.py` (generated with `makemigrations accounts`; it also carries the role-label choices change)
- Test: `accounts/test_temp_password.py` (new)

**Interfaces:**
- Produces: `settings.TEMP_PASSWORD_VALID_DAYS` (int, default 7); `User.temp_password_expires_at = DateTimeField(null=True, blank=True)`; `User.Roles.EVALUATOR = 'EVALUATOR', 'Focal Person'`.
  `accounts.utils.generate_default_password() -> str` (new format, always passes `validate_password`); `accounts.utils.issue_temporary_password(user) -> str` — generates a password, `user.set_password`, sets `must_change_password=True` and `temp_password_expires_at = now + TEMP_PASSWORD_VALID_DAYS`, calls `user.save()` and returns the plain password (does not touch `is_active`); `accounts.utils.temp_password_expired(user) -> bool` (true only when `must_change_password` and an expiry in the past).
- Consumes: Task 1's policy (the generator output is validated against it in tests).

- [ ] **Step 1: Write the failing tests** in `test_temp_password.py` (`APITestCase`): `test_generated_password_matches_format_and_policy` (200 generations each match `^[A-Z][a-z]{3,5}[#@!$%]\d{4}$` and pass `validate_password`; at least 20 distinct values); `test_wordlist_avoids_local_denylist` (no word contains a `LOCAL_DENYLIST_TERMS` entry); `test_issue_sets_flag_and_expiry` (expiry within a minute of now + 7 days, `must_change_password` True, password checks); `test_login_with_unexpired_temp_password_succeeds`; `test_login_with_expired_temp_password_is_refused` (403, code `temp_password_expired`, exact detail text; the account's `is_active` stays True); `test_wrong_password_on_expired_account_says_incorrect` (401 `Incorrect password.`); `test_account_without_expiry_is_unaffected` (an existing-style user with `must_change_password=True` and no expiry logs in); `test_change_password_clears_expiry_and_flag` (POST `/api/accounts/change-password/` with a policy-passing new password → `temp_password_expires_at` None, `must_change_password` False; and a policy-failing new password returns 400 with the three composition messages when absent); `test_set_up_account_issues_expiring_password` (staff POST on a shell → returned `generated_password` matches the format, expiry set, active); `test_regenerate_sets_new_expiry_and_flag_and_revokes_tokens` (an active citizen with an outstanding refresh token: after regenerate the old password fails, `must_change_password` True, expiry set, the old refresh token is blacklisted — use `rest_framework_simplejwt.token_blacklist.models.BlacklistedToken`); `test_staff_creation_still_emails_link_and_password` (admin POST `/api/accounts/users/` with the locmem backend and `SMTP_CONFIGURED=True`: outbox body contains `verify-email?token=` AND `Temporary password: ` matching the new format; user inactive until verified); `test_focal_person_label` (`User.Roles.EVALUATOR.label == 'Focal Person'`).
- [ ] **Step 2: Run** `manage.py test accounts.test_temp_password`. Expected: FAIL (field, generator format, expiry check missing).
- [ ] **Step 3: Implement** in `accounts/utils.py`: a module constant `_WORDS` (at least 30 words, each 4-6 letters, capitalised, fish and crop names such as Bangus, Dalag, Hipon, Tahong, Palay, Mais, Saging, Kamote, Mangga, Okra; `test_wordlist_avoids_local_denylist` and the format regex are what check the list), special set `'#@!$%'`; new `generate_default_password`; `issue_temporary_password`; `temp_password_expired`. In `accounts/models.py` add the field and change the role label. Add `TEMP_PASSWORD_VALID_DAYS` to both settings files next to `EMAIL_VERIFICATION_TOKEN_HOURS`. In `accounts/views.py`: `LoginView` — after the `check_password` branch and before the email-verification branch, `if temp_password_expired(db_user): return 403 {detail, code}`; `ChangePasswordView` — also set `temp_password_expires_at = None`; `UserCreateView` — keep `generate_default_password()` and additionally set `must_change_password=True` already there plus `temp_password_expires_at` through the same expiry rule; `SetCitizenPasswordView` and `RegenerateCitizenPasswordView` — use `issue_temporary_password(user)`; Regenerate also calls `_blacklist_outstanding_tokens(user)` (same failure policy as `ChangePasswordView`: log, never raise) and updates its docstring (it now forces a change like Set Up does). Generate the migration with `makemigrations accounts` and keep only the field and choices operations.
- [ ] **Step 4: Run** the test module. Expected: all PASS.
- [ ] **Step 5: Mutation check:** move the expiry check in `LoginView` above `check_password` and confirm `test_wrong_password_on_expired_account_says_incorrect` fails; restore. Ledger it.
- [ ] **Step 6: Run the whole suite** and `manage.py makemigrations --check --settings=mysqlplain`. Expected: OK, "No changes detected".

---

### Task 3: Organization activation and emailed password (create and import)

**Files:**
- Modify: `accounts/utils.py`, `associations/views.py` (both `*OrganizationListCreateView.perform_create`, add a `create` override to each, and `_run_organization_import` call sites)
- Test: `associations/test_org_activation.py` (new)

**Interfaces:**
- Consumes (Task 2): `issue_temporary_password(user) -> str`.
- Produces: `accounts.utils.send_organization_credentials_email(org, plain_password, expires_at) -> (bool, str | None)` — subject `'Your OMA Aringay account is ready'`; body: organization name, `Login: <registration_number>` , `Temporary password: <password>`, the expiry date, a line to change the password at first login, the office contact line; NO URL. Sent to `org.email_address` through `accounts.utils._send`.
  `accounts.utils.activate_and_email_organization(record_type, org) -> dict` — returns `{'activated': False}` when `org.email_address` is blank or no inactive shell exists; otherwise sets the shell active with `issue_temporary_password`, sends the email after the save, and returns `{'activated': True, 'email_sent': bool, 'expires_at': iso8601, 'reason': str (only when not sent), 'default_password': str (only when not sent), 'login': registration_number}`. Never raises for mail failures.
  Create responses: both organization create endpoints return the normal serialized organization plus an `activation` key holding that dict. Import response: each created row gets `'activation'` (same dict, only for rows with an email), and the top level gains `'credentials_to_hand_over'`: a list of `{'row', 'label', 'login', 'default_password', 'expires_at', 'reason'}` for rows whose email failed (empty list otherwise).

- [ ] **Step 1: Write the failing tests** in `test_org_activation.py`, parametrised over both domains (`/api/organizations/farmers/` and `/api/organizations/fisherfolk/`), authenticated as an admin, with `@override_settings(SMTP_CONFIGURED=True, EMAIL_BACKEND=locmem)` unless stated: `test_create_with_email_activates_and_emails` (201; the linked citizen user is active, `must_change_password`, expiry about 7 days, `User.email` empty; outbox has 1 message to the organization email whose body contains the new-format password and no `http`; response `activation.email_sent` True and the password string appears nowhere in the response body; the emailed password logs in using the registration number as identifier); `test_create_without_email_keeps_inactive_shell` (`activation.activated` False; user inactive; outbox empty); `test_email_failure_returns_password_once` (patch `accounts.utils._send` to return `(False, 'boom')`: response `activation.default_password` present and valid, `reason` 'boom', account active; a following GET of the organization does not contain it); `test_email_equal_to_existing_user_email_does_not_collide` (a staff user already has that email: 201, mail goes to the organization, shell `User.email` stays empty); `test_old_staff_flow_unaffected` (farmer create still returns an inactive shell); `test_import_activates_rows_with_email` (xlsx built with `ORG_TEMPLATE_HEADERS`, reuse the builder pattern from `associations/test_org_dates.py`: two rows with emails → both active, two emails, `credentials_to_hand_over == []`); `test_import_partial_email_failure` (patch `_send` to fail for one recipient only: the other org is still active and emailed, the failed one appears once in `credentials_to_hand_over` with a valid password); `test_import_dry_run_creates_nothing_and_sends_nothing`; `test_import_row_without_email_stays_inactive`.
- [ ] **Step 2: Run** `manage.py test associations.test_org_activation`. Expected: FAIL (no activation).
- [ ] **Step 3: Implement** the two helpers in `accounts/utils.py`. In both `perform_create` methods keep the existing `transaction.atomic` shell creation, then after it call `activate_and_email_organization` and keep the result on `self`; override `create(self, request, *args, **kwargs)` to call `super().create(...)` and add `response.data['activation'] = self._activation`. In the import function, after `create_inactive_citizen_shell(linked_record_type, instance)` and the atomic block, call the helper for the created row and collect `credentials_to_hand_over`; the dry-run branch must not call it.
- [ ] **Step 4: Run** the new test module. Expected: all PASS.
- [ ] **Step 5: Mutation check:** make the helper send the email inside the `transaction.atomic` block's `try` such that a raised mail error propagates (or swap `_send` for `send_mail` raising) and confirm `test_email_failure_returns_password_once` fails; restore. Ledger it.
- [ ] **Step 6: Run the whole suite.** Expected: OK. (Existing organization tests that count users or check an inactive shell for an organization created with an email must be updated to the new behaviour; list any in the ledger.)

---

### Task 4: Frontend (checklist, change-password forms, login message, add-organization result, import result)

**Files:**
- Create: `oma-frontend/src/utils/passwordRules.js`
- Modify: `components/UI/PasswordRequirementChecklist.jsx`, `pages/Auth/ForceChangePasswordPage.jsx`, `pages/Profile/ProfilePage.jsx`, `pages/Citizen/CitizenProfileScreen.jsx`, `pages/Citizen/OrgAccountPages.jsx`, `pages/Login/LoginPage.jsx`, `pages/Organizations/CreateOrganizationModal.jsx`, `components/ImportFileModal.jsx`
- Test: `check_passwords.mjs` in the scratchpad (node script, same style as `check_guards.mjs`) — no frontend test framework exists; the script is the red/green gate for the pure rules.

**Interfaces:**
- Produces: `utils/passwordRules.js`: `evaluatePassword(password) -> { length, capital, special, digits, notWeak }` (each `true`, `false`, or `null` when `password` is empty; `notWeak` mirrors the existing local-denylist/common check) and `passwordMeetsRules(password) -> boolean` (length ≥ 8 AND capital AND special AND at least 3 digits AND notWeak). The checklist component keeps its default export and `password` prop, and no longer exports `evaluatePassword` (it re-exports it from the new util so existing imports keep working).
- Consumes (backend, Tasks 2-3): login error `code: 'temp_password_expired'`; create response key `activation` `{activated, email_sent, expires_at, reason, default_password, login}`; import response `credentials_to_hand_over`.

- [ ] **Step 1: Write the failing check script** `check_passwords.mjs` importing `utils/passwordRules.js`: `Maganda#2024x` meets all; missing capital / special / digits each flip exactly that flag; `Ab#12` fails length; `Ab#1234` (7) fails length, `Ab#12345` passes; `Ñandu€123` passes; `Aringay#2024x` → `notWeak` false; empty string → all `null`.
- [ ] **Step 2: Run** `node check_passwords.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `passwordRules.js` and update `PasswordRequirementChecklist.jsx` to five lines: "At least 8 characters", "1 capital letter", "1 special character (like # or @)", "At least 3 numbers", "Not a common or easily-guessed password". In `ForceChangePasswordPage` and `ProfilePage` disable submit / show the form error until `passwordMeetsRules(newPassword)`; in `ProfilePage` replace the `< 15` check with `!passwordMeetsRules`. In `CitizenProfileScreen` and `OrgAccountPages` (each has its own change-password form posting to `/accounts/change-password/`) show the checklist under the new-password field and use the same gate. Server errors keep showing.
- [ ] **Step 4: Run** the check script. Expected: PASS.
- [ ] **Step 5: `LoginPage.jsx`:** handle `err.code === 'temp_password_expired'` by showing the server `detail` in the existing error area (follow how `citizen_not_activated` is handled).
- [ ] **Step 6: `CreateOrganizationModal.jsx`:** read `response.data.activation`. When `activated && email_sent` the toast says `Account activated. The login details were emailed to <email>.`; when `activated && !email_sent` open a small dialog (use `ModalShell`) showing the login, the temporary password once with a copy button, the reason and the expiry date, and call `onSuccess()` only when it is closed; when not activated keep today's toast. **`ImportFileModal.jsx`:** when the result has a non-empty `credentials_to_hand_over`, show a table below the summary (organization, login, temporary password, expires) with the heading "Email could not be sent — hand these over in person" and a note that the passwords are shown only now.
- [ ] **Step 7: Lint and build:** per-file eslint compared with HEAD (scratch `lintcmp.sh`), `vite build`.
- [ ] **Step 8: Browser check on the throwaway stack** (admin token): Add Organization with an email (mail console backend → `email_sent` False → the dialog shows a password in the new format; log in as that organization with it → forced to the change screen); the checklist ticks as `Maganda#2024x` is typed; a 7-character password keeps submit disabled; Add Organization without an email gives today's toast; open an organization's login as an expired account (set `temp_password_expires_at` in the past in the throwaway DB) and see the expired message on the login page. Run the full backend suite one last time.

---

## Self-review notes

- Spec coverage: decisions 1 (Task 3), 2 (Task 2), 3 (Task 1), 4 (Task 4), 5 role label (Task 2). Out-of-scope list untouched.
- Spec deviation recorded: the spec's new `PasswordRules` component is replaced by updating the existing `PasswordRequirementChecklist` (it already is that component and is already wired into the first-login and profile screens); the rule logic lives in `utils/passwordRules.js` so it can be checked by the node script.
- Review Focus 1-5 each have a named test (Tasks 1-3).
- Five places post to `/accounts/change-password/`: `ForceChangePasswordPage`, `ProfilePage`, `CitizenProfileScreen`, `OrgAccountPages` (and `ActivateCitizenAccountButton` only mentions it in copy); the first four get the checklist and gate.
