import { Bell, BellOff, X, Loader2, AlertCircle } from "lucide-react";
import { useNotifications } from "@/contexts/NotificationContext";
import { usePremium } from "@/contexts/PremiumContext";

export function NotificationModal() {
  const { showManager, setShowManager, subscribedSymbols, toggleSubscription, loadingSymbol, isSupported, isInIframe, permission } =
    useNotifications();
  const { isPremium } = usePremium();

  if (!showManager) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowManager(false)}>
      <div className="absolute inset-0 bg-[#131722]/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-white border border-[#E0E3EB] rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E0E3EB]">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#2962FF]" />
            <span className="text-sm font-bold text-[#131722]">Signal Notifications</span>
          </div>
          <button
            onClick={() => setShowManager(false)}
            className="text-[#9598A1] hover:text-[#131722] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          {!isPremium && (
            <div className="flex items-start gap-2.5 bg-[#FFF8E1] border border-[#FFB300]/30 rounded-xl p-3 mb-4">
              <AlertCircle className="w-4 h-4 text-[#FF8F00] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#FF8F00]">Signal notifications are a PRO feature. Activate your key to enable them.</p>
            </div>
          )}

          {isPremium && !isSupported && isInIframe && (
            <div className="flex items-start gap-2.5 bg-[#E3F2FD] border border-[#2962FF]/20 rounded-xl p-3 mb-4">
              <AlertCircle className="w-4 h-4 text-[#2962FF] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#2962FF]">
                Open GlobalPulse in a new browser tab to enable push notifications. They cannot be activated inside an embedded frame.
              </p>
            </div>
          )}

          {isPremium && !isSupported && !isInIframe && (
            <div className="flex items-start gap-2.5 bg-[#FDECEA] border border-[#EF5350]/20 rounded-xl p-3 mb-4">
              <AlertCircle className="w-4 h-4 text-[#EF5350] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#EF5350]">Push notifications are not supported in your browser.</p>
            </div>
          )}

          {isPremium && isSupported && permission === "denied" && (
            <div className="flex items-start gap-2.5 bg-[#FDECEA] border border-[#EF5350]/20 rounded-xl p-3 mb-4">
              <AlertCircle className="w-4 h-4 text-[#EF5350] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#EF5350]">
                Notifications are blocked in your browser settings. Please enable them in your browser&apos;s site permissions.
              </p>
            </div>
          )}

          {subscribedSymbols.length === 0 ? (
            <div className="text-center py-6">
              <BellOff className="w-8 h-8 text-[#E0E3EB] mx-auto mb-2" />
              <p className="text-[11px] text-[#9598A1]">No subscriptions yet</p>
              <p className="text-[10px] text-[#9598A1] mt-1">
                Open the chart, select a symbol, and tap the bell icon to subscribe.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-[#9598A1] font-semibold uppercase tracking-wider mb-3">
                Subscribed Symbols ({subscribedSymbols.length})
              </p>
              {subscribedSymbols.map(sub => (
                <div
                  key={sub.symbol}
                  className="flex items-center justify-between bg-[#F0F3FA] rounded-xl px-3 py-2.5"
                >
                  <div>
                    <p className="text-[12px] font-semibold text-[#131722]">{sub.symbolLabel}</p>
                    <p className="text-[9px] text-[#9598A1]">{sub.symbol}</p>
                  </div>
                  <button
                    onClick={() => toggleSubscription(sub.symbol, sub.symbolLabel)}
                    disabled={loadingSymbol === sub.symbol}
                    className="flex items-center gap-1 bg-[#EF5350]/10 border border-[#EF5350]/20 rounded-lg px-2 py-1 text-[#EF5350] hover:bg-[#EF5350]/20 transition-all text-[10px] font-medium disabled:opacity-50"
                  >
                    {loadingSymbol === sub.symbol ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <BellOff className="w-3 h-3" />
                    )}
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="text-[9px] text-[#9598A1] mt-4 text-center leading-relaxed">
            Notifications are sent when new BUY/SELL signals are detected for subscribed symbols. Works even when the tab is closed.
          </p>
        </div>
      </div>
    </div>
  );
}
