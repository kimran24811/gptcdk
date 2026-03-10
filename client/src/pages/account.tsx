import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiWhatsapp } from "react-icons/si";
import { Wallet, Package, Copy, Check, ChevronDown, ChevronUp, Zap, Loader2 } from "lucide-react";
import type { Order } from "@shared/schema";

const BINANCE_PAY_ID = "552780449";
const BINANCE_USERNAME = "User-1d9f7";
const WHATSAPP = "+447577308067";

function useCopied(ms = 2000) {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), ms);
    });
  };
  return { copied, copy };
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const { copied, copy } = useCopied();
  return (
    <button
      onClick={() => copy(text)}
      className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-all shrink-0 ${
        copied
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
      data-testid={`button-copy-${label || text.slice(0, 8)}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function OrderRow({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false);
  const date = new Date(order.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <div className="border border-border rounded-lg overflow-hidden" data-testid={`card-order-${order.id}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
        data-testid={`button-expand-order-${order.id}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{order.subscription}</div>
            <div className="text-xs text-muted-foreground">{date} · {order.quantity} key{order.quantity !== 1 ? "s" : ""} · ${(order.amountCents / 100).toFixed(2)}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="text-xs hidden xs:inline-flex">{order.status}</Badge>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/10 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Order #{order.orderNumber}</span>
            <Badge variant="secondary">{order.status}</Badge>
          </div>
          {order.keys && order.keys.length > 0 ? (
            order.keys.map((key, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-background border border-border"
                data-testid={`row-key-${order.id}-${idx}`}
              >
                <code className="text-xs font-mono text-foreground flex-1 truncate">{key}</code>
                <div className="flex items-center gap-1.5 shrink-0">
                  <CopyBtn text={key} label={`key-${order.id}-${idx}`} />
                  <a
                    href={`/?key=${encodeURIComponent(key)}`}
                    className="flex items-center gap-1 px-2 py-1 rounded border border-primary/40 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 transition-colors"
                    data-testid={`button-redeem-key-${order.id}-${idx}`}
                  >
                    <Zap className="w-3 h-3" />
                    Redeem
                  </a>
                </div>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">No keys available.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function AccountPage() {
  const [, navigate] = useLocation();
  const { user, isLoading } = useAuth();

  const { data: ordersData, isLoading: ordersLoading } = useQuery<{ success: boolean; data: Order[] }>({
    queryKey: ["/api/me/orders"],
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </PageLayout>
    );
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  const orders = ordersData?.data ?? [];
  const whatsappUrl = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
    `Hi, I'd like to top up my ChatGPT Recharge account.\n\nEmail: ${user.email}\n\nI have sent USDT to Binance Pay ID: ${BINANCE_PAY_ID}. Here is my payment screenshot:`
  )}`;

  return (
    <PageLayout>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">My Account</h1>
        <p className="text-muted-foreground text-sm">Manage your balance and view orders</p>
      </div>

      <div className="space-y-5">
        {/* Balance card */}
        <Card className="border border-card-border">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Balance</span>
                </div>
                <div className="text-4xl font-black text-foreground" data-testid="text-balance">
                  ${(user.balanceCents / 100).toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Available to spend in the Shop</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-foreground mb-0.5 truncate max-w-[160px]">{user.name}</div>
                <div className="text-xs text-muted-foreground truncate max-w-[160px]">{user.email}</div>
              </div>
            </div>

            {/* Top-up instructions */}
            <div className="mt-5 pt-4 border-t border-border space-y-3">
              <p className="text-sm font-semibold text-foreground">How to top up:</p>
              <p className="text-xs text-muted-foreground">
                Send USDT to the Binance Pay account below, then share your payment screenshot on WhatsApp. Your balance is updated within minutes.
              </p>

              {/* Binance Pay details */}
              <div className="rounded-lg border border-border divide-y divide-border">
                <div className="flex items-center justify-between px-3 py-2.5 gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Binance Pay ID</div>
                    <div className="font-mono font-bold text-foreground text-base" data-testid="text-binance-pay-id">
                      {BINANCE_PAY_ID}
                    </div>
                  </div>
                  <CopyBtn text={BINANCE_PAY_ID} label="binance-id" />
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground mb-0.5">Username</div>
                    <div className="font-mono font-semibold text-foreground" data-testid="text-binance-username">
                      {BINANCE_USERNAME}
                    </div>
                  </div>
                  <CopyBtn text={BINANCE_USERNAME} label="binance-username" />
                </div>
              </div>

              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" data-testid="button-topup-whatsapp">
                <Button className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white border-0">
                  <SiWhatsapp className="w-4 h-4" />
                  Share Payment Screenshot on WhatsApp
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Orders */}
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">Order History</h2>
          {ordersLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <Card className="border border-card-border">
              <CardContent className="p-8 text-center">
                <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground font-medium">No orders yet</p>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Head to the Shop to buy your first CDK keys</p>
                <a href="/shop">
                  <Button size="sm" variant="outline">Go to Shop</Button>
                </a>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
