import { Sidebar, SidebarContent, SidebarHeader, SidebarGroup, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Link, useLocation } from "wouter";
import { LayoutDashboard, History, Wallet, CalendarClock, BarChart2 } from "lucide-react";
import { clsx } from "clsx";

export function AppSidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/upcoming", label: "Upcoming", icon: CalendarClock },
    { href: "/history", label: "History", icon: History },
    { href: "/analytics", label: "Analytics", icon: BarChart2 },
  ];

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-sidebar">
      <SidebarHeader className="p-4 border-b border-sidebar-border flex flex-row items-center gap-3 overflow-hidden">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-violet-600 flex items-center justify-center shadow-lg shadow-primary/25 text-white shrink-0">
          <Wallet className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-violet-400 font-display truncate group-data-[collapsible=icon]:hidden">
          BillFlow
        </h1>
      </SidebarHeader>

      <SidebarContent className="bg-sidebar">
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
                          ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      )}>
                        <item.icon className={clsx(
                          "w-5 h-5 transition-colors shrink-0",
                          isActive ? "text-primary" : "text-sidebar-foreground/50"
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

      <SidebarFooter className="p-4 border-t border-sidebar-border bg-sidebar group-data-[collapsible=icon]:p-2">
        <div className="bg-primary/10 rounded-xl p-4 text-foreground shadow-xl shadow-primary/5 relative overflow-hidden group/card cursor-pointer group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:aspect-square group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Current Plan</p>
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
