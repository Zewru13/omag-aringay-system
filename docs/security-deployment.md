# Security checklist for deployment

The system holds personal records of farmers, fisherfolk, senior citizens and organizations. Work through this list
before the first real user logs in. Items marked **(code)** are already enforced by the code; the rest are things only
the person deploying can do.

## 1. Install the pinned versions

The requirements were upgraded for security (Django 5.2 LTS, DRF 3.17, Pillow 12.3, PyJWT 2.15, sqlparse 0.6). A
server that still has the old packages is not protected by any of the changes below.

```bash
pip install -r oma_aringay/requirements.txt
pip-audit -r oma_aringay/requirements.txt     # must report no known vulnerabilities
```

Django 5.2 needs **PostgreSQL 14+** (the live Supabase database is fine) or **MariaDB 10.5+** if you use the MySQL
fallback (XAMPP's bundled MariaDB 10.4 is too old).

## 2. Environment variables

`wsgi.py` / `asgi.py` use `oma_aringay.settings_production` by default **(code)**, so a server started the normal way is
never in DEBUG mode. That file refuses to start unless these are set:

| Variable | Meaning |
| --- | --- |
| `SECRET_KEY` | A fresh random value, never reused from development. |
| `DJANGO_ALLOWED_HOST` | The host name(s) of the API, comma separated. |
| `CORS_ALLOWED_ORIGIN` | The exact `https://` address of the website (comma separated if more than one). |

Plus the database and Supabase storage variables from `.env.example`.

How the site is served — HTTPS is the default, and anything else has to be asked for **(code)**:

| Setup | Variables |
| --- | --- |
| Django sees HTTPS itself | none (redirects to HTTPS, Secure cookies, HSTS for one year) |
| Reverse proxy / hosting platform ends TLS | `BEHIND_TLS_PROXY=1` — only if the proxy **overwrites** `X-Forwarded-Proto` on every request |
| Closed office LAN with no HTTPS | `ALLOW_INSECURE_HTTP=1` — passwords and tokens then cross the network in clear text |

Set `NUM_PROXIES` to the number of proxies in front of Django (for example `1`). Without it the login limiter trusts
whatever `X-Forwarded-For` a visitor sends.

The Django admin site is not mounted at all unless `ENABLE_DJANGO_ADMIN=1` **(code)**. Nobody uses it; keep it off.

Verify with:

```bash
DJANGO_SETTINGS_MODULE=oma_aringay.settings_production python manage.py check --deploy
```

The only remaining note is `security.W021` (HSTS preload). It is left off deliberately: preload is practically
permanent for the whole domain, so enable it only when you are sure every subdomain will always use HTTPS.

## 3. What the code already enforces

* **Sign-in**: one identical answer for "no such account" and "wrong password", with the same hashing time; at most
  5 tries a minute per account name and 30 a minute per network address; "send a new verification link" is limited
  to 3 an hour per e-mail address and answers every visitor the same way (the link is only ever e-mailed).
* **Sessions**: access tokens last 15 minutes; a refresh token works once and is replaced each time it is used, so a
  copied one cannot be replayed. Logging out, a password change or deactivating an account still cancels them all.
* **Uploads**: every photo is decoded and re-written (no GPS or device data, nothing hidden after the image), scaled
  down to at most 3000 px, limited to 50 megapixels, and stored under a random name with its true extension.
* **Exports**: names and notes that look like spreadsheet formulas stay plain text in Excel and CSV exports, and
  text in PDF reports is shown exactly as typed.
* **Access**: a citizen can only lock - or even see the lock on - their own records; ownership checks refuse a view
  that forgot to say whether its ids are farmers' or fisherfolk's; "cannot delete, other records depend on it" is a
  409 with an explanation instead of a server error.

## 4. Headers for the website (front end)

The API sends its own headers **(code)**: `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'`,
`X-Content-Type-Options: nosniff`, `Permissions-Policy`. The website's pages are served by whatever hosts the built
`oma-frontend/dist`, so set these there (Netlify/Cloudflare Pages `_headers`, nginx, ...). Replace the two host names:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob: https://<project>.supabase.co; connect-src 'self' https://<api-host>; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff
Referrer-Policy: same-origin
Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=(), usb=()
```

Roll the CSP out as `Content-Security-Policy-Report-Only` first and click through the main screens (photo uploads,
report downloads, PDF previews); switch to enforcing once the browser console shows no violations. `camera=(self)` is
only needed if the page uses the device camera for photos.

## 5. Uploaded photos (Supabase bucket)

Profile and proof photos are in a **public** bucket: anyone who has or guesses a photo URL can open it without logging
in, and the URLs are not secret. Files are renamed to random names and are validated and re-encoded on upload **(code)**,
but the bucket itself should become **private**, with the API handing out short-lived signed links. That needs a change
in the Supabase dashboard (bucket → private) together with `AWS_QUERYSTRING_AUTH=True`, so it is a planned follow-up,
not something to flip casually on a live system.

## 6. Operations

* Back up the database before every deployment and test a restore at least once.
* Rotate `SECRET_KEY`, the Supabase keys and the e-mail password if they were ever shared, committed or pasted anywhere.
* Keep the packages current (`pip-audit` monthly) — Django security releases are announced in advance.
* Do not run the development server (`runserver`) or Vite dev server in production.
* The login and verification-link limiters count attempts in per-process memory (Django's default cache). With more
  than one worker process, configure a shared cache (Redis, or the database cache) in `CACHES`; otherwise each worker
  keeps its own count and an attacker gets that many times the allowed attempts. (Record locks live in the database
  and are not affected.)
* `_backups/` and `*.log` are git-ignored. One backup file (3 disaster reports with a person's name in the text) was
  committed in the past and still exists in the repository's history. The repository is private; if it is ever made
  public or shared, remove it from the history first (`git filter-repo`).
