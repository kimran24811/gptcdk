import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { SiWhatsapp } from "react-icons/si";
import { Wallet, Package, Copy, Check, ChevronDown, ChevronUp, Zap, Loader2, Plus, AlertCircle, CheckCircle2, Clock, ArrowLeft } from "lucide-react";
import type { Order } from "@shared/schema";

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

function CopyAllBtn({ keys, orderId }: { keys: string[]; orderId: number }) {
  const { copied, copy } = useCopied();
  return (
    <button
      onClick={() => copy(keys.join("\n"))}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-all shrink-0 ${
        copied
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
      data-testid={`button-copy-all-keys-${orderId}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : `Copy All (${keys.length} keys)`}
    </button>
  );
}

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining("Expired"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h > 0 ? `${h}h ` : ""}${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  return remaining;
}

interface DepositInfo {
  id: number;
  amountUsdt: string;
  amountCents: number;
  network: string;
  walletAddress: string;
  expiresAt: string;
}

function TopUpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [amountUsd, setAmountUsd] = useState("");
  const [network, setNetwork] = useState<"trc20" | "bep20">("trc20");
  const [deposit, setDeposit] = useState<DepositInfo | null>(null);
  const [checkResult, setCheckResult] = useState<{ status: string; message?: string; balanceCents?: number } | null>(null);
  const [txHashInput, setTxHashInput] = useState("");
  const countdown = useCountdown(deposit?.expiresAt ?? null);

  const reset = () => {
    setStep(1);
    setAmountUsd("");
    setNetwork("trc20");
    setDeposit(null);
    setCheckResult(null);
    setTxHashInput("");
  };

  const handleClose = () => { reset(); onClose(); };

  const createDeposit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/deposit/create", { amountUsd, network });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setDeposit(data.deposit);
        setStep(2);
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not create deposit.", variant: "destructive" }),
  });

  const checkDeposit = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {};
      if (txHashInput.trim()) body.txHash = txHashInput.trim();
      const res = await apiRequest("POST", `/api/deposit/check/${deposit!.id}`, body);
      return res.json();
    },
    onSuccess: (data) => {
      setCheckResult(data);
      if (data.status === "completed") {
        setStep(3);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/me/deposits"] });
      } else if (data.status === "expired") {
        toast({ title: "Expired", description: data.message, variant: "destructive" });
        handleClose();
      }
      // No toast on pending — dialog already shows the status inline
    },
    onError: () => { /* silent on auto-check; user sees "I Paid" state */ },
  });

  // Auto-poll every 30 seconds while on step 2 waiting for payment
  useEffect(() => {
    if (step !== 2 || !deposit) return;
    const interval = setInterval(() => {
      if (!checkDeposit.isPending) checkDeposit.mutate();
    }, 30000);
    return () => clearInterval(interval);
  }, [step, deposit]);

  const networkLabel = network === "trc20" ? "TRC-20 (TRON)" : "BEP-20 (BSC)";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Top Up Balance"}
            {step === 2 && "Send USDT"}
            {step === 3 && "Payment Confirmed!"}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Amount + Network */}
        {step === 1 && (
          <div className="space-y-4 pt-1">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Amount (USD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="10"
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  className="pl-7"
                  data-testid="input-topup-amount"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Network</label>
              <div className="grid grid-cols-2 gap-2">
                {(["trc20", "bep20"] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setNetwork(n)}
                    className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left ${
                      network === n
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`button-network-${n}`}
                  >
                    <div className="font-semibold">{n === "trc20" ? "TRC-20" : "BEP-20"}</div>
                    <div className="text-xs opacity-70">{n === "trc20" ? "TRON" : "BSC"}</div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">TRC-20 has lower withdrawal fees on Binance.</p>
            </div>
            <Button
              className="w-full"
              disabled={!amountUsd || parseFloat(amountUsd) < 1 || createDeposit.isPending}
              onClick={() => createDeposit.mutate()}
              data-testid="button-create-deposit"
            >
              {createDeposit.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Continue
            </Button>
          </div>
        )}

        {/* Step 2: QR + Address + I Paid */}
        {step === 2 && deposit && (
          <div className="space-y-4 pt-1">
            {/* Amount to send */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Send EXACTLY this amount</div>
              <div className="text-2xl font-black text-foreground tracking-tight">{deposit.amountUsdt} <span className="text-base font-semibold text-muted-foreground">USDT</span></div>
              <div className="text-xs text-muted-foreground mt-0.5">{networkLabel}</div>
              <div className="flex justify-center mt-2">
                <CopyBtn text={deposit.amountUsdt} label="usdt-amount" />
              </div>
            </div>

            {/* QR code */}
            <div className="flex justify-center">
              <div className="p-3 bg-white rounded-xl border border-border">
                <QRCodeSVG value={deposit.walletAddress} size={140} />
              </div>
            </div>

            {/* Wallet address */}
            <div className="rounded-lg border border-border p-3">
              <div className="text-xs text-muted-foreground mb-1">Send to address</div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-foreground flex-1 break-all leading-relaxed">{deposit.walletAddress}</code>
                <CopyBtn text={deposit.walletAddress} label="wallet-address" />
              </div>
            </div>

            {/* Warning */}
            <div className="flex gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-600 dark:text-amber-400">Send the EXACT amount shown. A different amount cannot be detected automatically.</p>
            </div>

            {/* Countdown */}
            <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Expires in <span className="font-mono font-semibold text-foreground">{countdown}</span></span>
            </div>

            {/* Auto-check status */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              {checkDeposit.isPending
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Checking blockchain…</>
                : <><Clock className="w-3 h-3" /> Auto-checking every 30 seconds</>
              }
            </div>

            {/* TX Hash input */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Transaction Hash <span className="text-muted-foreground/60 font-normal">(optional — paste for instant verification)</span>
              </label>
              <Input
                value={txHashInput}
                onChange={(e) => setTxHashInput(e.target.value)}
                placeholder={deposit?.network === "trc20" ? "e.g. abc123def456..." : "e.g. 0xabc123..."}
                className="font-mono text-xs"
                data-testid="input-tx-hash"
              />
            </div>

            {/* Check result */}
            {checkResult?.status === "pending" && (
              <div className="flex gap-2 p-2.5 rounded-lg bg-muted/50 border border-border">
                <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">{checkResult.message}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { reset(); setStep(1); }} className="gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={() => checkDeposit.mutate()}
                disabled={checkDeposit.isPending}
                data-testid="button-i-paid"
              >
                {checkDeposit.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {checkDeposit.isPending ? "Checking..." : "I Paid — Check Now"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 3 && checkResult && (
          <div className="space-y-4 pt-1 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-primary" />
              </div>
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">Payment Received!</p>
              <p className="text-sm text-muted-foreground mt-1">
                ${(deposit!.amountCents / 100).toFixed(2)} has been added to your balance.
              </p>
              {checkResult.balanceCents !== null && checkResult.balanceCents !== undefined && (
                <p className="text-2xl font-black text-foreground mt-2">
                  ${(checkResult.balanceCents / 100).toFixed(2)} <span className="text-sm font-normal text-muted-foreground">new balance</span>
                </p>
              )}
            </div>
            <Button className="w-full" onClick={handleClose} data-testid="button-deposit-done">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
            <div className="flex items-center gap-2">
              {order.keys && order.keys.length > 1 && (
                <CopyAllBtn keys={order.keys} orderId={order.id} />
              )}
              <Badge variant="secondary">{order.status}</Badge>
            </div>
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
  const [topUpOpen, setTopUpOpen] = useState(false);

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
    `Hi, I'd like to top up my ChatGPT Recharge account.\n\nEmail: ${user.email}`
  )}`;

  return (
    <PageLayout>
      <TopUpDialog open={topUpOpen} onClose={() => setTopUpOpen(false)} />

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

            {/* Top-up actions */}
            <div className="mt-5 pt-4 border-t border-border space-y-3">
              <Button
                className="w-full gap-2"
                onClick={() => setTopUpOpen(true)}
                data-testid="button-topup-crypto"
              >
                <Plus className="w-4 h-4" />
                Top Up with USDT
              </Button>
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" data-testid="button-topup-whatsapp">
                <Button variant="outline" className="w-full gap-2 border-[#25D366] text-[#25D366] hover:bg-[#25D366]/10">
                  <SiWhatsapp className="w-4 h-4" />
                  Contact on WhatsApp
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
