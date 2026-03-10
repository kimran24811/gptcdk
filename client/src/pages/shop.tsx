import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Zap, Shield, Clock, ShoppingCart, CheckCircle, Minus, Plus, Copy, Check, Loader2, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageLayout } from "@/components/page-layout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

const PLANS = [
  {
    id: "plus-1m",
    name: "ChatGPT Plus CDK",
    duration: "1 month",
    price: 2.38,
    fromPrice: 1.55,
    popular: true,
    discounts: [
      { qty: 10,  price: 2.15, pct: -12 },
      { qty: 30,  price: 1.95, pct: -20 },
      { qty: 50,  price: 1.75, pct: -29 },
      { qty: 100, price: 1.55, pct: -37 },
    ],
  },
  {
    id: "plus-1y",
    name: "ChatGPT Plus CDK",
    duration: "1 year",
    price: 28,
    fromPrice: 28,
    popular: false,
    discounts: [],
  },
  {
    id: "go-1y",
    name: "ChatGPT GO CDK",
    duration: "1 year",
    price: 5,
    fromPrice: 5,
    popular: false,
    discounts: [],
  },
  {
    id: "pro-1m",
    name: "ChatGPT Pro CDK",
    duration: "1 month",
    price: 110,
    fromPrice: 110,
    popular: false,
    discounts: [],
  },
];

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

function CopyButton({ text, label }: { text: string; label?: string }) {
  const { copied, copy } = useCopied();
  return (
    <button
      onClick={() => copy(text)}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-all duration-150 shrink-0 ${
        copied
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
      title={`Copy ${label || text}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

interface PurchaseResult {
  keys: string[];
  orderNumber: string;
  product: string;
  subscription: string;
  quantity: number;
  amount: string;
  balanceCents: number;
}

function KeysDeliveryDialog({
  result,
  onClose,
}: {
  result: PurchaseResult | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!result} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">Purchase Successful!</DialogTitle>
              {result && (
                <DialogDescription className="text-xs">
                  Order #{result.orderNumber} · {result.quantity} key{result.quantity !== 1 ? "s" : ""} · ${result.amount}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-2 pr-0.5">
          {result?.keys.map((key, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border"
              data-testid={`delivery-key-${idx}`}
            >
              <code className="text-xs font-mono text-foreground flex-1 break-all">{key}</code>
              <div className="flex items-center gap-1.5 shrink-0">
                <CopyButton text={key} label="key" />
                <a
                  href={`/?key=${encodeURIComponent(key)}`}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-primary/40 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 transition-colors"
                  data-testid={`button-redeem-delivery-${idx}`}
                >
                  <Zap className="w-3 h-3" />
                  Redeem
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-border">
          {result && (
            <p className="text-xs text-muted-foreground mb-2.5">
              New balance: <span className="font-semibold text-foreground">${(result.balanceCents / 100).toFixed(2)}</span>
            </p>
          )}
          <Button className="w-full" onClick={onClose} data-testid="button-close-delivery">
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ShopPage() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState(PLANS[0]);
  const [quantity, setQuantity] = useState(1);
  const [qtyInput, setQtyInput] = useState("1");
  const [deliveryResult, setDeliveryResult] = useState<PurchaseResult | null>(null);

  const unitPrice = (() => {
    const discounts = selectedPlan.discounts;
    if (!discounts || discounts.length === 0) return selectedPlan.price;
    const match = discounts.slice().reverse().find((d) => quantity >= d.qty);
    return match ? match.price : selectedPlan.price;
  })();

  const totalPrice = (unitPrice * quantity).toFixed(2);
  const totalCents = Math.round(unitPrice * quantity * 100);
  const balanceSufficient = user ? user.balanceCents >= totalCents : false;
  const shortfall = user ? Math.max(0, totalCents - user.balanceCents) / 100 : 0;

  const handleQtyInput = (val: string) => {
    setQtyInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1) setQuantity(n);
  };

  const adjustQty = (delta: number) => {
    const next = Math.max(1, quantity + delta);
    setQuantity(next);
    setQtyInput(String(next));
  };

  const purchase = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/purchase", {
        planId: selectedPlan.id,
        quantity,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/me/orders"] });
        setDeliveryResult(data);
      } else {
        toast({ title: "Purchase failed", description: data.message, variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Purchase failed", description: "Could not connect. Please try again.", variant: "destructive" });
    },
  });

  const planDiscounts = selectedPlan.discounts || [];
  const appliedDiscount = planDiscounts.slice().reverse().find((d) => quantity >= d.qty) ?? null;

  return (
    <PageLayout maxWidth="max-w-5xl">
      <KeysDeliveryDialog result={deliveryResult} onClose={() => setDeliveryResult(null)} />

      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Shop</h1>
        <p className="text-muted-foreground text-sm">Buy CDK keys — instant delivery to your account</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-5 sm:gap-6 items-start">
        {/* LEFT COLUMN */}
        <div className="flex-1 space-y-4 min-w-0 w-full">
          {/* Hero */}
          <div
            className="rounded-xl overflow-hidden relative"
            style={{ background: "linear-gradient(135deg, #16a34a 0%, #15803d 50%, #166534 100%)" }}
            data-testid="shop-hero"
          >
            <div className="px-5 sm:px-6 py-8 sm:py-12 relative z-10">
              <div className="text-4xl sm:text-5xl font-black text-white/20 absolute inset-0 flex items-center justify-center select-none pointer-events-none tracking-tight">
                ChatGPT
              </div>
              <div className="relative z-10 mt-6 sm:mt-8">
                <h2 className="text-xl sm:text-2xl font-bold text-white">ChatGPT</h2>
                <p className="text-white/70 text-sm mt-1">Instant CDK activation keys</p>
              </div>
            </div>
          </div>

          {/* Plan Selection */}
          <Card className="border border-card-border">
            <CardContent className="p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Select Plan</h3>
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                {PLANS.map((plan) => {
                  const selected = selectedPlan.id === plan.id;
                  return (
                    <button
                      key={plan.id}
                      onClick={() => { setSelectedPlan(plan); setQuantity(1); setQtyInput("1"); }}
                      className={`text-left p-3 rounded-lg border-2 transition-all duration-150 w-full ${
                        selected ? "border-primary bg-primary/5" : "border-border bg-background"
                      }`}
                      data-testid={`plan-${plan.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                          selected ? "border-primary" : "border-muted-foreground/40"
                        }`}>
                          {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground leading-tight">{plan.name}</div>
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{plan.duration}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            from <span className="font-bold text-foreground text-sm">${plan.fromPrice.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Volume Discounts */}
          {planDiscounts.length > 0 && (
            <Card className="border border-card-border">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Volume Discounts</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">Tap a row to apply it instantly</p>
                <div className="space-y-2">
                  {planDiscounts.map((tier, i) => {
                    const nextTier = planDiscounts[i + 1];
                    const rangeLabel = nextTier ? `${tier.qty}–${nextTier.qty - 1}` : `${tier.qty}+`;
                    const tierTotal = (tier.price * tier.qty).toFixed(2);
                    const savedTotal = ((selectedPlan.price - tier.price) * tier.qty).toFixed(2);
                    const isActive = quantity >= tier.qty && (!nextTier || quantity < nextTier.qty);
                    return (
                      <button
                        key={tier.qty}
                        onClick={() => { setQuantity(tier.qty); setQtyInput(String(tier.qty)); }}
                        className={`w-full text-left px-3 sm:px-4 py-3 rounded-lg border-2 transition-all duration-150 hover-elevate ${
                          isActive ? "border-primary bg-primary/5" : "border-border bg-background"
                        }`}
                        data-testid={`volume-tier-${tier.qty}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <span className={`text-sm font-medium w-12 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                              {rangeLabel}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-base font-bold text-foreground">${tier.price.toFixed(2)}</span>
                                <span className="text-xs text-muted-foreground">/ key</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {tier.qty} keys = <span className="font-semibold text-foreground">${tierTotal}</span>
                                <span className="text-primary font-semibold ml-2">save ${savedTotal}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isActive && <CheckCircle className="w-4 h-4 text-primary" />}
                            <span className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded">
                              {tier.pct}%
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Feature Badges */}
          <div className="flex gap-2 sm:gap-3 flex-wrap">
            {[
              { icon: Zap, label: "Instant Delivery", color: "text-yellow-500" },
              { icon: Shield, label: "Secure Payment", color: "text-primary" },
              { icon: Clock, label: "No Expiration", color: "text-purple-500" },
            ].map(({ icon: Icon, label, color }) => (
              <div
                key={label}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-full bg-card border border-card-border text-xs sm:text-sm font-medium text-foreground"
              >
                <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${color}`} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN — Order Panel */}
        <div className="w-full lg:w-80 lg:sticky lg:top-20 shrink-0">
          <Card className="border border-card-border">
            <CardContent className="p-4 sm:p-5 space-y-4 sm:space-y-5">
              {/* Header */}
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Your Order</span>
              </div>

              {/* Product */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground text-base leading-tight" data-testid="payment-product-name">
                    {selectedPlan.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{selectedPlan.duration}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-bold text-foreground" data-testid="payment-total">
                    ${totalPrice}
                  </div>
                  <div className="text-xs text-muted-foreground">USDT</div>
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Quantity */}
              <div>
                <div className="text-sm font-medium text-foreground mb-3">Quantity</div>
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => adjustQty(-1)}
                    disabled={quantity <= 1}
                    data-testid="button-qty-decrease"
                    className="shrink-0"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    value={qtyInput}
                    onChange={(e) => handleQtyInput(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(qtyInput, 10);
                      if (isNaN(n) || n < 1) { setQuantity(1); setQtyInput("1"); }
                      else { setQuantity(n); setQtyInput(String(n)); }
                    }}
                    className="text-center font-semibold text-base [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    data-testid="input-quantity"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => adjustQty(1)}
                    data-testid="button-qty-increase"
                    className="shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {quantity} × ${unitPrice.toFixed(2)} / unit
                  </span>
                  {appliedDiscount && (
                    <span className="text-red-500 font-semibold bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded">
                      {appliedDiscount.pct}% off
                    </span>
                  )}
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Total + Action */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Total</span>
                  <span className="text-2xl font-black text-foreground">
                    ${totalPrice} <span className="text-sm font-normal text-muted-foreground">USDT</span>
                  </span>
                </div>

                {!authLoading && !user ? (
                  /* Not logged in */
                  <div className="space-y-2">
                    <a href="/login" className="block" data-testid="button-login-to-purchase">
                      <Button className="w-full gap-2" size="lg">
                        <LogIn className="w-4 h-4" />
                        Login to Purchase
                      </Button>
                    </a>
                    <p className="text-xs text-muted-foreground text-center">
                      Create a free account to buy instantly
                    </p>
                  </div>
                ) : (
                  /* Logged in */
                  <div className="space-y-2">
                    {/* Balance display */}
                    <div className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 ${
                      balanceSufficient ? "bg-primary/5 border border-primary/20" : "bg-destructive/5 border border-destructive/20"
                    }`}>
                      <span className="text-muted-foreground">Your balance</span>
                      <span className={`font-semibold ${balanceSufficient ? "text-primary" : "text-destructive"}`} data-testid="text-shop-balance">
                        ${user ? (user.balanceCents / 100).toFixed(2) : "0.00"}
                      </span>
                    </div>

                    {!balanceSufficient && user && (
                      <p className="text-xs text-destructive text-center">
                        Need ${shortfall.toFixed(2)} more —{" "}
                        <a href="/account" className="underline font-medium">top up</a>
                      </p>
                    )}

                    <Button
                      className="w-full gap-2"
                      size="lg"
                      onClick={() => purchase.mutate()}
                      disabled={!balanceSufficient || purchase.isPending || authLoading}
                      data-testid="button-buy-now"
                    >
                      {purchase.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShoppingCart className="w-4 h-4" />
                      )}
                      {purchase.isPending ? "Processing..." : `Buy Now — $${totalPrice}`}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      Keys delivered instantly on screen
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
