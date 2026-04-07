import { useState } from "react";
import { useGetMarketData } from "@workspace/api-client-react";
import { ArrowUpRight, ArrowDownRight, Search, ArrowUp, ArrowDown, X, TrendingUp, BarChart2 } from "lucide-react";
import { AssetChartPanel } from "@/components/AssetChartPanel";

type Category = "indices" | "currencies" | "commodities" | "crypto" | "bonds";
type SortKey = "symbol" | "price" | "change" | "changePercent";
type SortDir = "asc" | "desc";

const CATEGORIES: { key: Category | undefined; label: string }[] = [
  { key: undefined, label: "All" },
  { key: "indices", label: "Indices" },
  { key: "currencies", label: "Currencies" },
  { key: "commodities", label: "Commodities" },
  { key: "crypto", label: "Crypto" },
  { key: "bonds", label: "Bonds" },
];

function MiniBar({ pct }: { pct: number }) {
  const clamped = Math.max(-10, Math.min(10, pct));
  const width = Math.abs(clamped) * 10;
  const isUp = pct >= 0;
  return (
    <div className="flex items-center gap-1 justify-end">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden flex items-center">
        {isUp ? (
          <div className="h-full bg-signal-up rounded-full ml-auto" style={{ width: `${width}%` }} />
        ) : (
          <div className="h-full bg-signal-down rounded-full mr-auto" style={{ width: `${width}%` }} />
        )}
      </div>
    </div>
  );
}

export function Markets() {
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("changePercent");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedSymbol, setSelectedSymbol] = useState<{ symbol: string; name: string } | null>(null);

  const { data: assets, isLoading } = useGetMarketData(
    category ? { category } : {},
    { query: { refetchInterval: 30000 } }
  );

  const filtered = (assets ?? []).filter(a =>
    a.symbol.toLowerCase().includes(search.toLowerCase()) ||
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    const aVal = a[sortKey] as number | string;
    const bVal = b[sortKey] as number | string;
    if (typeof aVal === "string") {
      return sortDir === "asc" ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
    }
    return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />;
  };

  const formatVolume = (vol: string | null | undefined) => {
    if (!vol) return "—";
    return vol;
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className={`flex flex-col overflow-hidden transition-all duration-300 ${selectedSymbol ? "w-full lg:w-[55%]" : "w-full"}`}>
        <div className="p-3 sm:p-4 space-y-3 flex-1 overflow-auto">
          <div>
            <h1 className="text-base font-semibold text-foreground">Market Screener</h1>
            <p className="text-[11px] text-muted-foreground">Global markets — indices, currencies, commodities, crypto, bonds · Click any row to view chart</p>
          </div>

          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(({ key, label }) => (
              <button
                key={label}
                data-testid={`filter-${label.toLowerCase()}`}
                onClick={() => setCategory(key)}
                className={`px-3 py-1 text-[11px] rounded border transition-colors ${
                  category === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 bg-card border border-border rounded px-2">
              <Search className="w-3 h-3 text-muted-foreground" />
              <input
                data-testid="market-search"
                className="bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground w-36 py-1"
                placeholder="Search symbol or name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-card border border-border rounded overflow-x-auto">
            <table className="w-full text-[11px] min-w-[600px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-3 py-2 w-8 font-medium">#</th>
                  <th className="text-left px-3 py-2 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort("symbol")}>
                    <div className="flex items-center gap-1">SYMBOL <SortIcon col="symbol" /></div>
                  </th>
                  <th className="text-left px-3 py-2 font-medium">NAME</th>
                  <th className="text-left px-3 py-2 font-medium">CATEGORY</th>
                  <th className="text-right px-3 py-2 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort("price")}>
                    <div className="flex items-center gap-1 justify-end">PRICE <SortIcon col="price" /></div>
                  </th>
                  <th className="text-right px-3 py-2 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort("change")}>
                    <div className="flex items-center gap-1 justify-end">CHANGE <SortIcon col="change" /></div>
                  </th>
                  <th className="text-right px-3 py-2 font-medium cursor-pointer hover:text-foreground" onClick={() => handleSort("changePercent")}>
                    <div className="flex items-center gap-1 justify-end">% CHANGE <SortIcon col="changePercent" /></div>
                  </th>
                  <th className="text-right px-3 py-2 font-medium w-24">TREND</th>
                  <th className="text-right px-3 py-2 font-medium">VOLUME</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-muted-foreground">Loading market data...</td>
                  </tr>
                )}
                {sorted.map((asset, i) => {
                  const up = asset.changePercent >= 0;
                  const isSelected = selectedSymbol?.symbol === asset.symbol;
                  return (
                    <tr
                      key={asset.id}
                      data-testid={`market-row-${asset.symbol}`}
                      className={`border-b border-border/50 transition-colors cursor-pointer ${
                        isSelected ? "bg-primary/10" : "hover:bg-card/80"
                      }`}
                      onClick={() => setSelectedSymbol(isSelected ? null : { symbol: asset.symbol, name: asset.name })}
                    >
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {asset.flag && <span>{asset.flag}</span>}
                          <span className="font-mono font-semibold text-foreground">{asset.symbol}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{asset.name}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider border ${
                          asset.category === "crypto" ? "border-violet-200 text-violet-600 bg-violet-50" :
                          asset.category === "indices" ? "border-blue-200 text-blue-600 bg-blue-50" :
                          asset.category === "commodities" ? "border-yellow-200 text-yellow-700 bg-yellow-50" :
                          asset.category === "currencies" ? "border-cyan-200 text-cyan-600 bg-cyan-50" :
                          "border-green-200 text-green-600 bg-green-50"
                        }`}>{asset.category}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-medium text-foreground">
                        {asset.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${up ? "text-signal-up" : "text-signal-down"}`}>
                        {up ? "+" : ""}{asset.change.toFixed(4)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${up ? "text-signal-up" : "text-signal-down"}`}>
                        <div className="flex items-center justify-end gap-0.5">
                          {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {up ? "+" : ""}{asset.changePercent.toFixed(2)}%
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <MiniBar pct={asset.changePercent} />
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground font-mono">{formatVolume(asset.volume)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!isLoading && sorted.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">No assets found matching your search.</div>
          )}
        </div>
      </div>

      {selectedSymbol && (
        <div className="hidden lg:flex flex-col border-l border-border w-[45%] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">{selectedSymbol.symbol}</span>
              <span className="text-[11px] text-muted-foreground">{selectedSymbol.name}</span>
            </div>
            <button onClick={() => setSelectedSymbol(null)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <AssetChartPanel symbol={selectedSymbol.symbol} name={selectedSymbol.name} />
        </div>
      )}
    </div>
  );
}
