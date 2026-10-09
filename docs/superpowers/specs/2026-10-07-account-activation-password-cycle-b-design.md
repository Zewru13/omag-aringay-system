# Cycle B — Organization account activation, emailed default password, password policy

Date: 2026-10-07. Second of six cycles from the user's 12-item request (items 3, 4, 5, 6). Cycle A (items 1, 2, 10) is committed.

## The request (user's words, items 3-6)

3. An organization account is activated automatically at registration, with no manual "Set Up Account".
4. Email the default password when an organization is added (the password in the email, not behind a link), and remove
   click-link verification for every account activation except admin and focal person.
5. A simpler default password.
6. Password policy: at least 1 special character, at least 1 capital letter, at least 3 numbers.

User answers to the open questions: the plaintext password in the email is accepted (forced change at first login, and
the temporary password expires); the policy is not skipped for the default password; "except admin and focal person"
means those two roles keep the click-link email verification they have today; the Evaluator role is shown as Focal Person.

## What the code does today (verified)

- Admin and Evaluator accounts (`UserCreateView`) are created inactive and unverified; the welcome email carries a
  verification link AND the temporary password; the account activates when the link is clicked (`VerifyEmailView`).
  This stays as it is.
- Citizen accounts (farmer, fisherfolk, farmers organization, fisherfolk organization) never use a verification link
  (`LoginView` skips the email check for role CITIZEN). They are created as inactive shells
  (`create_inactive_citizen_shell`); staff press "Set Up Account" (`SetCitizenPasswordView`), which generates a password,
  activates the account and returns the password once to read aloud. `RegenerateCitizenPasswordView` issues a new one.
- `generate_default_password()` is `secrets.token_urlsafe(16)` (about 22 characters).
- `AUTH_PASSWORD_VALIDATORS` (settings and settings_production): user-attribute similarity, minimum length 15, maximum
  128, common passwords, local denylist, numeric-only. No composition rules by design.
- Organizations are created in `FarmersOrganizationListView.perform_create`, `FisherfolkOrganizationListView.perform_create`
  and the organization file import (`associations/views.py`, around lines 195, 512 and 1355); each creates the inactive shell.
  The organization email is `email_address` (can be blank).
- Role label `Evaluator` is the model label for `EVALUATOR`; the frontend already says "Focal Person".

## Decisions

### 1. Activate and email when an organization is created

When a farmers or fisherfolk organization is created (single add or file import) **and it has an email address**, its
citizen account is created active in the same transaction:

- a temporary password is generated (decision 2) and set, `must_change_password=True`, `is_active=True`, with an expiry
  (decision 2);
- after the transaction commits, an email goes to the organization address: its name, the login (registration number,
  as the login screen already accepts), the temporary password, and the expiry date. No link.
- if the email cannot be sent (SMTP unset, refused, and so on) the create response carries `default_password` and the
  failure `reason` so staff can hand it over; the frontend shows it once. If it was sent, the response says so and
  never contains the password. Same hybrid fallback `UserCreateView` already uses.
- an organization created **without** an email keeps today's inactive shell and the staff "Set Up Account" step.
- file import: each created organization with an email is activated and emailed the same way; the import result lists the
  organizations whose email failed, with their temporary passwords, shown once to staff (never logged). Rows without an
  email stay inactive shells.
- Farmers and fisherfolk are unchanged: staff-witnessed "Set Up Account". They only receive the new password policy and
  the new default password format (decisions 2 and 3).

### 2. Temporary password

- New `generate_default_password()`: a short word from a fixed list of fish and crop names (4-6 letters, capitalised,
  none contained in the local denylist), one special character from `#@!$%`, and 8 random digits: `Bangus#48271536`.
  Always satisfies the policy of decision 3. Random choices use `secrets`.
- Used by every flow that calls it today (staff creation, "Set Up Account", "Regenerate Password", organization activation,
  the reset command).
- Expiry: new nullable field `User.temp_password_expires_at`. Set to now + `TEMP_PASSWORD_VALID_DAYS` (setting, default 7)
  whenever a temporary password is issued to a CITIZEN account (organization activation, Set Up Account, Regenerate).
  Staff (Admin/Focal Person) temporary passwords do not expire: the verification link already gates them and an expiry
  could lock out the only admin. Cleared on a successful password change.
  `LoginView`, after the password check, refuses a login whose `must_change_password` is true and whose expiry has passed with
  `{'code': 'temp_password_expired', 'detail': 'This temporary password has expired. Ask the Office of the Municipal Agriculturist for a new one.'}`
  (HTTP 403). Accounts with no expiry (every existing account) are unaffected.
- "Regenerate Password" for a citizen account: issues a new temporary password, sets `must_change_password=True` and a new
  expiry, revokes the account's sessions, and shows the password to the staff member to relay (it is not emailed).

### 3. Password policy

- New validator `accounts.validators.CompositionPasswordValidator`: at least 1 capital letter, at least 1 special
  character (any character that is not a letter or digit), at least 3 digits. One error message per missing part, in
  plain words ("Add at least 1 capital letter.", "Add at least 1 special character.", "Add at least 3 numbers.").
- Added to `AUTH_PASSWORD_VALIDATORS` in `settings.py` and `settings_production.py`. Minimum length lowered from 15 to 8.
  Maximum length, common-password, local-denylist, numeric-only and user-attribute similarity stay.
- Applies wherever `validate_password` is already called (change password, profile password change, user creation).
  Existing passwords are not touched and keep working until changed.
- Help text in `get_help_text` lists the three rules.

### 4. Frontend

- A shared `PasswordRules` component (one list of the rules, a tick or cross for each as the person types) used by the
  first-login change screen (`ForceChangePasswordPage`), the staff profile password change (`ProfilePage`), and the citizen
  and organization account password change (`CitizenProfileScreen`, `OrgAccountPages`). The submit button stays disabled
  until the rules pass, and the server error text is still shown.
- The frontend rule check is a pure function in `utils/passwordRules.js`, checked by the node check script.
- After adding an organization: if the response says the email was sent, a toast says "Account activated. The login
  details were emailed to <address>."; if not, a dialog shows the temporary password once, with the reason and its expiry.
  The import result screen lists the same for failed emails.
- The login screen shows the new `temp_password_expired` message in the existing error area.
- Organization detail page: the "Set Up Account" button is hidden for an active account (already the case); "Regenerate
  Password" stays.

### 5. Role label

`User.Roles.EVALUATOR` label changes from "Evaluator" to "Focal Person" (label only; the stored value `EVALUATOR` is
unchanged). This needs a no-op migration for the choices change; the check is that `makemigrations --check` is clean.

## Out of scope

Farmer and fisherfolk auto-activation; changing how admin and focal accounts verify; password expiry for chosen
passwords; renaming the stored role value; forgotten-password self-service.

## Risks and costs

- A temporary password of about 2 million combinations is valid up to 7 days; the login throttle, the forced change and
  the expiry limit it. A longer random default would be safer and harder to read aloud.
- The password travels in email. Accepted by the user; it is never logged and never returned by the API when the email was sent.
- Lowering the minimum length from 15 to 8 weakens passphrases; the composition rules and denylist partly compensate.

## Testing

Backend (real tests, throwaway database; never Supabase): composition validator cases (each missing part, all present,
unicode letters); default password always passes `validate_password` over many generations; organization create with an
email activates and emails (mail outbox holds the password and no link; response omits the password), email failure returns
the password once, no email leaves an inactive shell; import behaves the same per row; expired temporary password refused,
unexpired accepted, no-expiry accounts unaffected; password change clears expiry; Regenerate sets a new expiry and emails;
farmer and fisherfolk activation unchanged; admin creation still sends the link and the password.
Frontend: node check script for `passwordRules.js`; build; lint compared with HEAD; browser checks on the throwaway stack
(add an organization with and without an email, failed-email dialog, first-login change screen checklist).

## Review focus (inputs the tests above do not name)

1. Two organizations created in one import where one email fails: the other is still activated and emailed.
2. An organization whose email is the same as an existing user's email: the citizen account keeps `User.email` empty
   (as `create_inactive_citizen_shell` does for organizations), so nothing collides and the email is sent to the
   organization's own `email_address`.
3. A password with only non-ASCII letters or emoji as its "special" characters.
4. The expiry is checked after the password check, so a wrong password never reveals the expired state.
5. Regenerating the password of an organization that is already logged in: its old tokens stop working or not (match the
   existing staff password-change behaviour).

## Changes made after the final review

- The unthrottled stock `/api/token/` login route was removed (it skipped the expiry and the login throttle; the frontend never used it).
- The default password has 8 digits (about 16 billion combinations with the word and symbol) instead of 4.
- Changing a password to the same password is refused, so an emailed temporary password cannot be kept as the permanent one.
- Import emails stop after 3 failures in a row and `EMAIL_TIMEOUT` is 10 seconds; the remaining organizations are handed over on screen.
- Staff temporary passwords carry no expiry, and Regenerate stays a staff-relayed password (decision 2, amended above).
