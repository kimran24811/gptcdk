import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiTelegram } from "react-icons/si";
import { Zap, List, ShoppingBag } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Redeem", icon: Zap },
  { href: "/batch", label: "Batch Check", icon: List },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
];

export function PageLayout({
  children,
  maxWidth = "max-w-3xl",
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── TOP HEADER ── */}
      <header className="border-b border-border bg-background sticky top-0 z-50">
        <div className={`${maxWidth} mx-auto px-4 h-14 flex items-center justify-between`}>
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <span className="font-bold text-foreground text-base sm:text-lg tracking-tight">
              ChatGPT Recharge
            </span>
            <Badge variant="default" className="text-xs" data-testid="badge-plus">
              Plus
            </Badge>
          </div>

          {/* Desktop nav + button */}
          <div className="flex items-center gap-2 sm:gap-3">
            <nav className="hidden sm:flex items-center gap-0.5">
              {NAV_ITEMS.map((item) => {
                const active = location === item.href;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${
                      active
                        ? "text-foreground border-primary"
                        : "text-muted-foreground border-transparent hover:text-foreground"
                    }`}
                    data-testid={`nav-${item.label.toLowerCase().replace(" ", "-")}`}
                  >
                    {item.label}
                  </a>
                );
              })}
            </nav>

            <a
              href="https://t.me/CDK_Keys?text=i%20want%20to%20purchase%20key"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="button-telegram"
            >
              <Button size="sm" className="gap-1.5 bg-[#229ED9] hover:bg-[#1a8bbf] text-white border-0">
                <SiTelegram className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Buy Key</span>
                <span className="xs:hidden">Buy</span>
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* ── PAGE CONTENT ── */}
      <main className={`${maxWidth} mx-auto w-full px-4 py-6 sm:py-10 flex-1 pb-24 sm:pb-10`}>
        {children}
      </main>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-background border-t border-border">
        <div className="grid grid-cols-3 h-16">
          {NAV_ITEMS.map((item) => {
            const active = location === item.href;
            const Icon = item.icon;
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
                data-testid={`mobile-nav-${item.label.toLowerCase().replace(" ", "-")}`}
              >
                <Icon className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                {item.label}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
