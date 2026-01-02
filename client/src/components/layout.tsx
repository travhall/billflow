import { Link, useLocation } from "wouter";
import { LayoutDashboard, History, Settings, Wallet } from "lucide-react";
import { clsx } from "clsx";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/history", label: "History", icon: History },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex-shrink-0 z-10">
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-violet-600 flex items-center justify-center shadow-lg shadow-primary/25 text-white">
              <Wallet className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 font-display">
              BillFlow
            </h1>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href} className={clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group",
                  isActive 
                    ? "bg-primary/5 text-primary" 
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}>
                  <item.icon className={clsx(
                    "w-5 h-5 transition-colors",
                    isActive ? "text-primary" : "text-slate-400 group-hover:text-slate-600"
                  )} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-slate-100">
            <div className="bg-slate-900 rounded-xl p-4 text-white shadow-xl shadow-slate-900/10 relative overflow-hidden group cursor-pointer">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Current Plan</p>
              <p className="font-semibold">Pro Membership</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-screen">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
          {children}
        </div>
      </main>
    </div>
  );
}
