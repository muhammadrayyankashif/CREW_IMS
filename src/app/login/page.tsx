"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { syncAdminAccount } from "@/actions/auth-actions";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const legacyAdminEmails = ["admin@cedarcrew.com", "admin@cedarscrew.org"];

    // Auto-migrate legacy admin credentials if signing in as admin
    if (cleanEmail === "admin@crew.com" || legacyAdminEmails.includes(cleanEmail)) {
      try {
        await syncAdminAccount();
      } catch (syncErr) {
        console.error("Admin sync error:", syncErr);
      }
    }

    try {
      const res = await signIn.email({
        email: legacyAdminEmails.includes(cleanEmail) ? "admin@crew.com" : cleanEmail,
        password: password.trim(),
      });

      if (res.error) {
        setError(res.error.message || "Invalid credentials.");
        setLoading(false);
        return;
      }

      const user = res.data?.user as { mustChangePassword?: boolean; role?: string } | undefined;

      if (user?.mustChangePassword) {
        router.push("/setup-password");
      } else if (user?.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication error.";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-black text-zinc-100 selection:bg-zinc-800">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold tracking-tight text-white">
            CREW
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Inventory Management System
          </p>
        </div>

        {/* Minimal Form Card */}
        <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-6 shadow-2xl">
          {error && (
            <div className="mb-5 p-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-mono">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@crew.com"
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-zinc-300">
                  Password or Temp PIN
                </label>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-900/60 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2 px-3 bg-white hover:bg-zinc-200 text-black font-medium text-xs rounded-lg transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
