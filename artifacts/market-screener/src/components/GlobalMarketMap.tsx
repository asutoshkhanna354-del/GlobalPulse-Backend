import { useGetTopMovers } from "@workspace/api-client-react";

interface RegionData {
  name: string;
  label: string;
  cx: number;
  cy: number;
  indices: string[];
}

const REGIONS: RegionData[] = [
  { name: "US", label: "United States", cx: 170, cy: 195, indices: ["SPX", "NDX", "DJI"] },
  { name: "EU", label: "Europe", cx: 490, cy: 155, indices: ["DAX", "FTSE", "CAC40"] },
  { name: "UK", label: "United Kingdom", cx: 460, cy: 130, indices: ["FTSE"] },
  { name: "JP", label: "Japan", cx: 835, cy: 195, indices: ["N225"] },
  { name: "CN", label: "China", cx: 765, cy: 200, indices: ["HSI", "SSEC"] },
  { name: "IN", label: "India", cx: 700, cy: 260, indices: ["NIFTY50", "SENSEX"] },
  { name: "BR", label: "Brazil", cx: 280, cy: 340, indices: [] },
  { name: "AU", label: "Australia", cx: 840, cy: 380, indices: [] },
];

const CONTINENTS = {
  northAmerica: "M55,65 L85,40 L120,30 L170,25 L220,35 L260,55 L280,50 L295,60 L280,75 L260,75 L270,85 L275,100 L260,105 L240,100 L225,110 L240,120 L260,125 L265,140 L250,150 L240,165 L235,180 L240,195 L235,210 L220,220 L200,230 L185,240 L175,240 L170,230 L160,225 L155,210 L150,195 L130,200 L120,210 L110,215 L95,210 L80,200 L75,185 L70,165 L60,155 L50,145 L40,130 L35,115 L40,100 L45,85 L50,75 Z",
  southAmerica: "M230,275 L250,268 L270,270 L285,280 L295,295 L305,310 L310,330 L305,350 L295,365 L290,385 L280,400 L270,415 L258,425 L245,430 L235,420 L230,405 L235,390 L240,375 L240,360 L235,345 L230,330 L225,315 L220,300 L222,285 Z",
  europe: "M430,55 L445,50 L460,52 L480,48 L500,50 L520,55 L540,50 L555,55 L570,60 L580,70 L575,80 L560,85 L555,95 L560,105 L555,115 L540,120 L525,125 L520,135 L530,145 L525,155 L515,165 L505,170 L495,165 L480,170 L470,165 L460,155 L450,160 L440,155 L435,145 L440,135 L450,125 L455,115 L445,105 L435,95 L440,85 L435,75 L430,65 Z",
  africa: "M445,180 L460,175 L475,178 L490,182 L505,185 L520,190 L535,200 L545,215 L550,230 L548,250 L545,270 L540,290 L530,310 L520,325 L505,335 L490,340 L475,342 L460,338 L448,330 L440,315 L435,300 L430,280 L428,260 L430,240 L435,220 L438,200 Z",
  asia: "M580,40 L610,35 L650,30 L700,28 L750,32 L800,40 L840,50 L870,65 L885,80 L890,100 L880,115 L870,130 L865,150 L870,170 L860,185 L845,195 L830,200 L815,210 L800,215 L785,220 L770,230 L755,240 L740,248 L725,255 L710,260 L695,265 L680,260 L665,250 L650,245 L640,235 L630,225 L620,215 L610,200 L600,185 L590,170 L585,155 L580,140 L575,120 L572,100 L570,80 L572,60 Z",
  australia: "M790,340 L810,330 L835,325 L860,328 L880,335 L895,345 L905,360 L900,375 L890,390 L875,400 L855,405 L835,408 L815,405 L800,395 L790,380 L785,365 L788,350 Z",
};

export function GlobalMarketMap() {
  const { data: movers } = useGetTopMovers();

  const getRegionColor = (region: RegionData) => {
    if (!movers) return "#8b8b8b";
    const gains = movers.gainers.filter(g => region.indices.includes(g.symbol)).length;
    const losses = movers.losers.filter(l => region.indices.includes(l.symbol)).length;
    if (gains > losses) return "#00c853";
    if (losses > gains) return "#e53935";
    if (gains === 0 && losses === 0) return "#9e9e9e";
    return "#f9a825";
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Global Market Heat</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-pulse" />
          <span className="text-[9px] text-muted-foreground">LIVE</span>
        </div>
      </div>

      <div className="relative h-56 sm:h-72 p-2">
        <svg viewBox="0 0 950 460" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="landGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(0,0,0,0.06)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.02)" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="landShadow">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(0,0,0,0.08)" />
            </filter>
          </defs>

          {Object.entries(CONTINENTS).map(([key, path]) => (
            <path
              key={key}
              d={path}
              fill="url(#landGrad)"
              stroke="rgba(0,0,0,0.06)"
              strokeWidth="0.8"
              filter="url(#landShadow)"
            />
          ))}

          <line x1="0" y1="230" x2="950" y2="230" stroke="rgba(0,0,0,0.03)" strokeWidth="0.5" strokeDasharray="4,8" />
          <line x1="0" y1="115" x2="950" y2="115" stroke="rgba(0,0,0,0.02)" strokeWidth="0.3" strokeDasharray="2,6" />
          <line x1="0" y1="345" x2="950" y2="345" stroke="rgba(0,0,0,0.02)" strokeWidth="0.3" strokeDasharray="2,6" />

          {REGIONS.map(region => {
            const color = getRegionColor(region);
            return (
              <g key={region.name}>
                <circle cx={region.cx} cy={region.cy} r="22" fill={color} opacity="0.1">
                  <animate attributeName="r" values="22;30;22" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.1;0.2;0.1" dur="3s" repeatCount="indefinite" />
                </circle>
                <circle cx={region.cx} cy={region.cy} r="12" fill={color} opacity="0.2">
                  <animate attributeName="r" values="12;16;12" dur="2.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.2;0.35;0.2" dur="2.5s" repeatCount="indefinite" />
                </circle>
                <circle cx={region.cx} cy={region.cy} r="4.5" fill={color} opacity="0.95" filter="url(#glow)">
                  <animate attributeName="opacity" values="0.95;0.6;0.95" dur="2s" repeatCount="indefinite" />
                </circle>
                <text
                  x={region.cx}
                  y={region.cy + 18}
                  textAnchor="middle"
                  fontSize="9"
                  fill="rgba(0,0,0,0.45)"
                  fontWeight="600"
                  fontFamily="Inter, system-ui, sans-serif"
                  letterSpacing="0.5"
                >
                  {region.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="px-3 pb-3 grid grid-cols-3 gap-2">
        {[
          { label: "Americas", color: "#00c853", status: "Open" },
          { label: "Europe", color: "#f9a825", status: "Closed" },
          { label: "Asia-Pac", color: "#e53935", status: "Pre-Mkt" },
        ].map(r => (
          <div key={r.label} className="glass-card-inner p-2 text-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.color, boxShadow: `0 0 6px ${r.color}80` }} />
              <span className="text-[9px] font-bold text-foreground/50">{r.label}</span>
            </div>
            <span className="text-[8px] text-muted-foreground">{r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
