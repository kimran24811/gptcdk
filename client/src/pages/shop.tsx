import { useState } from "react";
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
import { Zap, Shield, Clock, ShoppingCart, CheckCircle, Minus, Plus, Copy, Check } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { PageLayout } from "@/components/page-layout";

// ─────────────────────────────────────────────
// PRICING CONFIG — Edit prices here
// ─────────────────────────────────────────────
const PLANS = [
  {
    id: "plus-1m",
    name: "ChatGPT Plus CDK",
    duration: "1 month",
    price: 2.38,       // base price per unit
    fromPrice: 1.55,   // lowest price (bulk)
    popular: true,
  },
  {
    id: "plus-1y",
    name: "ChatGPT Plus CDK",
    duration: "1 year",
    price: 28,
    fromPrice: 28,
    popular: false,
  },
  {
    id: "go-1y",
    name: "ChatGPT GO CDK",
    duration: "1 year",
    price: 5,
    fromPrice: 5,
    popular: false,
  },
  {
    id: "pro-1m",
    name: "ChatGPT Pro CDK",
    duration: "1 month",
    price: 110,
    fromPrice: 110,
    popular: false,
  },
];

// Volume discounts — only applies to Plus 1M plan
const VOLUME_DISCOUNTS = [
  { qty: 10,  price: 2.15, pct: -12 },
  { qty: 30,  price: 1.95, pct: -20 },
  { qty: 50,  price: 1.75, pct: -29 },
  { qty: 100, price: 1.55, pct: -37 },
];

// ─────────────────────────────────────────────
// PAYMENT CONFIG — Edit payment details here
// ─────────────────────────────────────────────
const BINANCE_PAY_ID = "552780449";
const BINANCE_USERNAME = "User-1d9f7";

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

function OrderDialog({
  open,
  onClose,
  plan,
  quantity,
  unitPrice,
  totalPrice,
}: {
  open: boolean;
  onClose: () => void;
  plan: (typeof PLANS)[0];
  quantity: number;
  unitPrice: number;
  totalPrice: string;
}) {
  const whatsappUrl = `https://wa.me/+447577308067?text=${encodeURIComponent(
    `Hi, I sent $${totalPrice} USDT to Binance Pay ID ${BINANCE_PAY_ID} for ${plan.name} (${plan.duration}) x${quantity}. Here is my payment screenshot:`
  )}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Complete Your Payment</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Send the exact amount to the Binance Pay ID below, then share your screenshot on Telegram.
          </DialogDescription>
        </DialogHeader>

        {/* Order summary */}
        <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium text-foreground">{plan.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-medium text-foreground">{plan.duration}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Quantity</span>
            <span className="font-medium text-foreground">{quantity} key{quantity !== 1 ? "s" : ""}</span>
          </div>
          {quantity > 1 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unit price</span>
              <span className="font-medium text-foreground">${unitPrice.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-border pt-2 mt-2 flex justify-between">
            <span className="font-semibold text-foreground">Total</span>
            <span className="font-bold text-foreground text-base">${totalPrice} USDT</span>
          </div>
        </div>

        {/* Amount to send */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Send exactly this amount:</p>
          <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-primary bg-primary/5">
            <span className="text-3xl font-black text-foreground flex-1" data-testid="payment-amount">
              ${totalPrice}
            </span>
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs font-semibold text-muted-foreground">USDT</span>
              <CopyButton text={totalPrice} label="amount" />
            </div>
          </div>
        </div>

        {/* Binance Pay details */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">To this Binance Pay account:</p>
          <div className="rounded-lg border border-border divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Pay ID</div>
                <div className="font-mono font-semibold text-foreground text-base" data-testid="binance-pay-id">
                  {BINANCE_PAY_ID}
                </div>
              </div>
              <CopyButton text={BINANCE_PAY_ID} label="Binance Pay ID" />
            </div>
            <div className="flex items-center justify-between px-4 py-3 gap-3">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5">Username</div>
                <div className="font-mono font-semibold text-foreground" data-testid="binance-username">
                  {BINANCE_USERNAME}
                </div>
              </div>
              <CopyButton text={BINANCE_USERNAME} label="username" />
            </div>
          </div>
        </div>

        {/* Contact CTA */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            After sending, share your payment screenshot with us on WhatsApp.
          </p>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
            data-testid="button-open-whatsapp"
          >
            <Button className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white border-0" size="lg">
              <SiWhatsapp className="w-4 h-4" />
              Share Screenshot on WhatsApp
            </Button>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ShopPage() {
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState(PLANS[0]);
  const [quantity, setQuantity] = useState(1);
  const [qtyInput, setQtyInput] = useState("1");
  const [orderOpen, setOrderOpen] = useState(false);

  const unitPrice = (() => {
    if (selectedPlan.id !== "plus-1m") return selectedPlan.price;
    const discount = VOLUME_DISCOUNTS.slice().reverse().find((d) => quantity >= d.qty);
    return discount ? discount.price : selectedPlan.price;
  })();

  const totalPrice = (unitPrice * quantity).toFixed(2);

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

  const handleOrder = () => {
    if (quantity < 1) {
      toast({ title: "Invalid quantity", description: "Please enter at least 1.", variant: "destructive" });
      return;
    }
    setOrderOpen(true);
  };

  const appliedDiscount = selectedPlan.id === "plus-1m"
    ? VOLUME_DISCOUNTS.slice().reverse().find((d) => quantity >= d.qty)
    : null;

  return (
    <PageLayout maxWidth="max-w-5xl">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Shop</h1>
        <p className="text-muted-foreground text-sm">Buy CDK keys — pay via Binance Pay</p>
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
          {selectedPlan.id === "plus-1m" && (
            <Card className="border border-card-border">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Volume Discounts</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">Tap a row to apply it instantly</p>
                <div className="space-y-2">
                  {VOLUME_DISCOUNTS.map((tier) => {
                    const tierTotal = (tier.price * tier.qty).toFixed(2);
                    const savedTotal = ((2.38 - tier.price) * tier.qty).toFixed(2);
                    const isActive = quantity >= tier.qty && (
                      VOLUME_DISCOUNTS.indexOf(tier) === VOLUME_DISCOUNTS.length - 1 ||
                      quantity < VOLUME_DISCOUNTS[VOLUME_DISCOUNTS.indexOf(tier) + 1].qty
                    );
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
                            <span className={`text-sm font-medium w-10 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                              ≥{tier.qty}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-base font-bold text-foreground">${tier.price.toFixed(2)}</span>
                                <span className="text-xs text-muted-foreground">/ unit</span>
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
              { icon: Zap, label: "Lightning Fast", color: "text-yellow-500" },
              { icon: Shield, label: "Private & Secure", color: "text-primary" },
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

              {/* Quantity — type any number or use buttons */}
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

                {/* Unit price + discount badge */}
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

              {/* Total + Order button */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Total</span>
                  <span className="text-2xl font-black text-foreground">${totalPrice} <span className="text-sm font-normal text-muted-foreground">USDT</span></span>
                </div>
                <Button
                  className="w-full gap-2"
                  size="lg"
                  onClick={handleOrder}
                  data-testid="button-create-order"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Order — ${totalPrice} USDT
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Pay via Binance Pay · Fulfilled via WhatsApp
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Order dialog */}
      <OrderDialog
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        plan={selectedPlan}
        quantity={quantity}
        unitPrice={unitPrice}
        totalPrice={totalPrice}
      />
    </PageLayout>
  );
}
