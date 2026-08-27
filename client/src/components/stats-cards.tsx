import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Wallet, Clock, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface StatsCardsProps {
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  overdueCount: number;
}

export function StatsCards({ totalDue, totalPaid, totalPending, overdueCount }: StatsCardsProps) {
  const percentPaid = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="md:col-span-2 overflow-hidden bg-slate-950 text-white border-0 dark:border dark:border-border shadow-2xl relative group">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-50" />
        <CardContent className="p-8 relative">
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-1">Total Monthly Budget</p>
              <h3 className="text-4xl md:text-5xl font-display font-bold text-white leading-tight">
                {formatCurrency(totalDue)}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex justify-between items-end text-sm">
              <span className="text-slate-400 font-medium">{percentPaid}% Paid</span>
              <span className="text-white font-bold">{formatCurrency(totalPaid)} of {formatCurrency(totalDue)}</span>
            </div>
            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-violet-400 transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(139,92,246,0.5)]"
                style={{ width: `${percentPaid}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden bg-white dark:bg-card border border-border shadow-sm group hover:shadow-xl transition-all duration-300">
        <CardContent className="p-8">
          <div className="flex justify-between items-start mb-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center group-hover:rotate-12 transition-transform">
              <TrendingUp className="w-6 h-6 text-emerald-500" />
            </div>
            {overdueCount > 0 && (
              <div className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-500 text-xs font-bold animate-pulse flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {overdueCount} OVERDUE
              </div>
            )}
          </div>
          
          <p className="text-muted-foreground text-sm font-medium uppercase tracking-wider mb-1">Remaining</p>
          <h3 className="text-3xl font-display font-bold text-foreground mb-4">
            {formatCurrency(totalPending)}
          </h3>
          
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-bold">
            <TrendingUp className="w-3 h-3" />
            ON TRACK THIS MONTH
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
