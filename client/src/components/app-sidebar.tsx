import { Sidebar, SidebarContent, SidebarHeader, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Link, useLocation } from "wouter";
import { LayoutDashboard, History, Wallet, ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

export function AppSidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/history", label: "History", icon: History },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 border-b border-slate-100 flex flex-row items-center gap-3 overflow-hidden">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-violet-600 flex items-center justify-center shadow-lg shadow-primary/25 text-white shrink-0">
          <Wallet className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 font-display truncate group-data-[collapsible=icon]:hidden">
          BillFlow
        </h1>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="px-2 py-4 space-y-1">
              {navItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <Link href={item.href} className={clsx(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                        isActive 
                          ? "bg-primary/5 text-primary" 
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )}>
                        <item.icon className={clsx(
                          "w-5 h-5 transition-colors shrink-0",
                          isActive ? "text-primary" : "text-slate-400"
                        )} />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-slate-100 group-data-[collapsible=icon]:p-2">
        <div className="bg-slate-900 rounded-xl p-4 text-white shadow-xl shadow-slate-900/10 relative overflow-hidden group/card cursor-pointer group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:aspect-square group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Current Plan</p>
            <p className="font-semibold">Pro</p>
          </div>
          <div className="hidden group-data-[collapsible=icon]:block">
            <span className="text-[10px] font-bold">PRO</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
