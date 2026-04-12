import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SiWhatsapp } from "react-icons/si";
import { Zap, List, ShoppingBag, Sun, Moon, User, LayoutDashboard, LogOut, LogIn, Code2 } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";

function formatBalance(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PageLayout({
  children,
  maxWidth = "max-w-3xl",
  fullWidth = false,
}: {
  children: React.ReactNode;
  maxWidth?: string;
  fullWidth?: boolean;
}) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const { user, isAdmin, logout } = useAuth();

  const NAV_ITEMS = [
    { href: "/", label: "Redeem", icon: Zap },
    { href: "/batch", label: "Batch Check", icon: List },
    { href: "/shop", label: "Shop", icon: ShoppingBag },
    ...(user ? [{ href: "/account", label: "Account", icon: User }] : []),
    { href: "/developers", label: "Developers", icon: Code2 },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: LayoutDashboard }] : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── TOP HEADER ── */}
      <header className="border-b border-border bg-background sticky top-0 z-50">
        <div className={`${maxWidth} mx-auto px-4 h-14 flex items-center justify-between`}>
          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5">
            <span className="font-bold text-foreground text-base sm:text-lg tracking-tight">
              ChatGPT Recharge
            </span>
            <Badge variant="default" className="text-xs" data-testid="badge-plus">
              Plus
            </Badge>
          </a>

          {/* Desktop nav + controls */}
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

            {/* Balance pill (logged in customers) */}
            {user && !isAdmin && (
              <a
                href="/account"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                data-testid="text-header-balance"
              >
                {formatBalance(user.balanceCents)}
              </a>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={toggle}
              className="w-8 h-8 p-0"
              data-testid="button-theme-toggle"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>

            {user ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => logout.mutate()}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                data-testid="button-logout"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Logout</span>
              </Button>
            ) : (
              <a href="/login" data-testid="link-login-header">
                <Button size="sm" variant="ghost" className="gap-1.5">
                  <LogIn className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Login</span>
                </Button>
              </a>
            )}

            <a
              href="https://wa.me/+447577308067"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="button-whatsapp"
            >
              <Button size="sm" className="gap-1.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white border-0">
                <SiWhatsapp className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">WhatsApp</span>
                <span className="xs:hidden">WA</span>
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* ── PAGE CONTENT ── */}
      <main className={fullWidth ? "flex-1 pb-24 sm:pb-10 w-full" : `${maxWidth} mx-auto w-full px-4 py-6 sm:py-10 flex-1 pb-24 sm:pb-10`}>
        {children}
      </main>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-background border-t border-border">
        <div className={`grid h-16`} style={{ gridTemplateColumns: `repeat(${NAV_ITEMS.length}, 1fr)` }}>
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
