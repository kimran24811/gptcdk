import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Copy, Check, Loader2, CheckCircle, Clock, AlertTriangle,
  Download, MessageCircle, Zap, ArrowLeft, Wallet,
} from "lucide-react";

const WHATSAPP = "+447577308067";

interface CheckoutData {
  status: string;
  amountUsdt: string;
  totalCents: number;
  walletAddress: string;
  network: string;
  items: Array<{ planKey: string; planName: string; quantity: number; unitCents: number }>;
  expiresAt: string;
  deliveredKeys: Array<{ planKey: string; keys: string[] }> | null;
  orderNumber: string | null;
}

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

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const { copied, copy } = useCopied();
  return (
    <button
      onClick={() => copy(text)}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all shrink-0 ${
        copied
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40"
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const update = () => {
      const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(diff);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const isLow = remaining < 5 * 60 * 1000;

  if (remaining === 0) return <span className="text-destructive font-semibold text-sm">Expired</span>;

  return (
    <span className={`font-mono font-semibold text-sm ${isLow ? "text-orange-500" : "text-foreground"}`}>
      {h > 0 ? `${h}h ` : ""}{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

function DeliveryView({
  deliveredKeys,
  orderNumber,
  items,
}: {
  deliveredKeys: Array<{ planKey: string; keys: string[] }>;
  orderNumber: string | null;
  items: CheckoutData["items"];
}) {
  const [allCopied, setAllCopied] = useState(false);
  const allKeys = deliveredKeys.flatMap((g) => g.keys);

  const copyAll = () => {
    navigator.clipboard.writeText(allKeys.join("\n")).then(() => {
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2000);
    });
  };

  const downloadTxt = () => {
    const blob = new Blob([allKeys.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `order-${orderNumber ?? "keys"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col gap-5"
    >
      {/* Success banner */}
      <div className="flex flex-col items-center gap-3 text-center py-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-black text-foreground">Order Delivered!</h2>
          {orderNumber && <p className="text-sm text-muted-foreground mt-0.5">Order #{orderNumber}</p>}
        </div>
        <p className="text-sm text-muted-foreground max-w-sm">
          Your keys are below. Save them safely — these are your activation codes.
        </p>
      </div>

      {/* Bulk actions */}
      {allKeys.length > 1 && (
        <div className="flex gap-2">
          <button
            onClick={copyAll}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-semibold transition-all ${
              allCopied
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-muted/40 text-foreground hover:bg-muted"
            }`}
            data-testid="button-copy-all-keys"
          >
            {allCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {allCopied ? "Copied!" : `Copy All (${allKeys.length})`}
          </button>
          <button
            onClick={downloadTxt}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border bg-muted/40 text-foreground hover:bg-muted text-xs font-semibold transition-all"
            data-testid="button-download-keys"
          >
            <Download className="w-3.5 h-3.5" />
            Download .txt
          </button>
        </div>
      )}

      {/* Keys grouped by plan */}
      <div className="space-y-3">
        {deliveredKeys.map((group) => {
          const item = items.find((i) => i.planKey === group.planKey);
          return (
            <div key={group.planKey}>
              {deliveredKeys.length > 1 && (
                <p className="text-xs font-semibold text-muted-foreground mb-1.5">{item?.planName ?? group.planKey}</p>
              )}
              <div className="space-y-1.5">
                {group.keys.map((key, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border"
                    data-testid={`delivery-key-${idx}`}
                  >
                    <code className="text-xs font-mono text-foreground flex-1 break-all">{key}</code>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <CopyButton text={key} />
                      <a
                        href={`/activate?key=${encodeURIComponent(key)}`}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-primary/40 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 transition-colors"
                        data-testid={`button-redeem-delivery-${idx}`}
                      >
                        <Zap className="w-3 h-3" /> Redeem
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <a href="/shop" className="block mt-2">
        <Button variant="outline" className="w-full gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Shop
        </Button>
      </a>
    </motion.div>
  );
}

export default function CheckoutPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [data, setData] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [txHashInput, setTxHashInput] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCheckout = useCallback(async () => {
    try {
      const res = await fetch(`/api/guest/checkout/${token}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        return json.status as string;
      }
    } catch {
      // ignore fetch errors during polling
    }
    return null;
  }, [token]);

  // Initial load
  useEffect(() => {
    if (!token) { navigate("/shop"); return; }
    setLoading(true);
    fetchCheckout().finally(() => setLoading(false));
  }, [token, fetchCheckout, navigate]);

  // Auto-poll every 30s when pending
  useEffect(() => {
    if (!data) return;
    if (data.status === "fulfilled" || data.status === "out_of_stock" || data.status === "expired") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await apiRequest("POST", `/api/guest/checkout/${token}/check`, {});
        const json = await res.json();
        if (json.success) {
          setData((prev) => prev ? { ...prev, ...json, items: prev.items, expiresAt: prev.expiresAt, walletAddress: prev.walletAddress, amountUsdt: prev.amountUsdt, totalCents: prev.totalCents, network: prev.network } : prev);
          if (json.status === "fulfilled" || json.status === "out_of_stock" || json.status === "expired") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch { /* ignore */ }
    }, 30_000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [data?.status, token]);

  const handleCheck = async () => {
    if (!token) return;
    setChecking(true);
    try {
      const res = await apiRequest("POST", `/api/guest/checkout/${token}/check`, {
        txHash: txHashInput.trim() || undefined,
      });
      const json = await res.json();
      if (json.success) {
        setData((prev) => prev ? { ...prev, ...json, items: prev.items, expiresAt: prev.expiresAt, walletAddress: prev.walletAddress, amountUsdt: prev.amountUsdt, totalCents: prev.totalCents, network: prev.network } : prev);
        if (json.status === "pending") {
          toast({ title: "Not detected yet", description: json.message ?? "Payment not found. Please wait or double-check your transaction.", variant: "default" });
        }
      } else {
        toast({ title: "Error", description: json.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not check payment. Please try again.", variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <AlertTriangle className="w-10 h-10 text-muted-foreground" />
        <p className="text-muted-foreground">Checkout session not found.</p>
        <a href="/shop"><Button variant="outline" className="gap-2"><ArrowLeft className="w-4 h-4" />Back to Shop</Button></a>
      </div>
    );
  }

  const isExpired = data.status === "expired" || new Date() > new Date(data.expiresAt);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background sticky top-0 z-50">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <a href="/shop" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back to Shop
          </a>
          <span className="font-bold text-foreground text-sm">Checkout</span>
          <a
            href={`https://wa.me/${WHATSAPP.replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            <span className="hidden xs:inline">Support</span>
          </a>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-6">
        <AnimatePresence mode="wait">
          {/* ── Delivered ──────────────────────────────────────────────────── */}
          {data.status === "fulfilled" && data.deliveredKeys && (
            <motion.div key="delivered" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <DeliveryView
                deliveredKeys={data.deliveredKeys}
                orderNumber={data.orderNumber}
                items={data.items}
              />
            </motion.div>
          )}

          {/* ── Out of stock ────────────────────────────────────────────────── */}
          {data.status === "out_of_stock" && (
            <motion.div key="oos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-5 text-center py-8">
              <div className="w-16 h-16 rounded-full bg-orange-500/10 border-2 border-orange-500/30 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
              <div>
                <h2 className="text-xl font-black text-foreground">Payment Received</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm leading-relaxed">
                  We received your payment but unfortunately ran out of stock.
                  Contact support on WhatsApp and we'll sort it out immediately.
                </p>
              </div>
              <a
                href={`https://wa.me/${WHATSAPP.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi, I just paid for order ${data.orderNumber ?? token} but got an out-of-stock error. Please help.`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button className="gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0">
                  <MessageCircle className="w-4 h-4" />
                  Contact Support on WhatsApp
                </Button>
              </a>
            </motion.div>
          )}

          {/* ── Expired ────────────────────────────────────────────────────── */}
          {(isExpired && data.status !== "fulfilled" && data.status !== "out_of_stock") && (
            <motion.div key="expired" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-5 text-center py-8">
              <div className="w-16 h-16 rounded-full bg-muted border-2 border-border flex items-center justify-center">
                <Clock className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h2 className="text-xl font-black text-foreground">Session Expired</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                  This checkout session has expired. If you paid, please contact support with your transaction hash.
                </p>
              </div>
              <div className="flex gap-3">
                <a href="/shop">
                  <Button variant="outline" className="gap-2"><ArrowLeft className="w-4 h-4" />New Order</Button>
                </a>
                <a
                  href={`https://wa.me/${WHATSAPP.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi, I paid for checkout ${token} but the session expired. Please credit my order.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white border-0">
                    <MessageCircle className="w-4 h-4" />
                    Contact Support
                  </Button>
                </a>
              </div>
            </motion.div>
          )}

          {/* ── Awaiting payment ───────────────────────────────────────────── */}
          {!isExpired && (data.status === "pending_payment" || data.status === "paid") && (
            <motion.div key="payment" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-5">

              {/* Order summary */}
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Order Summary</p>
                {data.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1">
                    <span className="text-foreground">{item.planName} × {item.quantity}</span>
                    <span className="text-muted-foreground">${((item.unitCents * item.quantity) / 100).toFixed(2)}</span>
                  </div>
                ))}
                <div className="border-t border-border mt-2 pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Total</span>
                  <span className="text-lg font-black text-foreground">${(data.totalCents / 100).toFixed(2)} <span className="text-xs font-normal text-muted-foreground">USDT</span></span>
                </div>
              </div>

              {/* Payment instructions */}
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">Pay with USDT BEP-20</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    <Countdown expiresAt={data.expiresAt} />
                  </div>
                </div>

                {/* QR code */}
                <div className="flex justify-center">
                  <div className="p-3 bg-white rounded-xl shadow-md">
                    <QRCodeSVG
                      value={data.walletAddress}
                      size={160}
                      level="M"
                    />
                  </div>
                </div>

                {/* Amount — most important field */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Send EXACTLY this amount</p>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-background border-2 border-primary/40">
                    <span className="font-black text-2xl text-primary flex-1" data-testid="text-usdt-amount">{data.amountUsdt}</span>
                    <span className="text-sm text-muted-foreground">USDT</span>
                    <CopyButton text={data.amountUsdt} label="Copy Amount" />
                  </div>
                  <p className="text-[11px] text-orange-500 font-medium">
                    ⚠ Send the exact amount above — even 0.01 USDT difference will delay detection
                  </p>
                </div>

                {/* Wallet address */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">To this BSC (BEP-20) wallet address</p>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-background border border-border">
                    <code className="text-xs font-mono text-foreground flex-1 break-all" data-testid="text-wallet-address">{data.walletAddress}</code>
                    <CopyButton text={data.walletAddress} />
                  </div>
                </div>
              </div>

              {/* Status indicator */}
              {data.status === "paid" && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm text-primary">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  Payment detected — fulfilling your order...
                </div>
              )}

              {/* Manual TX hash input */}
              <div className="rounded-xl border border-border p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Already paid?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Auto-detection runs every 30 seconds. If it's taking long, paste your transaction hash below for instant verification.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="0x... transaction hash"
                    value={txHashInput}
                    onChange={(e) => setTxHashInput(e.target.value)}
                    className="font-mono text-xs"
                    data-testid="input-tx-hash"
                  />
                  <Button
                    onClick={handleCheck}
                    disabled={checking}
                    className="shrink-0 gap-1.5"
                    data-testid="button-check-payment"
                  >
                    {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {checking ? "Checking..." : "Verify"}
                  </Button>
                </div>
                {!txHashInput && (
                  <Button
                    variant="ghost"
                    className="w-full text-xs text-muted-foreground"
                    onClick={handleCheck}
                    disabled={checking}
                    data-testid="button-scan-payment"
                  >
                    {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                    {checking ? "Scanning..." : "Check payment status"}
                  </Button>
                )}
              </div>

              {/* Support link */}
              <p className="text-center text-xs text-muted-foreground">
                Need help?{" "}
                <a
                  href={`https://wa.me/${WHATSAPP.replace(/\D/g, "")}?text=${encodeURIComponent("Hi, I need help with my checkout. Token: " + token)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline font-medium"
                >
                  Contact us on WhatsApp
                </a>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
