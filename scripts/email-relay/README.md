# Email relay (Google Apps Script)

Render's free plan blocks the usual email ports, so the live system cannot use Gmail's mail server directly. This
small script, in the office's own Google account, accepts a message over HTTPS and sends it from that Gmail address.

- Cost: free. Google's limit for a normal Gmail account is about 100 recipients a day
  ([quotas](https://developers.google.com/apps-script/guides/services/quotas)).
- The sender is the Google account that owns the script. Use the account the system should send from.

## 1. Make a secret

In PowerShell, this puts a long random secret on your clipboard. Paste it only in step 2 and step 4. Never put it in
this project, in chat or in a screenshot.

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b) | Set-Clipboard
```

## 2. Create the script

1. Sign in to the sending Gmail account and open <https://script.google.com>.
2. **New project**. Name it `OMAg email relay`.
3. Replace everything in `Code.gs` with the contents of [Code.gs](Code.gs) and save.
4. **Project Settings** (gear icon) > **Script properties** > **Add script property**:
   name `RELAY_SECRET`, value: paste the secret. Save.
5. Back in the editor, choose the function `authorize` and press **Run**. Allow the permission to send email.

## 3. Publish it

1. **Deploy** > **New deployment** > type **Web app**.
2. **Execute as: Me**. **Who has access: Anyone**. ("Anyone" lets the server reach it; only someone with the secret
   can send.)
3. **Deploy**, then copy the **Web app URL** (it ends in `/exec`).

After changing the script later: **Deploy** > **Manage deployments** > edit > **New version** (the URL stays the same).

## 4. Tell the live server

Render > the backend service > **Environment**, add or check:

| Name | Value |
|---|---|
| `EMAIL_RELAY_URL` | the web app URL ending in `/exec` |
| `EMAIL_RELAY_SECRET` | the secret from step 1 |
| `FRONTEND_BASE_URL` | `https://omag-aringay-system.vercel.app` |

Save; Render restarts the server. When both `EMAIL_RELAY_*` values are set they are used instead of the SMTP settings.

## 5. Test

Open the live sign-in page > **Forgot password?** > enter an email that has an account. The message should arrive
within a minute (check Spam the first time).

## If something goes wrong

- Nothing arrives: Render > Logs shows the reason ("not allowed" = the two secrets differ; "did not answer properly" =
  access is not "Anyone", or the URL is not the `/exec` one).
- If the secret may have leaked: make a new one and change it in both places. Until then, someone with it could send
  email from this Gmail account.
