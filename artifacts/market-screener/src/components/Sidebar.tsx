import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  Globe,
  Newspaper,
  Star,
  CandlestickChart,
  Radio,
  Menu,
  X,
  Crown,
  Zap,
  Activity,
  LogOut,
  Monitor,
  Bitcoin,
  Bell,
  Bot,
  Lock,
  Link2,
  User,
  LogIn,
} from "lucide-react";
import { usePremium } from "@/contexts/PremiumContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/bot", label: "AutoPilot Bot", icon: Bot, pro: true },
  { path: "/brokers", label: "Connect Broker", icon: Link2, pro: true },
  { path: "/terminal", label: "Terminal", icon: Monitor, beta: true },
  { path: "/chart", label: "Chart", icon: CandlestickChart, premium: true },
  { path: "/nifty", label: "Nifty 50", icon: Zap, premium: true },
  { path: "/bitcoin", label: "Bitcoin", icon: Bitcoin, premium: true },
  { path: "/markets", label: "Markets", icon: TrendingUp },
  { path: "/stocks", label: "Stocks", icon: BarChart3 },
  { path: "/economics", label: "Economics", icon: Globe },
  { path: "/geopolitical", label: "Geopolitical", icon: Activity },
  { path: "/news", label: "News", icon: Newspaper },
  { path: "/social", label: "Social Intel", icon: Radio },
  { path: "/watchlist", label: "Watchlist", icon: Star },
];

export function Sidebar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isPremium, setShowActivation, deactivate } = usePremium();
  const { subscribedSymbols, setShowManager, isSupported: notifSupported } = useNotifications();
  const { user, logout, setShowAuthModal } = useAuth();

  useEffect(() => { setMobileOpen(false); }, [location]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-0 left-0 z-50 p-2.5 m-0 bg-white/90 backdrop-blur-xl border-r border-b border-[#E0E3EB] rounded-br-xl"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5 text-[#131722]" />
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-[#131722]/30 backdrop-blur-sm z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`
        fixed lg:relative z-50
        w-[220px] min-h-screen bg-[#F0F3FA] border-r border-[#E0E3EB] flex flex-col shrink-0
        transition-transform duration-300 ease-out overflow-hidden
        ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <div className="px-4 py-5 border-b border-[#E0E3EB] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#2962FF] flex items-center justify-center shadow-sm">
              <Activity className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-[#131722] tracking-wide">GlobalPulse</div>
              <div className="text-[9px] text-[#9598A1] uppercase tracking-[0.2em]">Intelligence</div>
            </div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1 text-[#9598A1] hover:text-[#131722]"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ path, label, icon: Icon, premium, beta, pro }) => {
            const isActive = path === "/" ? location === "/" : location.startsWith(path);
            const locked = pro && !isPremium;
            const inner = (
              <div
                data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-all cursor-pointer group ${
                  locked
                    ? "text-[#9598A1] opacity-70 hover:bg-white/40 hover:opacity-90"
                    : isActive
                    ? "bg-white text-[#131722] shadow-sm border border-[#E0E3EB]"
                    : "text-[#9598A1] hover:bg-white/60 hover:text-[#131722]"
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive && !locked ? "text-[#2962FF]" : "group-hover:text-[#131722]"}`} />
                <span className="flex-1 font-medium">{label}</span>
                {pro && isPremium && (
                  <span className="text-[7px] bg-gradient-to-r from-[#EDE7F6] to-[#F3E5F5] text-[#7C3AED] border border-[#CE93D8]/40 px-1.5 py-0.5 rounded-full font-bold tracking-wider">AI PRO</span>
                )}
                {locked && <Lock className="w-3 h-3 text-[#FFB300]" />}
                {beta && (
                  <span className="text-[7px] bg-[#E8F5E9] text-[#2E7D32] border border-[#66BB6A]/30 px-1.5 py-0.5 rounded-full font-bold tracking-wider">BETA</span>
                )}
                {premium && isPremium && <Crown className="w-3 h-3 text-[#FF8F00]" />}
                {premium && !isPremium && (
                  <span className="text-[7px] bg-[#FFF8E1] text-[#FF8F00] border border-[#FFB300]/30 px-1.5 py-0.5 rounded-full font-bold tracking-wider">PRO</span>
                )}
                {isActive && !locked && <div className="w-0.5 h-4 rounded-full bg-[#2962FF]" />}
              </div>
            );
            if (locked) {
              return (
                <button key={path} className="w-full text-left" onClick={() => setShowActivation(true)}>
                  {inner}
                </button>
              );
            }
            return <Link key={path} href={path}>{inner}</Link>;
          })}
        </nav>

        <div className="px-3 py-4 border-t border-[#E0E3EB] space-y-3">

          {/* User account panel */}
          {user ? (
            <div className="bg-white border border-[#E0E3EB] rounded-xl p-3 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#2962FF] flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-white">
                  {user.username[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold text-[#131722] truncate">{user.username}</div>
                <div className="text-[9px] text-[#9598A1] truncate">{user.email}</div>
              </div>
              <button onClick={logout} title="Sign out"
                className="w-6 h-6 flex items-center justify-center rounded-lg text-[#9598A1] hover:text-[#EF5350] hover:bg-red-50 transition-all shrink-0">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="w-full flex items-center justify-center gap-1.5 bg-white border border-[#E0E3EB] hover:border-[#2962FF] hover:bg-[#EEF2FF] text-[#131722] text-[11px] font-bold py-2.5 rounded-xl transition-all"
            >
              <LogIn className="w-3.5 h-3.5 text-[#2962FF]" />
              Sign In
            </button>
          )}

          {isPremium ? (
            <div className="bg-[#FFF8E1] border border-[#FFB300]/30 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#FFB300] to-[#FF8F00] flex items-center justify-center">
                  <Crown className="w-3 h-3 text-white" />
                </div>
                <span className="text-[11px] font-bold text-[#FF8F00]">PREMIUM</span>
              </div>
              <p className="text-[9px] text-[#9598A1] mb-2">Pro signals unlocked</p>
              <button
                onClick={deactivate}
                className="flex items-center gap-1 text-[9px] text-[#9598A1] hover:text-[#EF5350] transition-colors"
              >
                <LogOut className="w-2.5 h-2.5" />
                Deactivate
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowActivation(true)}
              className="w-full bg-[#2962FF] hover:bg-[#1E53E5] text-white text-[11px] font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              <Crown className="w-3.5 h-3.5" />
              Unlock Premium
            </button>
          )}

          <div className="flex items-center gap-2 px-1">
            <div className="w-2 h-2 rounded-full bg-[#26A69A] live-pulse" />
            <span className="text-[10px] text-[#9598A1]">Live Data</span>
            <Zap className="w-3 h-3 text-[#FF8F00] ml-auto" />
          </div>

          {isPremium && notifSupported && (
            <button
              onClick={() => setShowManager(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#F0F3FA] hover:bg-white/80 border border-[#E0E3EB] transition-all w-full"
            >
              <Bell className="w-3.5 h-3.5 text-[#2962FF] shrink-0" />
              <span className="text-[11px] font-medium text-[#131722] flex-1 text-left">Notifications</span>
              {subscribedSymbols.length > 0 && (
                <span className="text-[9px] bg-[#2962FF] text-white rounded-full px-1.5 py-0.5 font-bold">
                  {subscribedSymbols.length}
                </span>
              )}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
