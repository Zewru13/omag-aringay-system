/**
 * OMAg Aringay email relay. It lets the system send email from this Google account over HTTPS.
 * Setup: see README.md next to this file. The secret is NOT written here: it is a Script Property named RELAY_SECRET.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('RELAY_SECRET');
    if (!secret || data.secret !== secret) return reply_(false, 'not allowed');
    if (!data.to || !data.subject || !data.text) return reply_(false, 'a recipient, subject and text are required');
    MailApp.sendEmail({ to: data.to, subject: data.subject, body: data.text, name: data.name || 'OMAg Aringay System' });
    return reply_(true);
  } catch (error) {
    return reply_(false, String(error).slice(0, 200));
  }
}

function reply_(ok, error) {
  return ContentService.createTextOutput(JSON.stringify(ok ? { ok: true } : { ok: false, error: error }))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run this once from the editor: Google asks you to allow the script to send email as you. */
function authorize() {
  Logger.log('Emails left for today: ' + MailApp.getRemainingDailyQuota());
}
