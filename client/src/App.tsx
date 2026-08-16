import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import { InstallPrompt } from "@/components/install-prompt";
import { ErrorBoundary } from "@/components/error-boundary";
import { lazy, Suspense, useEffect } from "react";
import { checkAndSendReminders } from "@/lib/notifications";
import type { Bill, Payment } from "@shared/schema";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const History = lazy(() => import("@/pages/history"));
const Upcoming = lazy(() => import("@/pages/upcoming"));
const Analytics = lazy(() => import("@/pages/analytics"));

function NotificationRunner() {
  const { data: bills } = useQuery<Bill[]>({ queryKey: ["/api/bills"] });
  const { data: payments } = useQuery<Payment[]>({ queryKey: ["/api/payments"] });

  useEffect(() => {
    if (bills && payments) {
      checkAndSendReminders(bills, payments);
    }
  }, [bills, payments]);

  return null;
}

function Router() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading…</div>}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/history" component={History} />
        <Route path="/upcoming" component={Upcoming} />
        <Route path="/analytics" component={Analytics} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="billflow-theme">
        <TooltipProvider>
          <NotificationRunner />
          <ErrorBoundary>
            <Router />
          </ErrorBoundary>
          <Toaster />
          <InstallPrompt />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
