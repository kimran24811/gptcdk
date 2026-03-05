import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SiTelegram } from "react-icons/si";
import { Zap, Shield, Clock, ShoppingCart, CheckCircle, Minus, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PLANS = [
  {
    id: "plus-1m",
    name: "ChatGPT Plus CDK",
    product: "ChatGPT",
    duration: "1 months",
    price: 2.45,
    fromPrice: 1.55,
    popular: true,
  },
  {
    id: "plus-1y",
    name: "ChatGPT Plus CDK",
    product: "ChatGPT",
    duration: "1 years",
    price: 18.15,
    fromPrice: 18.15,
    popular: false,
  },
  {
    id: "go-1y",
    name: "ChatGPT GO CDK",
    product: "ChatGPT",
    duration: "1 years",
    price: 2.65,
    fromPrice: 2.65,
    popular: false,
  },
  {
    id: "pro-1m",
    name: "ChatGPT Pro CDK",
    product: "ChatGPT",
    duration: "1 months",
    price: 100.15,
    fromPrice: 100.15,
    popular: false,
  },
];

const VOLUME_DISCOUNTS = [
  { qty: 10, price: 2.15, pct: -12 },
  { qty: 30, price: 1.95, pct: -20 },
  { qty: 50, price: 1.75, pct: -29 },
  { qty: 100, price: 1.55, pct: -37 },
];

const PAYMENT_METHODS = [
  { id: "trc20", label: "USDT", sub: "USDT TRC-20", color: "#26A17B" },
  { id: "bep20", label: "USDT", sub: "USDT BEP-20", color: "#26A17B" },
  { id: "ton", label: "USDT", sub: "USDT TON", color: "#26A17B" },
  { id: "balance", label: "Balance", sub: "$0.00", color: "#6B7280", isBalance: true },
];

function TetherIcon({ color = "#26A17B", size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill={color} />
      <path
        d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.666 0-.817 2.902-1.494 6.79-1.668v2.654c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.654c3.88.174 6.775.852 6.775 1.667 0 .816-2.896 1.493-6.775 1.666m0-3.605v-2.378h5.42V8H8.638v3.4h5.42v2.378c-4.404.202-7.709 1.074-7.709 2.118 0 1.044 3.305 1.915 7.709 2.117v7.586h3.864v-7.587c4.395-.202 7.694-1.073 7.694-2.116 0-1.043-3.299-1.915-7.694-2.118"
        fill="white"
      />
    </svg>
  );
}

function BalanceIcon({ size = 20 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-muted flex items-center justify-center"
    >
      <ShoppingCart className="w-3 h-3 text-muted-foreground" />
    </div>
  );
}

export default function ShopPage() {
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState(PLANS[0]);
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("trc20");

  const unitPrice = (() => {
    if (selectedPlan.id !== "plus-1m") return selectedPlan.price;
    const discount = VOLUME_DISCOUNTS.slice().reverse().find((d) => quantity >= d.qty);
    return discount ? discount.price : selectedPlan.price;
  })();

  const totalPrice = (unitPrice * quantity).toFixed(2);

  const handleCreateOrder = () => {
    const method = PAYMENT_METHODS.find((m) => m.id === paymentMethod);
    const msg = encodeURIComponent(
      `I want to order:\n${selectedPlan.name} (${selectedPlan.duration}) x${quantity}\nTotal: $${totalPrice} USDT\nPayment: ${method?.sub || "USDT"}`
    );
    window.open(`https://t.me/CDK_Keys?text=${msg}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-foreground text-lg tracking-tight">ChatGPT Recharge</span>
            <Badge variant="default" className="text-xs" data-testid="badge-plus">Plus</Badge>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1">
              <a href="/" className="px-4 py-1.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent" data-testid="nav-redeem">Redeem</a>
              <a href="/batch" className="px-4 py-1.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent" data-testid="nav-batch-check">Batch Check</a>
              <button className="px-4 py-1.5 text-sm font-medium text-foreground border-b-2 border-primary" data-testid="nav-shop">Shop</button>
            </nav>
            <a href="https://t.me/CDK_Keys?text=i%20want%20to%20purchase%20key" target="_blank" rel="noopener noreferrer" data-testid="button-telegram">
              <Button size="sm" className="gap-1.5 bg-[#229ED9] text-white border-[#1a8bbf]">
                <SiTelegram className="w-3.5 h-3.5" />
                Buy Key
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* LEFT COLUMN */}
          <div className="flex-1 space-y-4 min-w-0">
            {/* Hero Banner */}
            <div
              className="rounded-xl overflow-hidden relative"
              style={{ background: "linear-gradient(135deg, #16a34a 0%, #15803d 50%, #166534 100%)" }}
              data-testid="shop-hero"
            >
              <div className="px-6 py-12 relative z-10">
                <div className="text-5xl font-black text-white/20 absolute inset-0 flex items-center justify-center select-none pointer-events-none tracking-tight">
                  ChatGPT
                </div>
                <div className="relative z-10 mt-8">
                  <h2 className="text-2xl font-bold text-white">ChatGPT</h2>
                </div>
              </div>
            </div>

            {/* Plan Selection */}
            <Card className="border border-card-border">
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4">Select Plan</h3>
                <div className="grid grid-cols-2 gap-3">
                  {PLANS.map((plan) => {
                    const selected = selectedPlan.id === plan.id;
                    return (
                      <button
                        key={plan.id}
                        onClick={() => { setSelectedPlan(plan); setQuantity(1); }}
                        className={`text-left p-3 rounded-lg border-2 transition-all duration-150 ${
                          selected
                            ? "border-primary bg-primary/5"
                            : "border-border bg-background"
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
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {plan.duration}
                              </span>
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

            {/* Volume Discounts — only for Plus 1M */}
            {selectedPlan.id === "plus-1m" && (
              <Card className="border border-card-border">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Volume Discounts</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4">Click a row to apply it instantly</p>
                  <div className="space-y-2">
                    {VOLUME_DISCOUNTS.map((tier) => {
                      const BASE_PRICE = 2.45;
                      const tierTotal = (tier.price * tier.qty).toFixed(2);
                      const savedTotal = ((BASE_PRICE - tier.price) * tier.qty).toFixed(2);
                      const isActive = quantity === tier.qty;
                      return (
                        <button
                          key={tier.qty}
                          onClick={() => setQuantity(tier.qty)}
                          className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all duration-150 hover-elevate ${
                            isActive
                              ? "border-primary bg-primary/5"
                              : "border-border bg-background"
                          }`}
                          data-testid={`volume-tier-${tier.qty}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className={`text-sm font-medium w-10 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                                ≥{tier.qty}
                              </span>
                              <div>
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-base font-bold text-foreground">${tier.price.toFixed(2)}</span>
                                  <span className="text-xs text-muted-foreground">/ unit</span>
                                </div>
                                {isActive && (
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="text-xs text-muted-foreground">
                                      {tier.qty} keys × ${tier.price.toFixed(2)} = <span className="font-semibold text-foreground">${tierTotal}</span>
                                    </span>
                                    <span className="text-xs font-semibold text-primary">
                                      Save ${savedTotal}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {isActive && (
                                <CheckCircle className="w-4 h-4 text-primary" />
                              )}
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
            <div className="flex gap-3 flex-wrap">
              {[
                { icon: Zap, label: "Lightning Fast", color: "text-yellow-500" },
                { icon: Shield, label: "Private & Secure", color: "text-primary" },
                { icon: Clock, label: "No Expiration", color: "text-purple-500" },
              ].map(({ icon: Icon, label, color }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-card border border-card-border text-sm font-medium text-foreground"
                >
                  <Icon className={`w-4 h-4 ${color}`} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN — Payment Panel */}
          <div className="w-full lg:w-80 lg:sticky lg:top-20 shrink-0">
            <Card className="border border-card-border">
              <CardContent className="p-5 space-y-5">
                {/* Header */}
                <div className="flex items-center gap-2 pb-1">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Payment</span>
                </div>

                {/* Product + Price */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-foreground text-base leading-tight" data-testid="payment-product-name">
                      {selectedPlan.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{selectedPlan.product}</div>
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
                  <div className="flex items-center justify-between">
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      data-testid="button-qty-decrease"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <span className="text-base font-semibold text-foreground w-12 text-center" data-testid="text-quantity">
                      {quantity}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => setQuantity((q) => q + 1)}
                      data-testid="button-qty-increase"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {selectedPlan.id === "plus-1m" && quantity > 1 && (
                    <div className="mt-2 text-xs text-primary font-medium text-center">
                      ${unitPrice.toFixed(2)}/unit · ${totalPrice} total
                    </div>
                  )}
                </div>

                <div className="border-t border-border" />

                {/* Payment Method */}
                <div>
                  <div className="text-sm font-medium text-foreground mb-3">Payment Method</div>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.map((method) => {
                      const selected = paymentMethod === method.id;
                      return (
                        <button
                          key={method.id}
                          onClick={() => setPaymentMethod(method.id)}
                          className={`flex items-center gap-2 p-2.5 rounded-lg border-2 text-left transition-all duration-150 ${
                            selected ? "border-primary bg-primary/5" : "border-border bg-background"
                          }`}
                          data-testid={`payment-method-${method.id}`}
                        >
                          {method.isBalance ? (
                            <BalanceIcon size={24} />
                          ) : (
                            <TetherIcon color={method.color} size={24} />
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-foreground leading-tight">{method.label}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              {!method.isBalance && (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                              )}
                              <span className="text-[10px] text-muted-foreground truncate">{method.sub}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Create Order Button */}
                <Button
                  className="w-full gap-2"
                  size="lg"
                  onClick={handleCreateOrder}
                  data-testid="button-create-order"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Create Order — ${totalPrice} USDT
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
