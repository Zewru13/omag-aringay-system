# Admin Account Recovery

This system allows only **one active administrator at a time**. Whenever a
new admin account is created, the previously-active admin is automatically
deactivated and logged out. This is intentional (see the "Single-Admin
Auto-Deactivate" behavior in the accounts app) — but it means that if
something goes wrong (wrong account promoted, admin's email/password lost,
etc.), you can get locked out of the admin panel entirely.

**If you are locked out of the admin account, run these commands on the
machine hosting the backend.** They run directly against the database from
the terminal — no login or active session is required.

Both commands live in `oma_aringay/accounts/management/commands/`. Run them
from the `oma_aringay/` directory (where `manage.py` is), with your virtual
environment active.

## 1. Reactivate an admin: `rescue_admin`

Reactivates the given user, promotes them to `ADMIN`, and deactivates every
other admin (so the single-admin rule stays intact).

```
python manage.py rescue_admin <email>
```

Example:

```
python manage.py rescue_admin marzanmr70@gmail.com
```

This works even if `<email>` currently belongs to an inactive user or an
`EVALUATOR` — it will reactivate them and promote them to `ADMIN`. If any
other admin was active, they are deactivated and their existing login
sessions are invalidated (same as the normal auto-deactivate behavior).

## 2. Reset a password from the terminal: `reset_admin_password`

Sets a known password for the given account, without needing to know the
current one. Also clears the "must change password" flag and invalidates
any existing session for that account, so the new password takes effect
immediately.

```
python manage.py reset_admin_password <email>
```

Run with no `--password` flag and you'll be prompted twice (input hidden,
like a normal terminal password prompt):

```
New password (min 15 characters): 
Confirm password: 
```

Or pass it directly (useful for scripting/automation — be mindful this can
leave the password in your shell history):

```
python manage.py reset_admin_password <email> --password "a long passphrase works great"
```

The password must satisfy the same policy enforced everywhere else in the
system: **at least 15 characters**, not a common/guessable password, and not
a variation of OMAg/Aringay-specific terms. The command will reject a
non-compliant password with a clear error instead of silently accepting it.

## Typical recovery flow

1. Locked out because a new admin was created and you weren't expecting it,
   or you lost access to the current admin's email/password?
   ```
   python manage.py rescue_admin youremail@example.com
   python manage.py reset_admin_password youremail@example.com
   ```
2. Log in with `youremail@example.com` and the password you just set.

## The only real lockout scenario

With these two commands available, **the only way to get permanently locked
out is losing access to the host machine itself** (the server/computer
running the Django backend). As long as someone can open a terminal there
and run `manage.py`, the admin account is always recoverable — no database
GUI, no manual SQL, no re-deploy needed.
