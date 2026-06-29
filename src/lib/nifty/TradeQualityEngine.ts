// TradeQualityEngine.ts

export class TradeQualityEngine {
  static gradeTrade(score: number): { grade: string, actionable: boolean } {
    if (score >= 90) return { grade: "A+", actionable: true };
    if (score >= 75) return { grade: "A", actionable: true };
    if (score >= 60) return { grade: "B", actionable: true };
    if (score >= 40) return { grade: "C", actionable: false };
    return { grade: "D", actionable: false };
  }
}
