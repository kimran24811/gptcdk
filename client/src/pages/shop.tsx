import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Zap, Shield, Clock, CheckCircle, Minus, Plus, Copy, Check, Loader2, LogIn, Headphones, ArrowRight, Star, Package, MessageCircle, Store } from "lucide-react";
import claudeLogoPath from "@assets/image_1774465922033.png";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { PageLayout } from "@/components/page-layout";

const WHATSAPP = "+447577308067";

const PLANS = [
  {
    id: "plus-1m",
    name: "ChatGPT Plus CDK",
    duration: "1M",
    durationLabel: "1 month",
    price: 2.38,
    fromPrice: 1.55,
    popular: false,
    hasBulk: true,
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
    duration: "1Y",
    durationLabel: "1 year",
    price: 28,
    fromPrice: 28,
    popular: true,
    hasBulk: false,
    discounts: [],
  },
  {
    id: "go-1y",
    name: "ChatGPT GO CDK",
    duration: "1Y",
    durationLabel: "1 year",
    price: 5,
    fromPrice: 5,
    popular: false,
    hasBulk: false,
    discounts: [],
  },
  {
    id: "pro-1m",
    name: "ChatGPT Pro CDK",
    duration: "1M",
    durationLabel: "1 month",
    price: 110,
    fromPrice: 110,
    popular: false,
    hasBulk: false,
    discounts: [],
  },
];

const FEATURES = [
  {
    icon: Zap,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    title: "Lightning Fast",
    desc: "Delivered to your account the moment payment confirms",
  },
  {
    icon: Shield,
    color: "text-green-400",
    bg: "bg-green-500/10",
    title: "Private & Secure",
    desc: "Anonymous crypto checkout — no personal data needed",
  },
  {
    icon: Headphones,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    title: "Always Online",
    desc: "Real human support around the clock via WhatsApp",
  },
  {
    icon: Clock,
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    title: "No Expiration",
    desc: "Your keys stay valid forever — redeem on your own schedule",
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

function CopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopied();
  return (
    <button
      onClick={() => copy(text)}
      className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-all shrink-0 ${
        copied ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
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

function DeliveryDialog({ result, onClose }: { result: PurchaseResult | null; onClose: () => void }) {
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
            <div key={idx} className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border" data-testid={`delivery-key-${idx}`}>
              <code className="text-xs font-mono text-foreground flex-1 break-all">{key}</code>
              <div className="flex items-center gap-1.5 shrink-0">
                <CopyButton text={key} />
                <a href={`/?key=${encodeURIComponent(key)}`} className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-primary/40 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 transition-colors" data-testid={`button-redeem-delivery-${idx}`}>
                  <Zap className="w-3 h-3" /> Redeem
                </a>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-border">
          {result && <p className="text-xs text-muted-foreground mb-2.5">New balance: <span className="font-semibold text-foreground">${(result.balanceCents / 100).toFixed(2)}</span></p>}
          <Button className="w-full" onClick={onClose} data-testid="button-close-delivery">Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Plan = typeof PLANS[number];

function OrderDialog({ plan, onClose, onSuccess }: { plan: Plan | null; onClose: () => void; onSuccess: (r: PurchaseResult) => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [quantity, setQuantity] = useState(1);
  const [qtyInput, setQtyInput] = useState("1");

  const unitPrice = (() => {
    if (!plan) return 0;
    if (!plan.discounts.length) return plan.price;
    const match = plan.discounts.slice().reverse().find((d) => quantity >= d.qty);
    return match ? match.price : plan.price;
  })();

  const totalPrice = (unitPrice * quantity).toFixed(2);
  const totalCents = Math.round(unitPrice * quantity * 100);
  const balanceSufficient = user ? user.balanceCents >= totalCents : false;
  const shortfall = user ? Math.max(0, totalCents - user.balanceCents) / 100 : 0;
  const appliedDiscount = plan?.discounts.slice().reverse().find((d) => quantity >= d.qty) ?? null;

  const adjustQty = (delta: number) => {
    const next = Math.max(1, quantity + delta);
    setQuantity(next);
    setQtyInput(String(next));
  };

  const handleQtyInput = (val: string) => {
    setQtyInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 1) setQuantity(n);
  };

  const purchase = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/purchase", { planId: plan!.id, quantity });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/me/orders"] });
        onClose();
        onSuccess(data);
      } else {
        toast({ title: "Purchase failed", description: data.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Purchase failed", description: "Could not connect. Please try again.", variant: "destructive" }),
  });

  if (!plan) return null;

  return (
    <Dialog open={!!plan} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            {plan.name}
          </DialogTitle>
          <DialogDescription>{plan.durationLabel} subscription key</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Volume discounts */}
          {plan.discounts.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Volume pricing</p>
              <div className="grid grid-cols-2 gap-1.5">
                {plan.discounts.map((d) => (
                  <button
                    key={d.qty}
                    onClick={() => { setQuantity(d.qty); setQtyInput(String(d.qty)); }}
                    className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-all ${
                      quantity >= d.qty && (!plan.discounts[plan.discounts.indexOf(d) + 1] || quantity < plan.discounts[plan.discounts.indexOf(d) + 1].qty)
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40"
                    }`}
                    data-testid={`volume-tier-${d.qty}`}
                  >
                    <span className="font-semibold text-foreground">${d.price.toFixed(2)}</span>/key
                    <br />
                    {d.qty}+ keys · <span className="text-primary font-medium">{d.pct}%</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Quantity</p>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" onClick={() => adjustQty(-1)} disabled={quantity <= 1} data-testid="button-qty-decrease" className="shrink-0">
                <Minus className="w-3.5 h-3.5" />
              </Button>
              <Input
                type="number" min={1} value={qtyInput}
                onChange={(e) => handleQtyInput(e.target.value)}
                onBlur={() => { const n = parseInt(qtyInput, 10); if (isNaN(n) || n < 1) { setQuantity(1); setQtyInput("1"); } else { setQuantity(n); setQtyInput(String(n)); } }}
                className="text-center font-semibold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                data-testid="input-quantity"
              />
              <Button size="icon" variant="outline" onClick={() => adjustQty(1)} data-testid="button-qty-increase" className="shrink-0">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex items-center justify-between text-xs mt-1.5">
              <span className="text-muted-foreground">{quantity} × ${unitPrice.toFixed(2)}</span>
              {appliedDiscount && <span className="text-primary font-semibold">{appliedDiscount.pct}% off</span>}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Total + action */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Total</span>
              <span className="text-xl font-black text-foreground">${totalPrice} <span className="text-xs font-normal text-muted-foreground">USDT</span></span>
            </div>

            {!user ? (
              <div className="space-y-2">
                <a href="/login" className="block" data-testid="button-login-to-purchase">
                  <Button className="w-full gap-2"><LogIn className="w-4 h-4" /> Login to Purchase</Button>
                </a>
                <p className="text-xs text-muted-foreground text-center">Create a free account to buy instantly</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className={`flex items-center justify-between text-xs rounded-lg px-3 py-2 ${balanceSufficient ? "bg-primary/5 border border-primary/20" : "bg-destructive/5 border border-destructive/20"}`}>
                  <span className="text-muted-foreground">Your balance</span>
                  <span className={`font-semibold ${balanceSufficient ? "text-primary" : "text-destructive"}`} data-testid="text-shop-balance">
                    ${(user.balanceCents / 100).toFixed(2)}
                  </span>
                </div>
                {!balanceSufficient && (
                  <p className="text-xs text-destructive text-center">
                    Need ${shortfall.toFixed(2)} more —{" "}
                    <a href="/account" className="underline font-medium">top up</a>
                  </p>
                )}
                <Button
                  className="w-full gap-2" size="lg"
                  onClick={() => purchase.mutate()}
                  disabled={!balanceSufficient || purchase.isPending}
                  data-testid="button-buy-now"
                >
                  {purchase.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {purchase.isPending ? "Processing..." : `Buy Now — $${totalPrice}`}
                </Button>
                <p className="text-xs text-muted-foreground text-center">Keys delivered instantly on screen</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClaudeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <img src={claudeLogoPath} alt="Claude" className="w-10 h-10 rounded-xl" />
            <div>
              <DialogTitle>Claude Pro</DialogTitle>
              <DialogDescription>Weekly subscription — available now</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="rounded-xl border border-[#D97757]/30 bg-[#D97757]/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Claude Pro Weekly</span>
              <span className="text-lg font-black text-foreground">$2.30 <span className="text-xs font-normal text-muted-foreground">USDT</span></span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Customer's email activation — we activate on your own account email.
            </p>
          </div>
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            Contact us on WhatsApp to place your order and get activation details.
          </p>
          <a
            href={`https://wa.me/${WHATSAPP.replace(/\D/g, "")}?text=${encodeURIComponent("Hi, I'd like to order Claude Pro Weekly ($2.30)")}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="button-claude-whatsapp"
          >
            <Button className="w-full gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0">
              <MessageCircle className="w-4 h-4" />
              Order via WhatsApp
            </Button>
          </a>
          <button onClick={onClose} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Custom products ───────────────────────────────────────────────────────────
interface CustomProduct {
  id: number;
  name: string;
  description: string;
  priceCents: number;
  logoData: string | null;
  stock: number;
}

interface CustomDeliveryResult {
  key: string;
  orderNumber: string;
  product: string;
  amountCents: number;
  balanceCents: number;
}

function CustomDeliveryDialog({ result, onClose }: { result: CustomDeliveryResult | null; onClose: () => void }) {
  return (
    <Dialog open={!!result} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">Purchase Successful!</DialogTitle>
              {result && (
                <DialogDescription className="text-xs">Order #{result.orderNumber} · ${(result.amountCents / 100).toFixed(2)}</DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
        {result && (
          <div className="space-y-4 pt-1">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Your voucher code for <span className="font-medium text-foreground">{result.product}</span>:</p>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border" data-testid="delivery-custom-key">
                <code className="text-sm font-mono text-foreground flex-1 break-all">{result.key}</code>
                <CopyButton text={result.key} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">New balance: <span className="font-semibold text-foreground">${(result.balanceCents / 100).toFixed(2)}</span></p>
            <Button className="w-full" onClick={onClose} data-testid="button-close-custom-delivery">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CustomPurchaseDialog({ product, onClose, onSuccess }: { product: CustomProduct; onClose: () => void; onSuccess: (r: CustomDeliveryResult) => void }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const balanceSufficient = user ? user.balanceCents >= product.priceCents : false;
  const shortfall = user ? Math.max(0, product.priceCents - user.balanceCents) / 100 : 0;

  const purchase = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/purchase-custom", { productId: product.id });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/me/orders"] });
        onClose();
        onSuccess(data as CustomDeliveryResult);
      } else if (data.code === "insufficient_balance") {
        toast({ title: "Insufficient balance", description: data.message, variant: "destructive" });
      } else {
        toast({ title: "Purchase failed", description: data.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Purchase failed. Please try again.", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Confirm Purchase</DialogTitle>
          <DialogDescription className="text-sm">{product.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
            {product.logoData ? (
              <img src={product.logoData} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-muted/40 flex items-center justify-center shrink-0"><Store className="w-5 h-5 text-muted-foreground/40" /></div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-foreground text-sm">{product.name}</div>
              {product.description && <div className="text-xs text-muted-foreground truncate">{product.description}</div>}
            </div>
            <div className="shrink-0 font-bold text-foreground">${(product.priceCents / 100).toFixed(2)}</div>
          </div>

          {user ? (
            <>
              {!balanceSufficient && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-400">
                  Insufficient balance. You need <span className="font-semibold">${shortfall.toFixed(2)}</span> more.{" "}
                  <a href="/account" className="underline font-medium">Top up →</a>
                </div>
              )}
              {balanceSufficient && (
                <p className="text-xs text-muted-foreground">Your balance: <span className="font-semibold text-foreground">${(user.balanceCents / 100).toFixed(2)}</span></p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onClose} disabled={purchase.isPending}>Cancel</Button>
                <Button className="flex-1" onClick={() => purchase.mutate()} disabled={purchase.isPending || !balanceSufficient} data-testid="button-confirm-custom-purchase">
                  {purchase.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Buy for ${(product.priceCents / 100).toFixed(2)}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">You need to log in to purchase this item.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
                <Button className="flex-1 gap-2" onClick={() => navigate("/login")} data-testid="button-login-to-purchase">
                  <LogIn className="w-4 h-4" />
                  Log In
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ShopPage() {
  const [, navigate] = useLocation();
  const [orderPlan, setOrderPlan] = useState<Plan | null>(null);
  const [deliveryResult, setDeliveryResult] = useState<PurchaseResult | null>(null);
  const [showClaude, setShowClaude] = useState(false);
  const [customPurchaseTarget, setCustomPurchaseTarget] = useState<CustomProduct | null>(null);
  const [customDeliveryResult, setCustomDeliveryResult] = useState<CustomDeliveryResult | null>(null);

  const { data: customProductsData } = useQuery<{ success: boolean; data: CustomProduct[] }>({
    queryKey: ["/api/products/custom"],
    staleTime: 60_000,
  });

  return (
    <PageLayout fullWidth>
      <DeliveryDialog result={deliveryResult} onClose={() => setDeliveryResult(null)} />
      <OrderDialog plan={orderPlan} onClose={() => setOrderPlan(null)} onSuccess={setDeliveryResult} />
      <ClaudeDialog open={showClaude} onClose={() => setShowClaude(false)} />
      {customPurchaseTarget && (
        <CustomPurchaseDialog
          product={customPurchaseTarget}
          onClose={() => setCustomPurchaseTarget(null)}
          onSuccess={setCustomDeliveryResult}
        />
      )}
      <CustomDeliveryDialog result={customDeliveryResult} onClose={() => setCustomDeliveryResult(null)} />

      {/* ── Hero (hidden — kept for reference only) ───────────────────────── */}
      {false && <section className="relative overflow-hidden bg-background border-b border-border">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-primary/5 blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* Left */}
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-semibold mb-6">
                <Star className="w-3 h-3 fill-primary" />
                #1 Trusted AI Store
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-foreground leading-tight mb-4">
                Instant<br />Activation
              </h1>
              <p className="text-2xl sm:text-3xl font-bold text-primary mb-4">
                ChatGPT Plus · Go · Pro
              </p>
              <p className="text-muted-foreground text-base max-w-md mx-auto lg:mx-0 mb-8 leading-relaxed">
                Get premium AI access in seconds. Pick a plan, pay with crypto — your subscription activates automatically.
              </p>

              <div className="flex flex-wrap items-center gap-3 justify-center lg:justify-start">
                <Button
                  size="lg"
                  className="gap-2 text-base px-6"
                  onClick={() => document.getElementById("plans")?.scrollIntoView({ behavior: "smooth" })}
                  data-testid="button-view-plans"
                >
                  <Zap className="w-4 h-4" />
                  View Plans
                </Button>
                <a href="/" data-testid="button-activate-key">
                  <Button size="lg" variant="outline" className="gap-2 text-base px-6">
                    Activate Key
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </a>
              </div>
            </div>

            {/* Right — floating card */}
            <div className="shrink-0 relative">
              <div className="relative w-48 h-48 sm:w-56 sm:h-56">
                {/* Glow ring */}
                <div className="absolute inset-0 rounded-[2.5rem] bg-primary/20 blur-2xl scale-110" />
                <div className="relative w-full h-full rounded-[2.5rem] bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-2xl shadow-primary/30">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                    <svg viewBox="0 0 41 41" fill="none" className="w-12 h-12 sm:w-14 sm:h-14" xmlns="http://www.w3.org/2000/svg">
                      <path d="M37.532 16.87a9.963 9.963 0 0 0-.856-8.184 10.078 10.078 0 0 0-10.855-4.835 9.964 9.964 0 0 0-6.215-2.972 10.079 10.079 0 0 0-10.164 6.19 9.972 9.972 0 0 0-6.661 4.834 10.08 10.08 0 0 0 1.24 11.817 9.965 9.965 0 0 0 .856 8.185 10.079 10.079 0 0 0 10.855 4.835 9.965 9.965 0 0 0 6.215 2.973 10.078 10.078 0 0 0 10.164-6.192 9.974 9.974 0 0 0 6.66-4.834 10.079 10.079 0 0 0-1.239-11.816ZM22.498 37.886a7.474 7.474 0 0 1-4.799-1.735c.061-.033.168-.091.237-.134l7.964-4.6a1.294 1.294 0 0 0 .655-1.134V19.054l3.366 1.944a.12.12 0 0 1 .066.092v9.299a7.505 7.505 0 0 1-7.49 7.496ZM6.392 31.006a7.471 7.471 0 0 1-.894-5.023c.06.036.162.099.237.141l7.964 4.6a1.297 1.297 0 0 0 1.308 0l9.724-5.614v3.888a.12.12 0 0 1-.048.103L16.4 33.862a7.505 7.505 0 0 1-10.008-2.856Zm-2.34-16.597a7.47 7.47 0 0 1 3.908-3.287C7.979 11.176 7.978 11.242 7.977 11.3v9.199a1.292 1.292 0 0 0 .654 1.132l9.723 5.614-3.366 1.944a.12.12 0 0 1-.114.012L7.044 24.54a7.504 7.504 0 0 1-2.992-10.131Zm27.658 6.437l-9.724-5.615 3.367-1.943a.121.121 0 0 1 .114-.012l7.83 4.76a7.5 7.5 0 0 1-1.158 13.528v-9.299a1.293 1.293 0 0 0-.429-.419Zm3.35-5.043c-.059-.037-.162-.099-.236-.141l-7.965-4.6a1.298 1.298 0 0 0-1.308 0l-9.723 5.614v-3.888a.12.12 0 0 1 .048-.103l7.685-4.458a7.505 7.505 0 0 1 11.499 7.576Zm-21.063 6.929l-3.367-1.944a.12.12 0 0 1-.065-.092v-9.299a7.505 7.505 0 0 1 12.293-5.756 6.94 6.94 0 0 0-.236.134l-7.965 4.6a1.294 1.294 0 0 0-.654 1.132l-.006 11.225Zm1.829-3.943 4.33-2.501 4.332 2.5v4.999l-4.331 2.5-4.331-2.5V19.789Z" fill="white"/>
                    </svg>
                  </div>
                </div>

                {/* Verified badge */}
                <div className="absolute -bottom-3 -left-4 flex items-center gap-1.5 bg-card border border-card-border rounded-full px-3 py-1.5 shadow-lg">
                  <CheckCircle className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Verified</span>
                </div>

                {/* Auto-setup badge */}
                <div className="absolute -top-3 -right-4 flex items-center gap-1.5 bg-card border border-card-border rounded-full px-3 py-1.5 shadow-lg">
                  <Zap className="w-3.5 h-3.5 text-yellow-500" />
                  <span className="text-xs font-semibold text-foreground">Auto-Setup</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>}

      {/* ── Custom Products ───────────────────────────────────────────────── */}
      {(customProductsData?.data?.length ?? 0) > 0 && (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-semibold mb-4">
              <Store className="w-3 h-3" />
              More Products
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-foreground mb-2">Additional Services</h2>
            <p className="text-muted-foreground text-sm">Instant voucher delivery · Auto-deducted from balance</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {customProductsData!.data.map((p) => (
              <div
                key={p.id}
                className="relative rounded-2xl border border-border bg-card p-6 flex flex-col hover:border-primary/40 transition-all duration-200"
                data-testid={`custom-product-card-${p.id}`}
              >
                <div className="flex items-center gap-3 mb-4">
                  {p.logoData ? (
                    <img src={p.logoData} alt={p.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-muted/40 flex items-center justify-center shrink-0">
                      <Store className="w-5 h-5 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-bold text-foreground text-sm leading-tight">{p.name}</h3>
                    {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                  </div>
                </div>

                <div className="mb-5 mt-auto">
                  <span className="text-3xl font-black text-foreground">${(p.priceCents / 100).toFixed(2)}</span>
                  <span className="text-sm text-muted-foreground ml-1">USDT</span>
                </div>

                <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                    <span>Instant delivery</span>
                  </div>
                  {p.stock === 0 && <span className="text-red-500 font-medium">Out of stock</span>}
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={() => setCustomPurchaseTarget(p)}
                  disabled={p.stock === 0}
                  data-testid={`button-buy-custom-${p.id}`}
                >
                  {p.stock === 0 ? "Out of Stock" : "Buy Now"}
                  {p.stock > 0 && <ArrowRight className="w-3.5 h-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Plans ─────────────────────────────────────────────────────────── */}
      <section id="plans" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-semibold mb-4">
            <Zap className="w-3 h-3" />
            Choose Your Plan
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-foreground mb-3">
            Premium subscriptions at<br className="hidden sm:block" /> wholesale prices
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">
            Get premium AI access in seconds. Pick a plan, pay with crypto — your subscription activates automatically.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 flex flex-col transition-all duration-200 ${
                plan.popular
                  ? "border-primary bg-primary/5 shadow-lg shadow-primary/10"
                  : "border-border bg-card hover:border-primary/40"
              }`}
              data-testid={`plan-card-${plan.id}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full shadow">
                    <Star className="w-3 h-3 fill-current" />
                    Popular
                  </span>
                </div>
              )}

              <div className="mb-4">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted border border-border text-xs font-medium text-muted-foreground mb-3">
                  <Clock className="w-3 h-3" />
                  {plan.duration}
                </div>
                <h3 className="text-base font-bold text-foreground leading-tight">{plan.name}</h3>
              </div>

              <div className="mb-5">
                <span className="text-3xl font-black text-foreground">${plan.price.toFixed(2)}</span>
                <span className="text-sm text-muted-foreground ml-1">USDT</span>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6 mt-auto">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span>Automatic delivery</span>
              </div>

              <Button
                className={`w-full gap-2 ${plan.popular ? "" : "variant-outline"}`}
                variant={plan.popular ? "default" : "outline"}
                onClick={() => setOrderPlan(plan)}
                data-testid={`button-get-now-${plan.id}`}
              >
                Get Now
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}

          {/* Claude Pro card */}
          <div
            className="relative rounded-2xl border border-[#D97757]/40 bg-[#D97757]/5 p-6 flex flex-col transition-all duration-200 hover:border-[#D97757]/70"
            data-testid="plan-card-claude"
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="inline-flex items-center gap-1 bg-[#D97757] text-white text-xs font-bold px-3 py-1 rounded-full shadow">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                New
              </span>
            </div>

            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <img src={claudeLogoPath} alt="Claude" className="w-6 h-6 rounded-md" />
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#D97757]/10 border border-[#D97757]/20 text-xs font-medium text-[#D97757]">
                  <Clock className="w-3 h-3" />
                  Weekly
                </div>
              </div>
              <h3 className="text-base font-bold text-foreground leading-tight">Claude Pro</h3>
            </div>

            <div className="mb-5">
              <span className="text-3xl font-black text-foreground">$2.30</span>
              <span className="text-sm text-muted-foreground ml-1">USDT</span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-6 mt-auto">
              <MessageCircle className="w-3.5 h-3.5 text-[#D97757]" />
              <span>Via WhatsApp</span>
            </div>

            <Button
              className="w-full gap-2 bg-[#D97757] hover:bg-[#c9673f] text-white border-0"
              onClick={() => setShowClaude(true)}
              data-testid="button-get-now-claude"
            >
              Get Now
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-muted/20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-border bg-card p-5">
                <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center mb-4`}>
                  <f.icon className={`w-5 h-5 ${f.color}`} />
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1.5">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
