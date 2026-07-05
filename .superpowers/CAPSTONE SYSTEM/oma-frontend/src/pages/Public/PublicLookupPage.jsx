import { useState } from "react";
import axios from "axios";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import logo from "../../assets/LOGO OMAg.jpg";
import Button from "../../components/UI/Button.jsx";
import FormField from "../../components/UI/FormField.jsx";
import { baseInputClasses } from "../../components/UI/FormField.jsx";

const PUBLIC_API_URL = `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'}/public/check-status/`

function PublicLookupPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCheck = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setError(null);
    setResult(null);
    setIsLoading(true);

    try {
      const response = await axios.get(PUBLIC_API_URL, {
        params: { query: query.trim() },
      });
      setResult(response.data);
    } catch {
      setError("Service unavailable. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
        {/* Branding */}
        <div className="mb-6 text-center">
          <img
            src={logo}
            alt="OMAg Aringay seal"
            className="mx-auto mb-4 h-[72px] w-[72px] object-contain"
          />
          <p className="text-xs font-medium uppercase tracking-widest text-[#1E4620]">
            OMAg Aringay
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">
            Registration Status Checker
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Enter your RSBSA Number or LGU Registration Number to verify your
            registration status.
          </p>
        </div>

        {/* Search form */}
        <form className="space-y-3" onSubmit={handleCheck}>
          <FormField label="RSBSA No. / LGU Registration No.">
            <input
              className={`${baseInputClasses} !text-base`}
              disabled={isLoading}
              placeholder="e.g. 012345678901"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </FormField>

          <Button
            className="w-full"
            disabled={!query.trim()}
            isLoading={isLoading}
            size="lg"
            type="submit"
            variant="primary"
          >
            Check Status
          </Button>
        </form>

        {/* Network / server error */}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <p className="text-sm font-medium text-rose-800">Error</p>
              <p className="mt-0.5 text-sm text-rose-700">{error}</p>
            </div>
          </div>
        )}

        {/* Result — Active */}
        {result && result.found && result.status === "Active" && (
          <div className="mt-4 rounded-xl border border-green-100 bg-[#f0f7f0] p-4">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1E4620]" />
              <p className="font-medium text-green-800">
                Registered and Active
              </p>
            </div>
            <p className="text-sm font-medium text-slate-700">
              {result.full_name}
            </p>
            <p className="mt-1 text-sm text-slate-500">Type: {result.type}</p>
            <p className="text-sm text-slate-500">
              Barangay: {result.barangay}
            </p>
            {result.type === "Fisherfolk" && result.fisherfolk_type && (
              <p className="text-sm text-slate-500">{result.fisherfolk_type}</p>
            )}
          </div>
        )}

        {/* Result — Inactive */}
        {result && result.found && result.status === "Inactive" && (
          <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <p className="font-medium text-amber-800">
                Registered but Inactive
              </p>
            </div>
            <p className="text-sm text-amber-700">
              Your registration is currently inactive. Please visit the OMAg
              Aringay office for assistance.
            </p>
            <p className="mt-2 text-sm text-slate-600">{result.full_name}</p>
            <p className="text-sm text-slate-600">
              Barangay: {result.barangay}
            </p>
          </div>
        )}

        {/* Result — Not Found */}
        {result && !result.found && (
          <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
              <p className="font-medium text-rose-800">No Record Found</p>
            </div>
            <p className="text-sm text-rose-700">{result.message}</p>
          </div>
        )}

        {/* Contact info */}
        <div className="mt-6 border-t border-slate-100 pt-4">
          <p className="text-center text-xs text-slate-400">
            Need help? Visit the OMAg Aringay office or contact us through our
            email: "omag@gmail.com" and phone number: "09455979837".
          </p>
        </div>
      </div>
    </div>
  );
}

export default PublicLookupPage;
