import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import Dashboard from "@/pages/dashboard";
import History from "@/pages/history";
import Upcoming from "@/pages/upcoming";
import Analytics from "@/pages/analytics";
import NotFound from "@/pages/not-found";
import { InstallPrompt } from "@/components/install-prompt";
import { ErrorBoundary } from "@/components/error-boundary";
import { useEffect } from "react";
import { checkAndSendReminders } from "@/lib/notifications";
import type { Bill, Payment } from "@shared/schema";

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
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/history" component={History} />
      <Route path="/upcoming" component={Upcoming} />
      <Route path="/analytics" component={Analytics} />
      <Route component={NotFound} />
    </Switch>
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
