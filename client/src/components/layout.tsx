import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "./app-sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex min-h-screen w-full bg-slate-50 font-sans">
        <AppSidebar />
        
        <div className="flex flex-col flex-1 min-w-0">
          <header className="flex items-center justify-between p-2 border-b bg-white/50 backdrop-blur-sm sticky top-0 z-40">
            <SidebarTrigger className="h-9 w-9" />
            <div className="flex items-center gap-2">
              <ThemeToggle />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
