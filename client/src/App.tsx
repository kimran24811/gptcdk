import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import RedeemPage from "@/pages/redeem";
import BatchCheckPage from "@/pages/batch-check";
import ShopPage from "@/pages/shop";
import { Dialog, DialogContentRaw, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ThemeProvider } from "@/components/theme-provider";
import { Sparkles, Bell } from "lucide-react";

function AnnouncementPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem("announcement_seen")) {
      setOpen(true);
    }
  }, []);

  function dismiss() {
    sessionStorage.setItem("announcement_seen", "1");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContentRaw className="sm:max-w-sm mx-4 bg-[#0f172a] border border-[#6366f1]/30 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Claude AI CDK — Coming Soon</DialogTitle>
        <DialogDescription className="sr-only">Claude AI CDK keys are coming soon. Stay tuned!</DialogDescription>
        <div className="relative flex flex-col items-center gap-5 p-8 text-center">
          <div className="absolute inset-0 pointer-events-none" style={{background: "radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.18) 0%, transparent 70%)"}} />

          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Sparkles className="w-8 h-8 text-white" strokeWidth={1.8} />
          </div>

          <div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Bell className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Coming Soon</span>
            </div>
            <h2 className="text-xl font-bold text-white" data-testid="text-announcement-title">
              Claude AI CDK
            </h2>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              Activate Claude AI subscriptions with CDK keys — just like ChatGPT. Stay tuned!
            </p>
          </div>

          <button
            onClick={dismiss}
            className="w-full px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            data-testid="button-announcement-dismiss"
          >
            Got it, stay tuned!
          </button>
        </div>
      </DialogContentRaw>
    </Dialog>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RedeemPage} />
      <Route path="/batch" component={BatchCheckPage} />
      <Route path="/shop" component={ShopPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <AnnouncementPopup />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
