import { useState } from "react";
import { X, Mail, Lock, User, Eye, EyeOff, Loader2, Bot, AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function AuthModal() {
  const { showAuthModal, setShowAuthModal, login, register } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [loginForm, setLoginForm] = useState({ emailOrUsername: "", password: "" });
  const [regForm, setRegForm] = useState({ username: "", email: "", password: "", confirm: "" });

  if (!showAuthModal) return null;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(loginForm.emailOrUsername, loginForm.password);
      setShowAuthModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (regForm.password !== regForm.confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await register(regForm.username, regForm.email, regForm.password);
      setShowAuthModal(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget) setShowAuthModal(false); }}
    >
      <div className="absolute inset-0 bg-[#131722]/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm mx-4 bg-white rounded-3xl shadow-2xl border border-[#E0E3EB] overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-br from-[#2962FF] to-[#7C3AED] px-6 pt-8 pb-6 text-white">
          <button
            onClick={() => setShowAuthModal(false)}
            className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
            <Bot className="w-6 h-6" />
          </div>
          <h2 className="text-[20px] font-bold mb-1">
            {tab === "login" ? "Welcome back" : "Create account"}
          </h2>
          <p className="text-[12px] text-white/70">
            {tab === "login"
              ? "Sign in to access your AutoPilot Bot and broker connections"
              : "Start trading with your personal AI-powered bot"}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#E0E3EB] bg-[#F8F9FD]">
          {(["login", "register"] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(""); }}
              className={`flex-1 py-3 text-[12px] font-bold transition-all ${
                tab === t
                  ? "text-[#2962FF] border-b-2 border-[#2962FF] bg-white"
                  : "text-[#9598A1] hover:text-[#131722]"
              }`}
            >
              {t === "login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>

        <div className="p-6">
          {error && (
            <div className="flex items-center gap-2 bg-[#FFEBEE] border border-[#EF9A9A]/40 rounded-xl p-3 mb-4">
              <AlertCircle className="w-4 h-4 text-[#EF5350] shrink-0" />
              <p className="text-[11px] text-[#EF5350]">{error}</p>
            </div>
          )}

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#131722] mb-1">Email or Username</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9598A1]" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={loginForm.emailOrUsername}
                    onChange={e => setLoginForm(p => ({ ...p, emailOrUsername: e.target.value }))}
                    placeholder="you@email.com or username"
                    className="w-full pl-9 pr-3 py-2.5 border border-[#E0E3EB] rounded-xl text-[12px] text-[#131722] bg-[#F8F9FD] focus:outline-none focus:border-[#2962FF]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#131722] mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9598A1]" />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={loginForm.password}
                    onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Your password"
                    className="w-full pl-9 pr-9 py-2.5 border border-[#E0E3EB] rounded-xl text-[12px] text-[#131722] bg-[#F8F9FD] focus:outline-none focus:border-[#2962FF]"
                  />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9598A1] hover:text-[#131722]">
                    {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="mt-1 w-full bg-[#2962FF] hover:bg-[#1E53E5] disabled:bg-[#D1D4DC] text-white font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 transition-all">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in...</> : "Sign In"}
              </button>
              <p className="text-center text-[11px] text-[#9598A1]">
                No account?{" "}
                <button type="button" onClick={() => setTab("register")}
                  className="text-[#2962FF] font-bold hover:underline">Register free</button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#131722] mb-1">Username</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9598A1]" />
                  <input
                    type="text"
                    required
                    autoFocus
                    value={regForm.username}
                    onChange={e => setRegForm(p => ({ ...p, username: e.target.value }))}
                    placeholder="Choose a username"
                    className="w-full pl-9 pr-3 py-2.5 border border-[#E0E3EB] rounded-xl text-[12px] text-[#131722] bg-[#F8F9FD] focus:outline-none focus:border-[#2962FF]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#131722] mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9598A1]" />
                  <input
                    type="email"
                    required
                    value={regForm.email}
                    onChange={e => setRegForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="you@email.com"
                    className="w-full pl-9 pr-3 py-2.5 border border-[#E0E3EB] rounded-xl text-[12px] text-[#131722] bg-[#F8F9FD] focus:outline-none focus:border-[#2962FF]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#131722] mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9598A1]" />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={regForm.password}
                    onChange={e => setRegForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Min 6 characters"
                    className="w-full pl-9 pr-9 py-2.5 border border-[#E0E3EB] rounded-xl text-[12px] text-[#131722] bg-[#F8F9FD] focus:outline-none focus:border-[#2962FF]"
                  />
                  <button type="button" onClick={() => setShowPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9598A1]">
                    {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#131722] mb-1">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9598A1]" />
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={regForm.confirm}
                    onChange={e => setRegForm(p => ({ ...p, confirm: e.target.value }))}
                    placeholder="Repeat password"
                    className="w-full pl-9 pr-3 py-2.5 border border-[#E0E3EB] rounded-xl text-[12px] text-[#131722] bg-[#F8F9FD] focus:outline-none focus:border-[#2962FF]"
                  />
                </div>
              </div>
              <button type="submit" disabled={loading}
                className="mt-1 w-full bg-gradient-to-r from-[#2962FF] to-[#7C3AED] hover:opacity-90 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 transition-all">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</> : "Create Account"}
              </button>
              <p className="text-center text-[11px] text-[#9598A1]">
                Already have an account?{" "}
                <button type="button" onClick={() => setTab("login")}
                  className="text-[#2962FF] font-bold hover:underline">Sign in</button>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
