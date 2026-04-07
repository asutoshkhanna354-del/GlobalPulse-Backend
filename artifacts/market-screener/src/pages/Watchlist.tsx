import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWatchlist,
  useAddToWatchlist,
  useRemoveFromWatchlist,
  getGetWatchlistQueryKey,
} from "@workspace/api-client-react";
import { Star, Plus, Trash2, X } from "lucide-react";

const TYPE_COLORS: Record<string, string> = {
  asset: "text-blue-600 bg-blue-50 border-blue-200",
  indicator: "text-purple-600 bg-purple-50 border-purple-200",
  event: "text-orange-600 bg-orange-50 border-orange-200",
  country: "text-teal-600 bg-teal-50 border-teal-200",
};

export function Watchlist() {
  const queryClient = useQueryClient();
  const { data: watchlist, isLoading } = useGetWatchlist();
  const addMutation = useAddToWatchlist();
  const removeMutation = useRemoveFromWatchlist();

  const [showForm, setShowForm] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"asset" | "indicator" | "event" | "country">("asset");
  const [notes, setNotes] = useState("");

  const handleAdd = () => {
    if (!symbol.trim() || !name.trim()) return;
    addMutation.mutate(
      { data: { symbol, name, type, notes: notes || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
          setSymbol(""); setName(""); setNotes(""); setShowForm(false);
        },
      }
    );
  };

  const handleRemove = (id: number) => {
    removeMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetWatchlistQueryKey() });
        },
      }
    );
  };

  return (
    <div className="flex-1 overflow-auto p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-foreground">Watchlist</h1>
          <p className="text-[11px] text-muted-foreground">Track assets, indicators, events, and countries</p>
        </div>
        <button
          data-testid="add-watchlist-btn"
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-[11px] rounded hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" /> Add Item
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-foreground font-medium">Add to Watchlist</span>
            <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1">Symbol</label>
              <input
                data-testid="watchlist-symbol"
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                placeholder="e.g. XAUUSD"
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1">Name</label>
              <input
                data-testid="watchlist-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Gold"
                className="w-full bg-background border border-border rounded px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1">Type</label>
            <div className="flex gap-1.5">
              {(["asset", "indicator", "event", "country"] as const).map(t => (
                <button
                  key={t}
                  data-testid={`type-${t}`}
                  onClick={() => setType(t)}
                  className={`px-2.5 py-1 text-[10px] rounded border capitalize transition-colors ${type === t ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:text-foreground"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-widest block mb-1">Notes (optional)</label>
            <input
              data-testid="watchlist-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Why you're watching this..."
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-primary placeholder:text-muted-foreground"
            />
          </div>
          <button
            data-testid="submit-watchlist"
            onClick={handleAdd}
            disabled={!symbol.trim() || !name.trim() || addMutation.isPending}
            className="w-full py-1.5 bg-primary text-primary-foreground text-[11px] rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {addMutation.isPending ? "Adding..." : "Add to Watchlist"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-card rounded border border-border animate-pulse" />
          ))
        ) : (watchlist ?? []).length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Star className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground text-sm">Your watchlist is empty.</p>
            <p className="text-[11px] text-muted-foreground">Add assets, indicators, events, or countries to track them here.</p>
          </div>
        ) : (
          (watchlist ?? []).map(item => {
            const typeStyle = TYPE_COLORS[item.type] ?? TYPE_COLORS.asset;
            return (
              <div
                key={item.id}
                data-testid={`watchlist-item-${item.id}`}
                className="bg-card border border-border rounded p-3 flex items-start gap-3 hover:bg-muted/10 transition-colors"
              >
                <Star className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono font-semibold text-foreground text-xs">{item.symbol}</span>
                    <span className="text-[11px] text-muted-foreground">{item.name}</span>
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] capitalize ml-auto ${typeStyle}`}>{item.type}</span>
                  </div>
                  {item.notes && (
                    <p className="text-[11px] text-muted-foreground">{item.notes}</p>
                  )}
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Added {new Date(item.addedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })}
                  </div>
                </div>
                <button
                  data-testid={`remove-watchlist-${item.id}`}
                  onClick={() => handleRemove(item.id)}
                  disabled={removeMutation.isPending}
                  className="text-muted-foreground hover:text-red-400 transition-colors p-1 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
