import { useState } from "react";
import { usePremium } from "@/contexts/PremiumContext";
import { X, Key, Crown, Shield, Zap } from "lucide-react";

export function PremiumModal() {
  const { showActivation, setShowActivation, activateKey } = usePremium();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  if (!showActivation) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) {
      setError("Please enter a key");
      return;
    }
    const success = activateKey(key);
    if (!success) {
      setError("Invalid subscription key");
      setKey("");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4">
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-violet-500 rounded-full filter blur-[80px] opacity-[0.12]" />
        <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-amber-400 rounded-full filter blur-[60px] opacity-[0.1]" />

        <div className="bg-white border border-border rounded-2xl shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-foreground font-semibold text-lg">Premium Access</h2>
                <p className="text-muted-foreground text-xs">Unlock Pro Trading Signals</p>
              </div>
            </div>
            <button onClick={() => setShowActivation(false)} className="text-muted-foreground hover:text-foreground p-1 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-card-inner p-3 text-center">
                <Zap className="w-5 h-5 text-amber-500 mx-auto mb-1.5" />
                <p className="text-[10px] text-muted-foreground">Real-time Signals</p>
              </div>
              <div className="glass-card-inner p-3 text-center">
                <Shield className="w-5 h-5 text-violet-500 mx-auto mb-1.5" />
                <p className="text-[10px] text-muted-foreground">Smart Engine</p>
              </div>
              <div className="glass-card-inner p-3 text-center">
                <Key className="w-5 h-5 text-emerald-500 mx-auto mb-1.5" />
                <p className="text-[10px] text-muted-foreground">Lifetime Access</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Subscription Key</label>
                <input
                  type="text"
                  value={key}
                  onChange={e => { setKey(e.target.value); setError(""); }}
                  placeholder="Enter your premium key"
                  className="w-full bg-muted border border-border rounded-xl px-4 py-3 text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 font-mono tracking-wider transition-colors"
                  autoFocus
                />
                {error && <p className="text-red-600 text-xs mt-1.5">{error}</p>}
              </div>
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20"
              >
                Activate Premium
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
