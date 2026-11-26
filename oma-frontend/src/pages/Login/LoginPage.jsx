import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, MailWarning, TriangleAlert } from "lucide-react";
import api from "../../api/axiosInstance.js";
import { useAuth } from "../../context/AuthContext.jsx";
import logo from "../../assets/LOGO OMAg-small.png";
import LoginArt from "./LoginArt.jsx";
import { SYSTEM_TITLE_READABLE } from "../../constants/appInfo.js";

const FIELD =
  "w-full h-12 rounded-[var(--radius-sm)] border border-border-strong bg-surface pl-11 pr-3.5 text-[16px] split:text-[15px] text-text-primary placeholder:text-text-muted transition-[border-color,box-shadow] duration-150 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:bg-surface-2";

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorCount, setErrorCount] = useState(0); // remounts the field so the shake plays on every failed attempt
  const [needsVerification, setNeedsVerification] = useState(false);
  // A one-off note left by the page that sent you here (e.g. "Password changed"); read once, then forgotten.
  const [notice] = useState(() => {
    try {
      const text = sessionStorage.getItem('omag_login_notice');
      if (text) sessionStorage.removeItem('omag_login_notice');
      return text || '';
    } catch { return ''; }
  });
  const [resendState, setResendState] = useState("idle"); // idle | sending | sent | error
  const passwordRef = useRef(null);

  const fail = (message) => {
    setError(message);
    setErrorCount((n) => n + 1);
    // A wrong password is retyped, not re-read: put the cursor back in the field with the old text selected.
    requestAnimationFrame(() => {
      passwordRef.current?.focus();
      passwordRef.current?.select();
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError("");
    setNeedsVerification(false);
    setResendState("idle");
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      // Batch 10: CITIZEN accounts can't reach /dashboard (ADMIN/EVALUATOR
      // only) — a bare login (no location.state.from, i.e. not bounced off
      // a protected route) needs a role-aware default landing page instead
      // of the old hardcoded "/dashboard".
      const fallback = user?.role === "CITIZEN" ? "/my-account" : "/dashboard";
      const from = location.state?.from?.pathname || fallback;
      navigate(from, { replace: true });
    } catch (err) {
      if (err.code === "email_not_verified") {
        setNeedsVerification(true);
        setError(err.message);
      } else if (["citizen_not_activated", "temp_password_expired", "setup_expired"].includes(err.code)) {
        fail(err.message);
      } else if (err.status === 429) {
        fail("Too many sign-in attempts. Please wait a minute and try again.");
      } else if (err.status === undefined || err.status >= 500) {
        fail("The server could not be reached or had a problem. This is not your password — please try again in a moment.");
      } else {
        fail("Incorrect email or password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendState("sending");
    try {
      await api.post("/accounts/resend-verification/", { email: email.trim() });
      setResendState("sent");
    } catch {
      setResendState("error");
    }
  };

  return (
    <div className="min-h-dvh bg-bg split:grid split:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ── Brand panel (desktop) ───────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden split:block">
        <LoginArt className="absolute inset-0 h-full w-full" />
        <div className="relative z-10 flex h-full min-h-dvh flex-col px-12 py-12 lg:px-16">
          <div className="my-auto max-w-lg">
            <img src={logo} alt="OMAg Aringay seal" className="login-rise h-32 w-32 rounded-2xl bg-white/95 object-contain p-1.5 lg:h-36 lg:w-36" style={{ "--i": 0 }} />
            <p className="login-rise mt-8 text-balance text-[30px] font-bold leading-[1.18] tracking-tight text-white lg:text-[38px]" style={{ "--i": 1 }}>
              {SYSTEM_TITLE_READABLE}
            </p>
          </div>
        </div>
      </aside>

      {/* ── Sign-in ─────────────────────────────────────────────────────── */}
      <main className="flex min-h-dvh flex-col split:min-h-0 split:justify-center split:bg-surface">
        {/* Phone: the picture becomes a short banner with the seal and name */}
        <header className="relative flex-none overflow-hidden split:hidden">
          <LoginArt variant="banner" className="absolute inset-0 h-full w-full" />
          <div className="relative z-10 flex flex-col items-center px-6 pb-14 pt-[max(1.5rem,env(safe-area-inset-top))] text-center short:flex-row short:gap-3 short:pb-10 short:text-left">
            <img src={logo} alt="OMAg Aringay seal" className="h-24 w-24 flex-none rounded-2xl bg-white/95 object-contain p-1 short:h-14 short:w-14" />
            <p className="mt-3 max-w-[22rem] text-balance text-[17px] font-bold leading-snug text-white short:mt-0 short:max-w-none short:text-[13px]">
              {SYSTEM_TITLE_READABLE}
            </p>
          </div>
        </header>

        <div className="relative z-10 -mt-7 flex-1 rounded-t-[28px] bg-surface px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8 shadow-[0_-8px_24px_rgba(22,51,24,0.12)] split:mt-0 split:flex-none split:rounded-none split:px-14 split:py-14 split:shadow-none lg:px-20">
          <div className="mx-auto w-full max-w-[400px]">
            <h1 className="login-rise text-[28px] font-bold leading-tight tracking-tight text-text-primary split:text-[32px]" style={{ "--i": 0 }}>
              Sign in
            </h1>
            <p className="login-rise mt-1.5 text-[14px] leading-relaxed text-text-secondary" style={{ "--i": 1 }}>
              Use your email and password. Staff may also use a username.
            </p>
            {notice && (
              <p role="status" className="login-rise mt-4 rounded-[var(--radius-sm)] border border-primary/20 bg-primary-light px-3.5 py-3 text-[13px] leading-snug text-primary" style={{ "--i": 1 }}>
                {notice}
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-8" noValidate>
              <div className="login-rise" style={{ "--i": 2 }}>
                <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-medium text-text-primary">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-text-muted" aria-hidden="true" />
                  <input
                    id="login-email"
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={FIELD}
                  />
                </div>
              </div>

              <div className="login-rise mt-5" style={{ "--i": 3 }}>
                <label htmlFor="login-password" className="mb-1.5 block text-[13px] font-medium text-text-primary">
                  Password
                </label>
                {/* key: a new failed attempt remounts the wrapper, which replays the one-time shake */}
                <div key={errorCount} className={`relative ${errorCount > 0 && error ? "login-shake" : ""}`}>
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-text-muted" aria-hidden="true" />
                  <input
                    id="login-password"
                    ref={passwordRef}
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={(e) => setCapsOn(e.getModifierState?.("CapsLock") ?? false)}
                    onBlur={() => setCapsOn(false)}
                    placeholder="Password"
                    aria-invalid={error && !needsVerification ? true : undefined}
                    aria-describedby={capsOn ? "login-caps" : undefined}
                    className={`${FIELD} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                    aria-pressed={show}
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {show ? (
                      <EyeOff key="off" className="login-icon h-[18px] w-[18px]" aria-hidden="true" />
                    ) : (
                      <Eye key="on" className="login-icon h-[18px] w-[18px]" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <div className="mt-1 flex justify-end">
                  <Link
                    to="/forgot-password"
                    state={{ email: email.includes("@") ? email.trim() : "" }}
                    className="flex min-h-9 items-center text-[13px] font-semibold text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                {capsOn && (
                  <p id="login-caps" className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--color-semantic-warning)]" role="status">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /> Caps Lock is on
                  </p>
                )}
              </div>

              <div aria-live="polite">
                {error && !needsVerification && (
                  <div
                    role="alert"
                    className="login-error mt-5 flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-[color:var(--color-semantic-critical)]/20 bg-[color:var(--color-semantic-critical-bg)] px-3.5 py-3 text-[13px] leading-snug text-[color:var(--color-semantic-critical)]"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    {error}
                  </div>
                )}

                {needsVerification && (
                  <div role="alert" className="login-error mt-5 rounded-[var(--radius-sm)] border border-[color:var(--color-semantic-warning)]/25 bg-[color:var(--color-semantic-warning-bg)] px-3.5 py-3 text-[13px] text-[color:var(--color-semantic-warning)]">
                    <div className="flex items-start gap-2">
                      <MailWarning className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                    {resendState === "sent" ? (
                      <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--color-semantic-safe)]">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Verification email sent — check your inbox.
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resendState === "sending"}
                        className="mt-2 min-h-8 text-[12px] font-semibold underline hover:no-underline disabled:opacity-60"
                      >
                        {resendState === "sending" ? "Resending…" : "Resend verification email"}
                      </button>
                    )}
                    {resendState === "error" && (
                      <p className="mt-1 text-[12px] text-[color:var(--color-semantic-critical)]">Could not resend. Please try again shortly.</p>
                    )}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="login-rise press-scale mt-6 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-primary text-[15px] font-semibold text-white shadow-sm transition-[background-color,box-shadow,opacity] hover:bg-primary-hover hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
                style={{ "--i": 4 }}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <p className="login-rise mt-8 border-t border-border pt-5 text-[13px] leading-relaxed text-text-secondary" style={{ "--i": 5 }}>
              No account yet, or the reset email does not arrive? Visit the Office of the Municipal Agriculturist with a valid ID.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default LoginPage;
