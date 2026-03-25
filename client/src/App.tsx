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
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import AccountPage from "@/pages/account";
import AdminPage from "@/pages/admin";
import { Dialog, DialogContentRaw, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ThemeProvider } from "@/components/theme-provider";
import claudeLogoPath from "@assets/image_1774465922033.png";

const WHATSAPP = "+447577308067";

function AnnouncementPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem("claude_v2_seen")) {
      setOpen(true);
    }
  }, []);

  function dismiss() {
    sessionStorage.setItem("claude_v2_seen", "1");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContentRaw className="sm:max-w-sm mx-4 bg-[#0f172a] border border-[#D97757]/40 p-0 overflow-hidden">
        <DialogTitle className="sr-only">Claude Pro Weekly — Now Available</DialogTitle>
        <DialogDescription className="sr-only">Claude Pro Weekly is now available. Customer email activation for $2.30.</DialogDescription>
        <div className="relative flex flex-col items-center gap-5 p-8 text-center">
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(217,119,87,0.20) 0%, transparent 70%)" }} />

          <img
            src={claudeLogoPath}
            alt="Claude"
            className="w-16 h-16 rounded-2xl shadow-lg shadow-orange-500/30 relative"
            data-testid="img-claude-logo"
          />

          <div className="relative">
            <div className="inline-flex items-center gap-1.5 mb-2.5 px-2.5 py-1 rounded-full bg-[#D97757]/15 border border-[#D97757]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D97757] animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-widest text-[#D97757]">Now Available</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-3" data-testid="text-announcement-title">
              Claude Pro Weekly
            </h2>
            <div className="text-slate-300 text-sm leading-relaxed space-y-2">
              <p>
                Customer's email activation also available —{" "}
                <span className="text-[#D97757] font-semibold">only $2.30</span>
              </p>
              <p className="text-slate-400">Please contact us on WhatsApp for details.</p>
            </div>
          </div>

          <div className="relative flex flex-col gap-2.5 w-full">
            <a
              href={`https://wa.me/${WHATSAPP.replace(/\D/g, "")}?text=${encodeURIComponent("Hi, I'm interested in Claude Pro Weekly")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#D97757] to-[#c9673f] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              data-testid="button-whatsapp-claude"
            >
              Contact on WhatsApp
            </a>
            <button
              onClick={dismiss}
              className="text-xs text-slate-500 hover:text-slate-400 transition-colors py-1"
              data-testid="button-announcement-dismiss"
            >
              Maybe later
            </button>
          </div>
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
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/account" component={AccountPage} />
      <Route path="/admin" component={AdminPage} />
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
