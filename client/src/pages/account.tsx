import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { SiWhatsapp } from "react-icons/si";
import { Wallet, Package, Copy, Check, ChevronDown, ChevronUp, Zap, Loader2, Plus, AlertCircle, CheckCircle2, Clock, ArrowLeft, Key, Trash2, Code2, ExternalLink } from "lucide-react";
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

function useCountdownParts(expiresAt: string | null) {
  const [parts, setParts] = useState({ h: 0, m: 0, s: 0, expired: false });
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setParts({ h: 0, m: 0, s: 0, expired: true }); return; }
      setParts({
        h: Math.floor(diff / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
        expired: false,
      });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  return parts;
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
  const network = "bep20" as const;
  const [deposit, setDeposit] = useState<DepositInfo | null>(null);
  const [checkResult, setCheckResult] = useState<{ status: string; message?: string; balanceCents?: number } | null>(null);
  const [txHashInput, setTxHashInput] = useState("");
  const [checking, setChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownParts = useCountdownParts(deposit?.expiresAt ?? null);
  const { copied: amountCopied, copy: copyAmount } = useCopied();
  const { copied: addrCopied, copy: copyAddr } = useCopied();

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const reset = () => {
    stopPolling(); setStep(1); setAmountUsd(""); setDeposit(null); setCheckResult(null); setTxHashInput("");
  };
  const handleClose = () => { reset(); onClose(); };

  const createDeposit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/deposit/create", { amountUsd, network });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) { setDeposit(data.deposit); setStep(2); }
      else toast({ title: "Error", description: data.message, variant: "destructive" });
    },
    onError: () => toast({ title: "Error", description: "Could not create deposit.", variant: "destructive" }),
  });

  const doCheck = async (depositId: number, txHash?: string): Promise<boolean> => {
    try {
      const body: Record<string, string> = {};
      if (txHash) body.txHash = txHash;
      const res = await apiRequest("POST", `/api/deposit/check/${depositId}`, body);
      const data = await res.json();
      setCheckResult(data);
      if (data.status === "completed") {
        stopPolling(); setStep(3);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/me/deposits"] });
        return true;
      } else if (data.status === "expired") {
        stopPolling();
        toast({ title: "Expired", description: data.message, variant: "destructive" });
        handleClose();
      }
      return false;
    } catch {
      return false;
    }
  };

  const manualCheck = async () => {
    if (!deposit || checking) return;
    setChecking(true);
    await doCheck(deposit.id, txHashInput.trim() || undefined);
    setChecking(false);
  };

  // Auto-poll every 15s as soon as the deposit is created
  useEffect(() => {
    if (!deposit) return;
    // Immediate first check
    doCheck(deposit.id);
    pollRef.current = setInterval(() => doCheck(deposit.id), 15_000);
    return stopPolling;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deposit?.id]);

  useEffect(() => { return () => { stopPolling(); }; }, []);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden">

        {/* Step 1 — Amount */}
        {step === 1 && (
          <div className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Top Up Balance</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Send USDT via BSC to your account</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Amount (USD)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold">$</span>
                <Input
                  type="number" min="1" step="1" placeholder="10.00"
                  value={amountUsd}
                  onChange={(e) => setAmountUsd(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && parseFloat(amountUsd) >= 1 && createDeposit.mutate()}
                  className="pl-8 h-12 text-lg font-semibold"
                  data-testid="input-topup-amount"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#F0B90B]/30 bg-[#F0B90B]/5">
              <div className="w-9 h-9 rounded-full bg-[#F0B90B] flex items-center justify-center shrink-0 text-black font-black text-sm">B</div>
              <div>
                <div className="text-sm font-bold text-foreground">BEP-20 · USDT</div>
                <div className="text-xs text-muted-foreground">Binance Smart Chain</div>
              </div>
              <div className="ml-auto text-xs font-medium text-[#F0B90B] bg-[#F0B90B]/10 px-2 py-0.5 rounded-full">Only network</div>
            </div>
            <Button
              className="w-full h-11 text-base font-bold"
              disabled={!amountUsd || parseFloat(amountUsd) < 1 || createDeposit.isPending}
              onClick={() => createDeposit.mutate()}
              data-testid="button-create-deposit"
            >
              {createDeposit.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Proceed to Payment
            </Button>
          </div>
        )}

        {/* Step 2 — Payment */}
        {step === 2 && deposit && (
          <div>
            {/* Header bar */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-muted/30">
              <button onClick={() => { reset(); setStep(1); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Send Payment</span>
              <span className="text-xs text-muted-foreground">BSC</span>
            </div>

            <div className="p-5 space-y-4">
              {/* Big amount */}
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Send exactly</p>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-4xl font-black text-foreground tracking-tight">{deposit.amountUsdt}</span>
                  <span className="text-base font-semibold text-muted-foreground">USDT</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">≈ ${(deposit.amountCents / 100).toFixed(2)} USD</p>
                <button
                  onClick={() => copyAmount(deposit.amountUsdt)}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                  data-testid="button-copy-amount"
                >
                  {amountCopied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
                  {amountCopied ? "Copied!" : "Copy amount"}
                </button>
              </div>

              {/* Countdown blocks */}
              <div className="flex items-center justify-center gap-2">
                {[
                  { val: countdownParts.h, label: "HR" },
                  { val: countdownParts.m, label: "MIN" },
                  { val: countdownParts.s, label: "SEC" },
                ].map(({ val, label }, i) => (
                  <div key={label}>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-center">
                        <div className="w-14 h-12 rounded-lg bg-muted/60 border border-border flex items-center justify-center">
                          <span className="text-xl font-black text-foreground font-mono">{String(val).padStart(2, "0")}</span>
                        </div>
                        <span className="text-[9px] font-bold text-muted-foreground mt-1 tracking-widest">{label}</span>
                      </div>
                      {i < 2 && <span className="text-lg font-black text-muted-foreground mb-3">:</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* QR code */}
              <div className="flex justify-center">
                <div className="p-3 bg-white rounded-2xl border border-border shadow-sm">
                  <QRCodeSVG value={deposit.walletAddress} size={130} />
                </div>
              </div>

              {/* Address */}
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Send to address</p>
                <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-muted/20">
                  <code className="text-xs font-mono text-foreground flex-1 break-all leading-relaxed">{deposit.walletAddress}</code>
                  <button
                    onClick={() => copyAddr(deposit.walletAddress)}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors"
                    data-testid="button-copy-address"
                  >
                    {addrCopied ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                  </button>
                </div>
              </div>

              {/* Warning */}
              <div className="flex gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                  Send the <strong>exact amount</strong> shown above. A different amount will not be detected automatically.
                </p>
              </div>

              {/* Auto-watch status */}
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
                  </span>
                  <span className="text-xs font-medium text-primary">Watching for payment…</span>
                </div>
                <button
                  onClick={manualCheck}
                  disabled={checking}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 flex items-center gap-1"
                  data-testid="button-check-now"
                >
                  {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Check now
                </button>
              </div>

              {/* Optional TX hash for faster detection */}
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1.5">
                  Have a TX hash? <span className="font-normal normal-case text-muted-foreground/70">(optional — paste for instant verify)</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    value={txHashInput}
                    onChange={(e) => setTxHashInput(e.target.value)}
                    placeholder="0xabc123…"
                    className="font-mono text-xs h-9"
                    data-testid="input-tx-hash"
                  />
                  {txHashInput.trim() && (
                    <button
                      onClick={manualCheck}
                      disabled={checking}
                      className="shrink-0 px-3 h-9 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
                    >
                      {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : "Verify"}
                    </button>
                  )}
                </div>
              </div>

              <button onClick={handleClose} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Success */}
        {step === 3 && checkResult && (
          <div className="p-6 text-center space-y-4">
            <div className="flex justify-center pt-2">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-primary" />
              </div>
            </div>
            <div>
              <p className="text-xl font-black text-foreground">Payment Received!</p>
              <p className="text-sm text-muted-foreground mt-1">
                ${(deposit!.amountCents / 100).toFixed(2)} has been credited to your balance.
              </p>
              {checkResult.balanceCents !== null && checkResult.balanceCents !== undefined && (
                <div className="mt-3 py-2 px-4 rounded-xl bg-primary/5 border border-primary/20 inline-block">
                  <p className="text-2xl font-black text-primary">${(checkResult.balanceCents / 100).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">new balance</p>
                </div>
              )}
            </div>
            <Button className="w-full h-11" onClick={handleClose} data-testid="button-deposit-done">
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
                  {!order.orderNumber.startsWith("C-") && (
                    <a
                      href={`/?key=${encodeURIComponent(key)}`}
                      className="flex items-center gap-1 px-2 py-1 rounded border border-primary/40 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/10 transition-colors"
                      data-testid={`button-redeem-key-${order.id}-${idx}`}
                    >
                      <Zap className="w-3 h-3" />
                      Redeem
                    </a>
                  )}
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

interface ApiKeyRow {
  id: number;
  name: string;
  keyPrefix: string;
  active: number;
  lastUsedAt: string | null;
  createdAt: string;
}

function CreateApiKeyDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (key: string) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/me/api-keys", { name });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/me/api-keys"] });
        onClose();
        setName("");
        onCreated(data.key);
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not create API key.", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setName(""); } }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create API Key</DialogTitle>
          <DialogDescription className="text-xs">Give your key a name so you can identify it later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Key name</label>
            <Input
              placeholder="e.g. My Bot, Production, Test"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && create.mutate()}
              data-testid="input-apikey-name"
            />
          </div>
          <Button
            className="w-full"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
            data-testid="button-create-apikey"
          >
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Generate Key
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewKeyRevealDialog({ apiKey, onClose }: { apiKey: string | null; onClose: () => void }) {
  const { copied, copy } = useCopied(3000);
  return (
    <Dialog open={!!apiKey} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            API Key Created
          </DialogTitle>
          <DialogDescription className="text-xs text-amber-500 dark:text-amber-400 font-medium">
            Copy this key now. You will not be able to see it again.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 font-mono text-xs break-all text-foreground" data-testid="text-new-apikey">
            {apiKey}
          </div>
          <Button
            className="w-full gap-2"
            onClick={() => copy(apiKey!)}
            data-testid="button-copy-new-apikey"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied!" : "Copy API Key"}
          </Button>
          <button
            onClick={onClose}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
            data-testid="button-close-apikey-reveal"
          >
            I've saved it, close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ApiKeysSection({ userId }: { userId: number }) {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

  const { data, isLoading } = useQuery<{ success: boolean; data: ApiKeyRow[] }>({
    queryKey: ["/api/me/api-keys"],
    enabled: !!userId,
  });

  const revoke = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/me/api-keys/${id}`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/me/api-keys"] });
        setRevokeTarget(null);
        toast({ title: "Key revoked", description: "The API key has been deactivated." });
      } else {
        toast({ title: "Error", description: data.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not revoke key.", variant: "destructive" }),
  });

  const keys = data?.data ?? [];

  return (
    <div>
      <CreateApiKeyDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(k) => setNewKey(k)} />
      <NewKeyRevealDialog apiKey={newKey} onClose={() => setNewKey(null)} />

      {/* Revoke confirm dialog */}
      <Dialog open={!!revokeTarget} onOpenChange={(v) => { if (!v) setRevokeTarget(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription>Are you sure you want to revoke <span className="font-semibold text-foreground">"{revokeTarget?.name}"</span>? Any app using this key will stop working immediately.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => revokeTarget && revoke.mutate(revokeTarget.id)}
              disabled={revoke.isPending}
              data-testid="button-confirm-revoke-apikey"
            >
              {revoke.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Revoke Key
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">API Keys</h2>
        </div>
        <div className="flex items-center gap-2">
          <a href="/developers" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" data-testid="link-api-docs">
            <ExternalLink className="w-3 h-3" />
            Docs
          </a>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 h-8 text-xs" data-testid="button-new-apikey">
            <Plus className="w-3.5 h-3.5" />
            New Key
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : keys.length === 0 ? (
        <Card className="border border-card-border">
          <CardContent className="p-6 text-center">
            <Key className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-medium">No API keys yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">Generate a key to access the public API</p>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} data-testid="button-create-first-apikey">Create API Key</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/10" data-testid={`row-apikey-${k.id}`}>
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <Key className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{k.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{k.keyPrefix}••••••••••••••••••••••••••</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Created {new Date(k.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {k.lastUsedAt && <span className="ml-2 opacity-70">· Last used {new Date(k.lastUsedAt).toLocaleDateString("en-GB")}</span>}
                </div>
              </div>
              <button
                onClick={() => setRevokeTarget(k)}
                className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                title="Revoke key"
                data-testid={`button-revoke-apikey-${k.id}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
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

      <div className="max-w-2xl mx-auto space-y-5">
        {/* Page title */}
        <div className="pt-2">
          <h1 className="text-2xl font-black text-foreground">My Account</h1>
          <p className="text-muted-foreground text-xs mt-0.5">Manage your balance and view orders</p>
        </div>

        {/* Balance card */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Balance</p>
                  <p className="text-xs text-muted-foreground">Your account balance for purchases</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-primary" data-testid="text-balance">
                  ${(user.balanceCents / 100).toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-border">
            <button
              onClick={() => setTopUpOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 text-sm font-bold text-primary hover:bg-primary/5 transition-colors"
              data-testid="button-topup-crypto"
            >
              <Plus className="w-4 h-4" />
              Top Up Balance
            </button>
          </div>

          <div className="border-t border-border px-5 py-3 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-[#25D366] hover:opacity-80 transition-opacity shrink-0 ml-4"
              data-testid="button-topup-whatsapp"
            >
              <SiWhatsapp className="w-3.5 h-3.5" />
              WhatsApp
            </a>
          </div>
        </div>

        {/* API Keys */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <ApiKeysSection userId={user.id} />
          </div>
        </div>

        {/* Orders */}
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Order History</p>
          {ordersLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <Package className="w-9 h-9 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground">No orders yet</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Head to the Shop to buy your first CDK keys</p>
              <a href="/shop">
                <Button size="sm" variant="outline">Go to Shop</Button>
              </a>
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
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
