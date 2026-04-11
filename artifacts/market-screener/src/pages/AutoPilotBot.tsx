import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  TrendingUp,
  TrendingDown,
  Activity,
  Settings,
  Trophy,
  AlertCircle,
  DollarSign,
  Target,
  Shield,
  ToggleLeft,
  ToggleRight,
  Trash2,
  ChevronUp,
  ChevronDown,
  Clock,
  Zap,
  BarChart2,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API_BASE}${path}`, opts);
  if (!r.ok) throw new Error(`API ${path} failed`);
  return r.json();
}

interface Trade {
  id: number;
  symbol: string;
  symbolLabel: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  currentPrice: number | null;
  pnl: number | null;
  pnlPercent: number | null;
  status: string;
  tradeType: string;
  confidence: number;
  reasoning: string;
  lotSize: number;
  createdAt: string;
  closedAt: string | null;
  closeReason: string | null;
}

interface Stats {
  openTrades: number;
  closedTrades: number;
  winRate: number;
  totalPnl: number;
  unrealizedPnl: number;
  wins: number;
  losses: number;
  avgConfidence: number;
  isRunning: boolean;
  virtualBalance: number;
}

interface BotSettings {
  isRunning: boolean;
  riskPercent: number;
  maxOpenTrades: number;
  enabledAssets: string[];
  enableScalp: boolean;
  enableIntraday: boolean;
  enableSwing: boolean;
  virtualBalance: number;
}

const ASSET_OPTIONS = [
  { value: "BTCUSD", label: "Bitcoin (BTC)" },
  { value: "XAUUSD", label: "Gold (XAU)" },
  { value: "XAGUSD", label: "Silver (XAG)" },
  { value: "EURUSD", label: "EUR/USD" },
  { value: "NIFTY50", label: "Nifty 50" },
];

function TradeTypeTag({ type }: { type: string }) {
  const map: Record<string, string> = {
    SCALP: "bg-purple-100 text-purple-700 border-purple-200",
    INTRADAY: "bg-blue-100 text-blue-700 border-blue-200",
    SWING: "bg-amber-100 text-amber-700 border-amber-200",
    POSITION: "bg-green-100 text-green-700 border-green-200",
  };
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${map[type] ?? "bg-gray-100 text-gray-600"}`}>
      {type}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? "#26A69A" : value >= 65 ? "#FF8F00" : "#EF5350";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-bold" style={{ color }}>{value}%</span>
    </div>
  );
}

function TradeCard({ trade }: { trade: Trade }) {
  const isBuy = trade.direction === "BUY";
  const isOpen = trade.status === "open";
  const isProfit = (trade.pnlPercent ?? 0) >= 0;
  const pnlColor = isProfit ? "#26A69A" : "#EF5350";

  const directionBg = isBuy ? "bg-[#E8F5E9] border-[#A5D6A7]" : "bg-[#FFEBEE] border-[#EF9A9A]";
  const directionText = isBuy ? "text-[#2E7D32]" : "text-[#C62828]";

  return (
    <div className={`bg-white border rounded-2xl p-4 ${isOpen ? "border-[#E0E3EB] shadow-sm" : "border-gray-100 opacity-80"}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl ${directionBg} border flex items-center justify-center`}>
            {isBuy ? (
              <TrendingUp className={`w-4 h-4 ${directionText}`} />
            ) : (
              <TrendingDown className={`w-4 h-4 ${directionText}`} />
            )}
          </div>
          <div>
            <div className="text-[13px] font-bold text-[#131722]">{trade.symbolLabel}</div>
            <div className="text-[10px] text-[#9598A1]">{trade.symbol}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TradeTypeTag type={trade.tradeType} />
          {isOpen ? (
            <span className="flex items-center gap-1 text-[9px] font-bold bg-[#E3F2FD] text-[#1565C0] border border-[#90CAF9] px-1.5 py-0.5 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-[#2196F3] animate-pulse" />
              LIVE
            </span>
          ) : trade.status === "closed_profit" ? (
            <span className="flex items-center gap-1 text-[9px] font-bold bg-[#E8F5E9] text-[#2E7D32] border border-[#A5D6A7] px-1.5 py-0.5 rounded-full">
              <CheckCircle className="w-2.5 h-2.5" /> WIN
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[9px] font-bold bg-[#FFEBEE] text-[#C62828] border border-[#EF9A9A] px-1.5 py-0.5 rounded-full">
              <XCircle className="w-2.5 h-2.5" /> LOSS
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-[#F8F9FE] rounded-xl p-2 text-center">
          <div className="text-[9px] text-[#9598A1] mb-0.5">Entry</div>
          <div className="text-[11px] font-bold text-[#131722]">${trade.entryPrice.toFixed(2)}</div>
        </div>
        <div className="bg-[#E8F5E9] rounded-xl p-2 text-center">
          <div className="text-[9px] text-[#26A69A] mb-0.5">Target</div>
          <div className="text-[11px] font-bold text-[#26A69A]">${trade.targetPrice.toFixed(2)}</div>
        </div>
        <div className="bg-[#FFEBEE] rounded-xl p-2 text-center">
          <div className="text-[9px] text-[#EF5350] mb-0.5">Stop Loss</div>
          <div className="text-[11px] font-bold text-[#EF5350]">${trade.stopLoss.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <ConfidenceBar value={trade.confidence} />
        <div className="text-right">
          <div className="text-[10px] text-[#9598A1]">P&L</div>
          <div className="text-[13px] font-bold" style={{ color: pnlColor }}>
            {(trade.pnlPercent ?? 0) >= 0 ? "+" : ""}{(trade.pnlPercent ?? 0).toFixed(2)}%
          </div>
        </div>
      </div>

      <p className="text-[10px] text-[#9598A1] leading-relaxed border-t border-gray-50 pt-2">
        {trade.reasoning}
      </p>

      {!isOpen && trade.closeReason && (
        <div className="text-[9px] text-[#9598A1] mt-1 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {trade.closeReason} · {new Date(trade.closedAt!).toLocaleString()}
        </div>
      )}
    </div>
  );
}

export function AutoPilotBot() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"live" | "history">("live");
  const [showSettings, setShowSettings] = useState(false);
  const [localSettings, setLocalSettings] = useState<Partial<BotSettings>>({});

  const { data: statsData, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["bot-stats"],
    queryFn: () => apiFetch("/bot/stats"),
    refetchInterval: 10000,
  });

  const { data: tradesData, isLoading: tradesLoading } = useQuery<{ trades: Trade[] }>({
    queryKey: ["bot-trades"],
    queryFn: () => apiFetch("/bot/trades"),
    refetchInterval: 10000,
  });

  const { data: settingsData } = useQuery<BotSettings>({
    queryKey: ["bot-settings"],
    queryFn: () => apiFetch("/bot/settings"),
  });

  useEffect(() => {
    if (settingsData) setLocalSettings(settingsData);
  }, [settingsData]);

  const toggleMutation = useMutation({
    mutationFn: () => apiFetch("/bot/toggle", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-stats"] });
      qc.invalidateQueries({ queryKey: ["bot-settings"] });
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (s: Partial<BotSettings>) =>
      apiFetch("/bot/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-settings"] });
      qc.invalidateQueries({ queryKey: ["bot-stats"] });
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: () => apiFetch("/bot/trades", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bot-trades"] }),
  });

  const trades = tradesData?.trades ?? [];
  const openTrades = trades.filter(t => t.status === "open");
  const closedTrades = trades.filter(t => t.status !== "open");
  const stats = statsData;
  const isRunning = stats?.isRunning ?? true;

  const totalEquity = (stats?.virtualBalance ?? 10000) + (stats?.totalPnl ?? 0);
  const equityChange = ((totalEquity - (stats?.virtualBalance ?? 10000)) / (stats?.virtualBalance ?? 10000)) * 100;

  function toggleAsset(symbol: string) {
    const current = localSettings.enabledAssets ?? [];
    const next = current.includes(symbol) ? current.filter(s => s !== symbol) : [...current, symbol];
    setLocalSettings(s => ({ ...s, enabledAssets: next }));
  }

  function saveSettings() {
    updateSettingsMutation.mutate(localSettings);
    setShowSettings(false);
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8F9FE] p-4 lg:p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#2962FF] to-[#7C3AED] flex items-center justify-center shadow-lg">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#131722]">AutoPilot Bot</h1>
              <p className="text-[11px] text-[#9598A1]">AI-powered paper trading · fully autonomous</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(s => !s)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-[#E0E3EB] rounded-xl text-[12px] text-[#131722] font-medium hover:bg-[#F0F3FA] transition-all"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </button>
            <button
              onClick={() => toggleMutation.mutate()}
              disabled={toggleMutation.isPending}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold transition-all shadow-sm ${
                isRunning
                  ? "bg-[#EF5350] hover:bg-[#D32F2F] text-white"
                  : "bg-[#26A69A] hover:bg-[#00897B] text-white"
              }`}
            >
              {toggleMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isRunning ? (
                <ToggleRight className="w-3.5 h-3.5" />
              ) : (
                <ToggleLeft className="w-3.5 h-3.5" />
              )}
              {isRunning ? "Pause Bot" : "Start Bot"}
            </button>
          </div>
        </div>

        {/* Bot Status Banner */}
        <div className={`rounded-2xl p-4 border flex items-center gap-4 ${
          isRunning
            ? "bg-gradient-to-r from-[#E8F5E9] to-[#F1F8E9] border-[#A5D6A7]"
            : "bg-gradient-to-r from-[#FFF8E1] to-[#FFFDE7] border-[#FFB300]/40"
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isRunning ? "bg-[#26A69A]" : "bg-[#FF8F00]"}`}>
            {isRunning ? <Activity className="w-5 h-5 text-white" /> : <AlertCircle className="w-5 h-5 text-white" />}
          </div>
          <div className="flex-1">
            <div className={`text-[13px] font-bold ${isRunning ? "text-[#1B5E20]" : "text-[#E65100]"}`}>
              {isRunning ? "Bot is running autonomously" : "Bot is paused"}
            </div>
            <div className="text-[11px] text-[#9598A1]">
              {isRunning
                ? "Analyzing markets every 5 minutes · AI generates signals automatically · no user action required"
                : "Resume bot to start generating AI signals and paper trades"}
            </div>
          </div>
          {isRunning && <div className="w-2.5 h-2.5 rounded-full bg-[#26A69A] animate-pulse" />}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-[#E0E3EB] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-[#E3F2FD] flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-[#1565C0]" />
              </div>
              <span className="text-[11px] text-[#9598A1] font-medium">Virtual Equity</span>
            </div>
            <div className="text-[20px] font-bold text-[#131722]">
              ${statsLoading ? "..." : totalEquity.toFixed(0)}
            </div>
            <div className={`text-[11px] font-medium mt-0.5 ${equityChange >= 0 ? "text-[#26A69A]" : "text-[#EF5350]"}`}>
              {equityChange >= 0 ? "+" : ""}{equityChange.toFixed(2)}% total
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-[#E0E3EB] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-[#E8F5E9] flex items-center justify-center">
                <Trophy className="w-4 h-4 text-[#2E7D32]" />
              </div>
              <span className="text-[11px] text-[#9598A1] font-medium">Win Rate</span>
            </div>
            <div className="text-[20px] font-bold text-[#131722]">
              {statsLoading ? "..." : `${stats?.winRate ?? 0}%`}
            </div>
            <div className="text-[11px] text-[#9598A1] mt-0.5">
              {stats?.wins ?? 0}W / {stats?.losses ?? 0}L
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-[#E0E3EB] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#EDE7F6] to-[#F3E5F5] flex items-center justify-center">
                <BarChart2 className="w-4 h-4 text-[#7C3AED]" />
              </div>
              <span className="text-[11px] text-[#9598A1] font-medium">Realized P&L</span>
            </div>
            <div className={`text-[20px] font-bold ${(stats?.totalPnl ?? 0) >= 0 ? "text-[#26A69A]" : "text-[#EF5350]"}`}>
              {statsLoading ? "..." : `${(stats?.totalPnl ?? 0) >= 0 ? "+" : ""}$${(stats?.totalPnl ?? 0).toFixed(2)}`}
            </div>
            <div className="text-[11px] text-[#9598A1] mt-0.5">{stats?.closedTrades ?? 0} closed trades</div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-[#E0E3EB] shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-[#FFF8E1] flex items-center justify-center">
                <Zap className="w-4 h-4 text-[#FF8F00]" />
              </div>
              <span className="text-[11px] text-[#9598A1] font-medium">Open Trades</span>
            </div>
            <div className="text-[20px] font-bold text-[#131722]">
              {statsLoading ? "..." : stats?.openTrades ?? 0}
            </div>
            <div className={`text-[11px] font-medium mt-0.5 ${(stats?.unrealizedPnl ?? 0) >= 0 ? "text-[#26A69A]" : "text-[#EF5350]"}`}>
              {(stats?.unrealizedPnl ?? 0) >= 0 ? "+" : ""}${(stats?.unrealizedPnl ?? 0).toFixed(2)} unrealized
            </div>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-white rounded-2xl border border-[#E0E3EB] shadow-sm p-5">
            <h2 className="text-[14px] font-bold text-[#131722] mb-4 flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#2962FF]" />
              Bot Settings
              <span className="text-[10px] text-[#9598A1] font-normal">(Bot auto-sets optimal values — change only if needed)</span>
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <label className="block text-[11px] font-medium text-[#9598A1] mb-1.5">Risk per Trade (%)</label>
                <input
                  type="number"
                  min={0.1} max={5} step={0.1}
                  value={localSettings.riskPercent ?? 1}
                  onChange={e => setLocalSettings(s => ({ ...s, riskPercent: parseFloat(e.target.value) }))}
                  className="w-full border border-[#E0E3EB] rounded-xl px-3 py-2 text-[13px] text-[#131722] bg-[#F8F9FE] focus:outline-none focus:border-[#2962FF]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#9598A1] mb-1.5">Max Open Trades</label>
                <input
                  type="number"
                  min={1} max={20} step={1}
                  value={localSettings.maxOpenTrades ?? 5}
                  onChange={e => setLocalSettings(s => ({ ...s, maxOpenTrades: parseInt(e.target.value) }))}
                  className="w-full border border-[#E0E3EB] rounded-xl px-3 py-2 text-[13px] text-[#131722] bg-[#F8F9FE] focus:outline-none focus:border-[#2962FF]"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-[11px] font-medium text-[#9598A1] mb-2">Enabled Assets</label>
              <div className="flex flex-wrap gap-2">
                {ASSET_OPTIONS.map(a => {
                  const active = (localSettings.enabledAssets ?? []).includes(a.value);
                  return (
                    <button
                      key={a.value}
                      onClick={() => toggleAsset(a.value)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-medium border transition-all ${
                        active
                          ? "bg-[#2962FF] text-white border-[#2962FF]"
                          : "bg-white text-[#9598A1] border-[#E0E3EB] hover:border-[#2962FF]"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-[11px] font-medium text-[#9598A1] mb-2">Trade Types</label>
              <div className="flex gap-3">
                {[
                  { key: "enableScalp", label: "SCALP" },
                  { key: "enableIntraday", label: "INTRADAY" },
                  { key: "enableSwing", label: "SWING" },
                ].map(({ key, label }) => {
                  const val = localSettings[key as keyof BotSettings] as boolean ?? true;
                  return (
                    <button
                      key={key}
                      onClick={() => setLocalSettings(s => ({ ...s, [key]: !val }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium border transition-all ${
                        val
                          ? "bg-[#2962FF] text-white border-[#2962FF]"
                          : "bg-white text-[#9598A1] border-[#E0E3EB]"
                      }`}
                    >
                      {val ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-gray-50">
              <button
                onClick={() => { setLocalSettings(settingsData ?? {}); setShowSettings(false); }}
                className="px-4 py-2 text-[12px] text-[#9598A1] hover:text-[#131722] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                disabled={updateSettingsMutation.isPending}
                className="flex items-center gap-1.5 px-5 py-2 bg-[#2962FF] hover:bg-[#1E53E5] text-white text-[12px] font-bold rounded-xl transition-all shadow-sm"
              >
                {updateSettingsMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Settings
              </button>
            </div>
          </div>
        )}

        {/* Trades Tabs */}
        <div className="bg-white rounded-2xl border border-[#E0E3EB] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E0E3EB]">
            <div className="flex gap-1 bg-[#F0F3FA] rounded-xl p-1">
              <button
                onClick={() => setTab("live")}
                className={`px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                  tab === "live"
                    ? "bg-white text-[#131722] shadow-sm"
                    : "text-[#9598A1] hover:text-[#131722]"
                }`}
              >
                Open Trades
                {openTrades.length > 0 && (
                  <span className="ml-1.5 text-[10px] bg-[#2962FF] text-white rounded-full px-1.5 py-0.5 font-bold">
                    {openTrades.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab("history")}
                className={`px-4 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                  tab === "history"
                    ? "bg-white text-[#131722] shadow-sm"
                    : "text-[#9598A1] hover:text-[#131722]"
                }`}
              >
                History
                {closedTrades.length > 0 && (
                  <span className="ml-1.5 text-[10px] bg-[#9598A1] text-white rounded-full px-1.5 py-0.5 font-bold">
                    {closedTrades.length}
                  </span>
                )}
              </button>
            </div>
            {tab === "history" && closedTrades.length > 0 && (
              <button
                onClick={() => clearHistoryMutation.mutate()}
                disabled={clearHistoryMutation.isPending}
                className="flex items-center gap-1 text-[11px] text-[#EF5350] hover:text-[#C62828] transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>

          <div className="p-4">
            {tradesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[#2962FF]" />
              </div>
            ) : tab === "live" ? (
              openTrades.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#F0F3FA] flex items-center justify-center mb-3">
                    <Bot className="w-6 h-6 text-[#9598A1]" />
                  </div>
                  <p className="text-[13px] font-medium text-[#9598A1]">
                    {isRunning ? "Bot is scanning markets…" : "Bot is paused"}
                  </p>
                  <p className="text-[11px] text-[#9598A1] mt-1">
                    {isRunning ? "New trades will appear here automatically every 5 minutes" : "Start the bot to begin paper trading"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {openTrades.map(t => <TradeCard key={t.id} trade={t} />)}
                </div>
              )
            ) : (
              closedTrades.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-[#F0F3FA] flex items-center justify-center mb-3">
                    <BarChart2 className="w-6 h-6 text-[#9598A1]" />
                  </div>
                  <p className="text-[13px] font-medium text-[#9598A1]">No closed trades yet</p>
                  <p className="text-[11px] text-[#9598A1] mt-1">Trades will appear here after the bot closes them</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {closedTrades.map(t => <TradeCard key={t.id} trade={t} />)}
                </div>
              )
            )}
          </div>
        </div>

        {/* How it works */}
        <div className="bg-gradient-to-br from-[#EDE7F6] to-[#F3E5F5] rounded-2xl p-5 border border-[#CE93D8]/30">
          <h3 className="text-[13px] font-bold text-[#4A148C] mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            How AutoPilot Works
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {[
              { icon: Activity, title: "Market Scanning", desc: "Every 5 minutes, the bot scans Gold, BTC, Silver, Forex & Nifty for high-confidence setups" },
              { icon: Target, title: "AI Signal Generation", desc: "Groq AI analyzes OHLC data, news sentiment and market context to generate BUY/SELL signals" },
              { icon: Shield, title: "Auto Risk Management", desc: "Entry, target and stop-loss are auto-calculated. Trades close automatically when TP/SL is hit" },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white/60 rounded-xl p-3">
                <Icon className="w-4 h-4 text-[#7C3AED] mb-2" />
                <div className="text-[11px] font-bold text-[#4A148C] mb-1">{title}</div>
                <div className="text-[10px] text-[#9598A1] leading-relaxed">{desc}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
