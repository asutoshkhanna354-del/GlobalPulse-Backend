import { useGetBreakingNews } from "@workspace/api-client-react";
import { Zap } from "lucide-react";

export function BreakingTicker() {
  const { data: news } = useGetBreakingNews();

  if (!news?.length) return null;

  const tickerText = news.map(n => `  ///  ${n.headline}`).join("  ");

  return (
    <div
      data-testid="breaking-ticker"
      className="bg-[#FFF3E0] border-b border-[#FFE0B2] flex items-center overflow-hidden h-8 shrink-0"
    >
      <div className="flex items-center gap-2 px-3 pl-12 lg:pl-3 shrink-0 border-r border-[#FFE0B2] bg-[#FFE0B2]/50">
        <Zap className="w-3 h-3 text-[#E65100]" />
        <span className="text-[10px] font-bold text-[#E65100] uppercase tracking-widest whitespace-nowrap">Breaking</span>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <div className="ticker-animate whitespace-nowrap text-[11px] text-[#BF360C] py-2">
          {tickerText}
        </div>
      </div>
    </div>
  );
}
