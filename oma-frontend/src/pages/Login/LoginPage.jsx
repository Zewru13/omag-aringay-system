import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  MailWarning,
} from "lucide-react";
import api from "../../api/axiosInstance.js";
import { useAuth } from "../../context/AuthContext.jsx";
import logo from "../../assets/LOGO OMAg.jpg";

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState("idle"); // idle | sending | sent | error

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
      } else if (err.code === "citizen_not_activated") {
        setError(err.message);
      } else {
        setError("Invalid email, username, or password. Please try again.");
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
    <div className="min-h-screen bg-bg flex items-stretch">
      <div className="w-full max-w-5xl mx-auto my-auto grid grid-cols-1 md:grid-cols-[1.1fr_1fr] rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-lg)] border border-border">
        {/* Brand panel — institutional context, deliberate negative space */}
        <div className="relative hidden md:flex flex-col justify-between bg-[color:var(--color-primary-deep)] px-10 py-12 overflow-hidden">
          <svg
            className="absolute -right-16 -bottom-20 opacity-[0.08]"
            width="320"
            height="320"
            viewBox="0 0 320 320"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M160 300V120"
              stroke="#EBF5EE"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <path
              d="M160 160c0-55-42-88-96-92 4 52 42 96 96 100"
              fill="#EBF5EE"
            />
            <path
              d="M160 120c0-48 40-76 88-80-4 46-38 84-88 88"
              fill="#EBF5EE"
            />
          </svg>

          <div className="relative">
            <img
              src={logo}
              alt="OMAg Aringay seal"
              className="w-14 h-14 object-contain rounded-lg"
            />
          </div>

          <div className="relative">
            <p className="font-display text-[30px] leading-[1.15] font-semibold text-white tracking-tight">
              Integrated Agricultural Monitoring and Production Management
              System
            </p>
            <p className="mt-4 text-[13px] text-white/70 leading-relaxed max-w-sm">
              Integrated Agricultural Monitoring and Production Management
              System — tracking crop cycles, fisheries stocks, and disaster
              response for the Office of the Municipal Agriculturist.
            </p>
          </div>

          <p className="relative text-[12px] text-white/50">
            Municipality of Aringay, La Union
          </p>
        </div>

        {/* Form panel */}
        <div className="bg-surface px-6 py-10 sm:px-12 sm:py-14 flex flex-col justify-center">
          <div className="md:hidden flex items-center gap-3 mb-8">
            <img
              src={logo}
              alt="OMAg Aringay seal"
              className="w-11 h-11 object-contain flex-shrink-0"
            />
            <div>
              <p className="font-display text-[15px] font-semibold text-text-primary leading-tight">
                OMAg Aringay
              </p>
              <p className="text-[11px] text-text-muted">La Union</p>
            </div>
          </div>

          <h1 className="font-display text-[24px] font-semibold text-text-primary tracking-tight">
            Sign in
          </h1>
          <p className="text-[13px] text-text-secondary mt-1 mb-8">
            Enter your credentials to access the system.
          </p>

          <form
            onSubmit={handleSubmit}
            className="stagger-item"
            style={{ "--stagger-index": 0 }}
          >
            <label
              htmlFor="login-email"
              className="text-[13px] font-medium text-text-primary block mb-1.5"
            >
              Email or username
            </label>
            <input
              id="login-email"
              type="text"
              autoComplete="username"
              required
              disabled={loading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com or username"
              className="w-full h-11 border border-border-strong bg-surface rounded-[var(--radius-sm)] px-3.5 text-[13px] mb-4 text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
            />

            <label
              htmlFor="login-password"
              className="text-[13px] font-medium text-text-primary block mb-1.5"
            >
              Password
            </label>
            <div className="relative mb-5">
              <input
                id="login-password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full h-11 border border-border-strong bg-surface rounded-[var(--radius-sm)] px-3.5 pr-11 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors w-7 h-7 flex items-center justify-center"
              >
                {show ? (
                  <EyeOff className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" aria-hidden="true" />
                )}
              </button>
            </div>

            {error && !needsVerification && (
              <div className="bg-[color:var(--color-semantic-critical-bg)] border border-[color:var(--color-semantic-critical)]/20 rounded-[var(--radius-sm)] px-3.5 py-2.5 text-[13px] text-[color:var(--color-semantic-critical)] mb-4 flex items-center gap-2">
                <AlertCircle
                  className="w-4 h-4 flex-shrink-0"
                  aria-hidden="true"
                />
                {error}
              </div>
            )}

            {needsVerification && (
              <div className="bg-[color:var(--color-semantic-warning-bg)] border border-[color:var(--color-semantic-warning)]/25 rounded-[var(--radius-sm)] px-3.5 py-3 text-[13px] text-[color:var(--color-semantic-warning)] mb-4">
                <div className="flex items-start gap-2">
                  <MailWarning
                    className="w-4 h-4 flex-shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{error}</span>
                </div>
                {resendState === "sent" ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[color:var(--color-semantic-safe)] text-[12px] font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />{" "}
                    Verification email sent — check your inbox.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendState === "sending"}
                    className="mt-2 text-[12px] font-semibold underline hover:no-underline disabled:opacity-60"
                  >
                    {resendState === "sending"
                      ? "Resending…"
                      : "Resend verification email"}
                  </button>
                )}
                {resendState === "error" && (
                  <p className="mt-1 text-[12px] text-[color:var(--color-semantic-critical)]">
                    Could not resend. Please try again shortly.
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="press-scale w-full h-11 bg-primary hover:bg-primary-hover text-white font-semibold rounded-[var(--radius-sm)] text-[13px] shadow-sm hover:shadow-md transition-[background-color,box-shadow] flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            >
              {loading && (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              )}
              Sign in
            </button>
          </form>

          <p className="text-center text-[11px] text-text-muted mt-8">
            Authorized personnel only.
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
