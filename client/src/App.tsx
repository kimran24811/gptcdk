import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
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
import DevelopersPage from "@/pages/developers";
import { Dialog, DialogContentRaw, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ThemeProvider } from "@/components/theme-provider";

interface AnnouncementCfg {
  id: number;
  title: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  logoData: string | null;
  isActive: number;
  version: number;
}

function AnnouncementPopup() {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<AnnouncementCfg | null>(null);

  const { data } = useQuery<{ success: boolean; active: boolean; config?: AnnouncementCfg }>({
    queryKey: ["/api/announcement"],
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!data?.active || !data.config) return;
    const config = data.config;
    const key = `announcement_v${config.version}`;
    if (!sessionStorage.getItem(key)) {
      setCfg(config);
      setOpen(true);
    }
  }, [data]);

  function dismiss() {
    if (cfg) sessionStorage.setItem(`announcement_v${cfg.version}`, "1");
    setOpen(false);
  }

  if (!cfg) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) dismiss(); }}>
      <DialogContentRaw className="sm:max-w-sm mx-4 bg-[#0f172a] border border-primary/30 p-0 overflow-hidden">
        <DialogTitle className="sr-only">{cfg.title}</DialogTitle>
        <DialogDescription className="sr-only">{cfg.body}</DialogDescription>
        <div className="relative flex flex-col items-center gap-5 p-8 text-center">
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(var(--primary) / 0.15) 0%, transparent 70%)" }} />

          {cfg.logoData && (
            <img
              src={cfg.logoData}
              alt=""
              className="w-16 h-16 rounded-2xl shadow-lg relative object-cover"
              data-testid="img-announcement-logo"
            />
          )}

          <div className="relative">
            <h2 className="text-xl font-bold text-white mb-3" data-testid="text-announcement-title">
              {cfg.title}
            </h2>
            {cfg.body && (
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line" data-testid="text-announcement-body">
                {cfg.body}
              </p>
            )}
          </div>

          <div className="relative flex flex-col gap-2.5 w-full">
            {cfg.ctaText && cfg.ctaUrl && (
              <a
                href={cfg.ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismiss}
                className="w-full px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                data-testid="button-announcement-cta"
              >
                {cfg.ctaText}
              </a>
            )}
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
      <Route path="/developers" component={DevelopersPage} />
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
