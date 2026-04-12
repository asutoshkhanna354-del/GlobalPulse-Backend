import { useState, useEffect } from "react";
import {
  Link2, Trash2, CheckCircle, AlertCircle, Loader2,
  Building2, Eye, EyeOff, Shield, Zap, Info, LogIn
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("gp_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function ZerodhaLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="8" fill="#387ED1" />
      <path d="M8 10h20l-14 8h14v8H8l14-8H8V10z" fill="white" />
    </svg>
  );
}

function BinanceLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="8" fill="#181A20" />
      <g fill="#F0B90B">
        <rect x="16.5" y="8" width="3" height="3" transform="rotate(45 18 9.5)" />
        <rect x="11" y="13.5" width="3" height="3" transform="rotate(45 12.5 15)" />
        <rect x="22" y="13.5" width="3" height="3" transform="rotate(45 23.5 15)" />
        <rect x="16.5" y="13.5" width="3" height="3" transform="rotate(45 18 15)" />
        <rect x="13.5" y="16.5" width="9" height="3" transform="rotate(45 18 18)" />
        <rect x="16.5" y="19.5" width="3" height="3" transform="rotate(45 18 21)" />
        <rect x="11" y="19.5" width="3" height="3" transform="rotate(45 12.5 21)" />
        <rect x="22" y="19.5" width="3" height="3" transform="rotate(45 23.5 21)" />
        <rect x="16.5" y="25" width="3" height="3" transform="rotate(45 18 26.5)" />
      </g>
    </svg>
  );
}

function OandaLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="8" fill="#00B74A" />
      <text x="18" y="23" textAnchor="middle" fill="white" fontSize="13" fontWeight="800" fontFamily="Arial, sans-serif" letterSpacing="-0.5">FX</text>
      <circle cx="18" cy="18" r="10" stroke="white" strokeWidth="2" fill="none" opacity="0.35" />
      <path d="M18 8 Q24 13 24 18 Q24 23 18 28 Q12 23 12 18 Q12 13 18 8Z" stroke="white" strokeWidth="1.5" fill="none" opacity="0.5" />
    </svg>
  );
}

const BROKER_LOGOS: Record<string, (size?: number) => JSX.Element> = {
  zerodha: (s) => <ZerodhaLogo size={s} />,
  binance:  (s) => <BinanceLogo size={s} />,
  oanda:    (s) => <OandaLogo size={s} />,
};

const BROKERS = [
  {
    id: "zerodha",
    name: "Zerodha Kite",
    description: "India's largest broker — Nifty, BSE, NSE stocks",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "Your Kite Connect API Key", secret: false },
      { key: "accessToken", label: "Access Token", placeholder: "Generated daily via Kite login", secret: true },
    ],
    environments: ["paper"],
    docs: "https://kite.trade/docs/connect/v3/",
    color: "#387ED1",
  },
  {
    id: "binance",
    name: "Binance",
    description: "World's largest crypto exchange — BTC, ETH, altcoins",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "Binance API Key", secret: false },
      { key: "apiSecret", label: "API Secret", placeholder: "Binance API Secret", secret: true },
    ],
    environments: ["paper", "live"],
    docs: "https://www.binance.com/en/support/faq/360002502072",
    color: "#F0B90B",
  },
  {
    id: "oanda",
    name: "OANDA",
    description: "Forex & CFD broker — EUR/USD, GBP/USD, gold, oil",
    fields: [
      { key: "apiKey", label: "API Token", placeholder: "OANDA API Access Token", secret: true },
      { key: "accountId", label: "Account ID", placeholder: "Your OANDA Account ID", secret: false },
    ],
    environments: ["paper", "live"],
    docs: "https://developer.oanda.com/rest-live-v20/introduction/",
    color: "#00B74A",
  },
];

interface Connection {
  id: number;
  broker: string;
  label: string;
  environment: string;
  isActive: boolean;
  connectedAt: string;
  apiKeyHint: string;
}

function BrokerAuthGate() {
  const { setShowAuthModal } = useAuth();
  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#F8F9FD] p-4 md:p-6 items-center justify-center">
      <div className="max-w-sm w-full bg-white rounded-3xl border border-[#E0E3EB] shadow-xl p-10 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#2962FF] flex items-center justify-center mb-5 shadow-lg">
          <Link2 className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-[18px] font-bold text-[#131722] mb-2">Sign in to connect brokers</h2>
        <p className="text-[12px] text-[#9598A1] leading-relaxed mb-6">
          Your broker API keys are securely stored in your personal account. Sign in to add or manage connections.
        </p>
        <button
          onClick={() => setShowAuthModal(true)}
          className="w-full bg-[#2962FF] hover:bg-[#1E53E5] text-white font-bold py-3 rounded-xl text-[12px] flex items-center justify-center gap-2 transition-all"
        >
          <LogIn className="w-4 h-4" />
          Sign In or Register Free
        </button>
      </div>
    </div>
  );
}

export function ConnectBroker() {
  const { user } = useAuth();
  if (!user) return <BrokerAuthGate />;
  return <ConnectBrokerInner />;
}

function ConnectBrokerInner() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBroker, setSelectedBroker] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [environment, setEnvironment] = useState("paper");
  const [label, setLabel] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchConnections = async () => {
    try {
      const r = await fetch(`${baseUrl}/api/broker/connections`, { headers: getAuthHeaders() });
      const d = await r.json();
      setConnections(d.connections ?? []);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConnections(); }, []);

  const brokerDef = BROKERS.find(b => b.id === selectedBroker);

  const handleConnect = async () => {
    if (!brokerDef) return;
    setConnecting(true);
    setError("");
    setSuccess("");

    const payload: Record<string, string> = {
      broker: brokerDef.id,
      label: label || brokerDef.name,
      environment,
      ...form,
    };

    try {
      const r = await fetch(`${baseUrl}/api/broker/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setSuccess(`${brokerDef.name} connected successfully!`);
        setSelectedBroker(null);
        setForm({});
        setLabel("");
        fetchConnections();
      } else {
        setError(d.error ?? "Connection failed");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setConnecting(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await fetch(`${baseUrl}/api/broker/connections/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      setConnections(prev => prev.filter(c => c.id !== id));
    } catch {}
    setDeleting(null);
  };

  const brokerLabel = (b: string) => BROKERS.find(x => x.id === b)?.name ?? b;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#F8F9FD] p-4 md:p-6 gap-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-[#2962FF] flex items-center justify-center shadow-sm shrink-0">
          <Link2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-[18px] font-bold text-[#131722]">Connect Broker</h1>
          <p className="text-[11px] text-[#9598A1]">Link your trading accounts to place orders from the chart</p>
        </div>
      </div>

      {/* Paper trading notice */}
      <div className="bg-[#E3F2FD] border border-[#90CAF9]/60 rounded-2xl p-4 flex gap-3">
        <Info className="w-4 h-4 text-[#1565C0] mt-0.5 shrink-0" />
        <div>
          <p className="text-[12px] font-bold text-[#1565C0] mb-1">Paper Trading Always Available</p>
          <p className="text-[11px] text-[#1565C0]/80 leading-relaxed">
            You don't need to connect a broker to use Buy/Sell buttons on the chart. Paper trading (virtual money) works immediately.
            Connect a real broker only when you're ready for live trading with actual funds.
          </p>
        </div>
      </div>

      {/* Connected brokers */}
      <div>
        <h2 className="text-[13px] font-bold text-[#131722] mb-3">Connected Accounts</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-[#9598A1] text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : connections.length === 0 ? (
          <div className="bg-white border border-[#E0E3EB] rounded-2xl p-6 text-center">
            <Building2 className="w-8 h-8 text-[#D1D4DC] mx-auto mb-2" />
            <p className="text-[12px] text-[#9598A1]">No broker accounts connected yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {connections.map(conn => (
              <div key={conn.id} className="bg-white border border-[#E0E3EB] rounded-2xl p-4 flex items-center gap-3">
                <div className="shrink-0">
                  {BROKER_LOGOS[conn.broker]?.(36) ?? (
                    <div className="w-9 h-9 rounded-lg bg-[#E0E3EB] flex items-center justify-center text-[#9598A1] font-bold text-sm">
                      {conn.broker[0].toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-[#131722]">{conn.label}</span>
                    <span className="text-[9px] bg-[#E8F5E9] text-[#2E7D32] border border-[#66BB6A]/30 px-1.5 py-0.5 rounded-full font-bold uppercase">{conn.environment}</span>
                    {conn.isActive && <span className="flex items-center gap-1 text-[9px] text-[#26A69A] font-bold"><CheckCircle className="w-3 h-3" /> Active</span>}
                  </div>
                  <p className="text-[10px] text-[#9598A1] mt-0.5">{brokerLabel(conn.broker)} · Key: {conn.apiKeyHint}</p>
                </div>
                <button onClick={() => handleDelete(conn.id)} disabled={deleting === conn.id}
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-[#9598A1] hover:bg-red-50 hover:text-red-500 transition-all">
                  {deleting === conn.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add new broker */}
      <div>
        <h2 className="text-[13px] font-bold text-[#131722] mb-3">Add Broker</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {BROKERS.map(b => (
            <button key={b.id} onClick={() => { setSelectedBroker(b.id === selectedBroker ? null : b.id); setForm({}); setError(""); setSuccess(""); }}
              className={`text-left p-4 rounded-2xl border-2 transition-all ${selectedBroker === b.id ? "border-[#2962FF] bg-[#EEF2FF]" : "border-[#E0E3EB] bg-white hover:border-[#2962FF]/40"}`}>
              <div className="flex items-center gap-3 mb-2">
                {BROKER_LOGOS[b.id]?.(32)}
                <span className="text-[13px] font-bold text-[#131722]">{b.name}</span>
              </div>
              <p className="text-[10px] text-[#9598A1] leading-relaxed">{b.description}</p>
            </button>
          ))}
        </div>

        {selectedBroker && brokerDef && (
          <div className="bg-white border border-[#E0E3EB] rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {BROKER_LOGOS[brokerDef.id]?.(32)}
                <span className="text-[14px] font-bold text-[#131722]">{brokerDef.name}</span>
              </div>
              <a href={brokerDef.docs} target="_blank" rel="noreferrer" className="text-[10px] text-[#2962FF] hover:underline">API Docs ↗</a>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#131722] mb-1">Account Label</label>
                <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder={`e.g. My ${brokerDef.name} Account`}
                  className="w-full border border-[#E0E3EB] rounded-xl px-3 py-2 text-[12px] text-[#131722] outline-none focus:border-[#2962FF] bg-[#F8F9FD]" />
              </div>

              {brokerDef.fields.map(f => (
                <div key={f.key}>
                  <label className="block text-[11px] font-bold text-[#131722] mb-1">{f.label}</label>
                  <div className="relative">
                    <input type={f.secret && !showSecrets[f.key] ? "password" : "text"}
                      value={form[f.key] ?? ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full border border-[#E0E3EB] rounded-xl px-3 py-2 text-[12px] text-[#131722] outline-none focus:border-[#2962FF] bg-[#F8F9FD] pr-8" />
                    {f.secret && (
                      <button onClick={() => setShowSecrets(p => ({ ...p, [f.key]: !p[f.key] }))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9598A1] hover:text-[#131722]">
                        {showSecrets[f.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {brokerDef.environments.length > 1 && (
                <div>
                  <label className="block text-[11px] font-bold text-[#131722] mb-1">Environment</label>
                  <div className="flex gap-2">
                    {brokerDef.environments.map(env => (
                      <button key={env} onClick={() => setEnvironment(env)}
                        className={`px-4 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${environment === env ? "bg-[#2962FF] text-white border-[#2962FF]" : "border-[#E0E3EB] text-[#9598A1] hover:bg-[#F0F3FA]"}`}>
                        {env === "paper" ? "🧪 Paper" : "🔴 Live"}
                      </button>
                    ))}
                  </div>
                  {environment === "live" && (
                    <div className="mt-2 flex items-start gap-2 bg-[#FFF8E1] border border-[#FFB300]/30 rounded-xl p-3">
                      <AlertCircle className="w-4 h-4 text-[#FF8F00] mt-0.5 shrink-0" />
                      <p className="text-[10px] text-[#FF8F00] leading-relaxed">
                        <strong>Live mode uses real funds.</strong> Ensure your API key has trading permissions. Start with small sizes and test thoroughly with paper mode first.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-[#FFEBEE] border border-[#EF9A9A]/40 rounded-xl p-3">
                <AlertCircle className="w-4 h-4 text-[#EF5350] shrink-0" />
                <p className="text-[11px] text-[#EF5350]">{error}</p>
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 bg-[#E8F5E9] border border-[#66BB6A]/40 rounded-xl p-3">
                <CheckCircle className="w-4 h-4 text-[#26A69A] shrink-0" />
                <p className="text-[11px] text-[#26A69A]">{success}</p>
              </div>
            )}

            <button onClick={handleConnect} disabled={connecting || !brokerDef.fields.every(f => form[f.key])}
              className="flex items-center justify-center gap-2 bg-[#2962FF] hover:bg-[#1E53E5] disabled:bg-[#D1D4DC] text-white text-[12px] font-bold py-3 rounded-xl transition-all">
              {connecting ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying &amp; Connecting...</> : <><Link2 className="w-4 h-4" /> Connect {brokerDef.name}</>}
            </button>

            <div className="flex items-center gap-2 text-[10px] text-[#9598A1]">
              <Shield className="w-3.5 h-3.5 text-[#26A69A]" />
              API keys are stored encrypted in your private database and never shared.
            </div>
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="bg-white border border-[#E0E3EB] rounded-2xl p-5">
        <h2 className="text-[13px] font-bold text-[#131722] mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-[#2962FF]" />
          How Buy/Sell on Charts Works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { step: "1", title: "Open the Chart", desc: "Go to any chart — Gold, BTC, Nifty, stocks — using the Chart page." },
            { step: "2", title: "Click BUY or SELL", desc: "The green BUY and red SELL buttons appear on every chart. Click either one." },
            { step: "3", title: "Choose Mode", desc: "Pick Paper Money (default) or one of your connected brokers for live execution." },
          ].map(s => (
            <div key={s.step} className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-[#2962FF] text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.step}</div>
              <div>
                <p className="text-[12px] font-bold text-[#131722] mb-0.5">{s.title}</p>
                <p className="text-[10px] text-[#9598A1] leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
