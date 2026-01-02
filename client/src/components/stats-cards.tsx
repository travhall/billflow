import { clsx } from "clsx";
import { DollarSign, PieChart, TrendingUp, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, Cell, Tooltip, XAxis } from "recharts";

interface StatsCardsProps {
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  overdueCount: number;
}

export function StatsCards({ totalDue, totalPaid, totalPending, overdueCount }: StatsCardsProps) {
  const progress = totalDue > 0 ? (totalPaid / totalDue) * 100 : 0;
  
  const data = [
    { name: 'Paid', value: totalPaid },
    { name: 'Pending', value: totalPending },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Main Budget Card */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl shadow-slate-900/20 relative overflow-hidden md:col-span-2">
        <div className="absolute top-0 right-0 p-32 bg-primary/20 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative z-10 flex flex-col h-full justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-slate-400 text-sm font-medium mb-1">Total Monthly Budget</p>
              <h2 className="text-4xl font-display font-bold tracking-tight">
                ${totalDue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </h2>
            </div>
            <div className="bg-white/10 p-2 rounded-lg">
              <PieChart className="w-6 h-6 text-primary-300" />
            </div>
          </div>

          <div className="mt-8">
            <div className="flex justify-between text-sm mb-2 text-slate-300 font-medium">
              <span>{Math.round(progress)}% Paid</span>
              <span>${totalPaid.toLocaleString()} of ${totalDue.toLocaleString()}</span>
            </div>
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-violet-400 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Remaining Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-lg shadow-slate-100/50 flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-slate-500 text-sm font-medium mb-1">Remaining</p>
            <h2 className="text-3xl font-display font-bold text-slate-900">
              ${totalPending.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </h2>
          </div>
          <div className={clsx("p-2 rounded-lg", overdueCount > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600")}>
            {overdueCount > 0 ? <AlertTriangle className="w-6 h-6" /> : <TrendingUp className="w-6 h-6" />}
          </div>
        </div>
        
        <div className="mt-4">
          {overdueCount > 0 ? (
            <p className="text-sm font-medium text-red-600 bg-red-50 inline-block px-3 py-1 rounded-full">
              {overdueCount} bills overdue
            </p>
          ) : (
            <p className="text-sm font-medium text-emerald-600 bg-emerald-50 inline-block px-3 py-1 rounded-full">
              On track this month
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
