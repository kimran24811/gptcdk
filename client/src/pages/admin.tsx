import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Users, Package, DollarSign, Plus, Copy, Check, Settings, ArrowDownToLine, Key, Trash2, Search, Minus, ShoppingBag, AlertTriangle, RotateCcw, Archive, CalendarDays, User, Tag, Clock, ArrowUpCircle, ArrowDownCircle, Wallet, CreditCard, ChevronDown, ChevronUp, Upload, Bell, Store, Pencil, Eye, EyeOff, ExternalLink } from "lucide-react";

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

function CopyBtn({ text }: { text: string }) {
  const { copied, copy } = useCopied();
  return (
    <button
      onClick={() => copy(text)}
      className={`flex items-center gap-1 px-2 py-1 rounded border text-xs transition-all shrink-0 ${
        copied
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

interface Customer {
  id: number;
  email: string;
  name: string;
  role: string;
  balanceCents: number;
  createdAt: string;
}

interface AdminOrder {
  id: number;
  orderNumber: string;
  product: string;
  subscription: string;
  quantity: number;
  amountCents: number;
  status: string;
  createdAt: string;
  userId: number;
  userEmail: string;
  userName: string;
}

interface AdminDeposit {
  id: number;
  amountUsdt: string;
  amountCents: number;
  network: string;
  status: string;
  txHash: string | null;
  createdAt: string;
  expiresAt: string;
  userId: number;
  userEmail: string;
  userName: string;
}

function BalanceDialog({
  customer,
  mode,
  onClose,
}: {
  customer: Customer | null;
  mode: "credit" | "debit";
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const endpoint = mode === "credit" ? "credit" : "debit";
      const res = await apiRequest("POST", `/api/admin/customers/${customer!.id}/${endpoint}`, {
        amountUsd: amount,
        description: description.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        const verb = mode === "credit" ? "added to" : "deducted from";
        toast({ title: mode === "credit" ? "Balance added" : "Balance reduced", description: `$${parseFloat(amount).toFixed(2)} ${verb} ${customer!.email}` });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
        onClose();
        setAmount("");
        setDescription("");
      } else {
        toast({ title: "Failed", description: data.message, variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Could not update balance.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={!!customer} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "credit" ? "Add Balance" : "Reduce Balance"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="text-sm text-muted-foreground">
            {mode === "credit" ? "Adding to" : "Deducting from"}:{" "}
            <span className="font-medium text-foreground">{customer?.email}</span>
          </div>
          <div className="text-xs text-muted-foreground bg-muted/40 rounded px-3 py-2">
            Current balance: <span className="font-semibold text-foreground">${((customer?.balanceCents ?? 0) / 100).toFixed(2)}</span>
          </div>

          {mode === "credit" && (
            <div className="rounded-lg border border-border bg-muted/20 divide-y divide-border">
              <div className="px-3 py-2">
                <p className="text-xs font-semibold text-muted-foreground">Your Binance Pay (receive USDT here)</p>
              </div>
              <div className="flex items-center justify-between px-3 py-2 gap-2">
                <div><div className="text-xs text-muted-foreground">Pay ID</div><div className="font-mono font-bold text-foreground text-sm">{BINANCE_PAY_ID}</div></div>
                <CopyBtn text={BINANCE_PAY_ID} />
              </div>
              <div className="flex items-center justify-between px-3 py-2 gap-2">
                <div><div className="text-xs text-muted-foreground">WhatsApp</div><div className="font-mono font-semibold text-foreground text-sm">{WHATSAPP}</div></div>
                <CopyBtn text={WHATSAPP} />
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">
              Amount (USD)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number" min="0.01" step="0.01" placeholder="0.00"
                value={amount} onChange={(e) => setAmount(e.target.value)}
                className="pl-7" data-testid="input-balance-amount"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Description (optional)</label>
            <Input
              placeholder={mode === "credit" ? "e.g. Binance Pay top-up" : "e.g. Refund adjustment"}
              value={description} onChange={(e) => setDescription(e.target.value)}
              data-testid="input-balance-description"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={mutation.isPending}>Cancel</Button>
            <Button
              className={`flex-1 ${mode === "debit" ? "bg-red-600 hover:bg-red-700 text-white" : ""}`}
              disabled={!amount || parseFloat(amount) <= 0 || mutation.isPending}
              onClick={() => mutation.mutate()}
              data-testid="button-submit-balance"
            >
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {mode === "credit" ? "Add Balance" : "Reduce Balance"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface HistoryTransaction {
  id: number;
  amountCents: number;
  type: "credit" | "debit";
  description: string;
  createdAt: string;
}
interface HistoryOrder {
  id: number;
  orderNumber: string;
  subscription: string;
  quantity: number;
  amountCents: number;
  keys: string[];
  status: string;
  createdAt: string;
}
interface HistoryDeposit {
  id: number;
  amountUsdt: string;
  amountCents: number;
  network: string;
  status: string;
  txHash: string | null;
  createdAt: string;
}

type TimelineEvent =
  | { kind: "credit"; date: string; amountCents: number; description: string; id: string }
  | { kind: "debit"; date: string; amountCents: number; description: string; id: string }
  | { kind: "order"; date: string; amountCents: number; subscription: string; quantity: number; orderNumber: string; keys: string[]; status: string; id: string }
  | { kind: "deposit"; date: string; amountCents: number; amountUsdt: string; network: string; status: string; txHash: string | null; id: string };

function fmt(date: string) {
  return new Date(date).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function OrderEvent({ ev }: { ev: Extract<TimelineEvent, { kind: "order" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-3 items-start">
      <div className="mt-0.5 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
        <CreditCard className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-foreground">{ev.subscription}</div>
            <div className="text-xs text-muted-foreground">
              {ev.quantity} key{ev.quantity !== 1 ? "s" : ""} · #{ev.orderNumber}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-bold text-red-500 dark:text-red-400">−${(ev.amountCents / 100).toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">{fmt(ev.date)}</div>
          </div>
        </div>
        {ev.keys?.length > 0 && (
          <button
            onClick={() => setOpen(!open)}
            className="mt-1.5 flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {open ? "Hide" : "Show"} {ev.keys.length} key{ev.keys.length !== 1 ? "s" : ""}
          </button>
        )}
        {open && ev.keys.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {ev.keys.map((k, i) => (
              <div key={i} className="flex items-center gap-2">
                <code className="text-xs font-mono bg-muted/50 border border-border rounded px-2 py-0.5 flex-1 truncate" data-testid={`text-hist-key-${ev.id}-${i}`}>{k}</code>
                <CopyBtn text={k} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CustomerHistoryDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ success: boolean; transactions: HistoryTransaction[]; orders: HistoryOrder[]; deposits: HistoryDeposit[] }>({
    queryKey: ["/api/admin/customers", customer?.id, "history"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/customers/${customer!.id}/history`, { credentials: "include" });
      return res.json();
    },
    enabled: !!customer,
  });

  const events: TimelineEvent[] = [];
  if (data?.success) {
    for (const d of data.deposits) {
      events.push({ kind: "deposit", id: `dep-${d.id}`, date: d.createdAt, amountCents: d.amountCents, amountUsdt: d.amountUsdt, network: d.network, status: d.status, txHash: d.txHash });
    }
    for (const o of data.orders) {
      events.push({ kind: "order", id: `ord-${o.id}`, date: o.createdAt, amountCents: o.amountCents, subscription: o.subscription, quantity: o.quantity, orderNumber: o.orderNumber, keys: o.keys, status: o.status });
    }
    for (const t of data.transactions) {
      if (t.type === "debit" && t.description.includes("— Order #")) continue;
      events.push({ kind: t.type, id: `tx-${t.id}`, date: t.createdAt, amountCents: Math.abs(t.amountCents), description: t.description });
    }
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  return (
    <Dialog open={!!customer} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Account History
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground pb-1 border-b border-border">
          <span className="font-medium text-foreground">{customer?.name}</span> · {customer?.email}
        </div>
        <div className="overflow-y-auto flex-1 py-2 pr-0.5">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : events.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((ev) => {
                if (ev.kind === "order") {
                  return <OrderEvent key={ev.id} ev={ev} />;
                }
                if (ev.kind === "credit") {
                  return (
                    <div key={ev.id} className="flex gap-3 items-start">
                      <div className="mt-0.5 w-8 h-8 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                        <ArrowUpCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-foreground">Balance Added</div>
                            <div className="text-xs text-muted-foreground">{ev.description}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-green-600 dark:text-green-400">+${(ev.amountCents / 100).toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">{fmt(ev.date)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                if (ev.kind === "debit") {
                  return (
                    <div key={ev.id} className="flex gap-3 items-start">
                      <div className="mt-0.5 w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                        <ArrowDownCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-foreground">Balance Deducted</div>
                            <div className="text-xs text-muted-foreground">{ev.description}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-amber-600 dark:text-amber-400">−${(ev.amountCents / 100).toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">{fmt(ev.date)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                if (ev.kind === "deposit") {
                  const statusCls = ev.status === "completed"
                    ? "text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/20"
                    : ev.status === "expired"
                    ? "text-muted-foreground bg-muted/50 border-border"
                    : "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20";
                  return (
                    <div key={ev.id} className="flex gap-3 items-start">
                      <div className="mt-0.5 w-8 h-8 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                        <Wallet className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">Deposit Request</span>
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${statusCls}`}>{ev.status}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {ev.network.toUpperCase()} · {ev.amountUsdt} USDT
                              {ev.txHash && ev.txHash !== "manual-admin-approval" && (
                                <span className="ml-1 font-mono">· {ev.txHash.slice(0, 12)}…</span>
                              )}
                              {ev.txHash === "manual-admin-approval" && <span className="ml-1">· manually approved</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-foreground">${(ev.amountCents / 100).toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">{fmt(ev.date)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCustomerDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { toast } = useToast();
  const del = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/customers/${customer!.id}`, {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Customer deleted" });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
        onClose();
      } else {
        toast({ title: "Failed", description: data.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not delete customer.", variant: "destructive" }),
  });

  return (
    <Dialog open={!!customer} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-500"><AlertTriangle className="w-4 h-4" /> Delete Customer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">
            This will permanently delete <span className="font-medium text-foreground">{customer?.email}</span> and all their data. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={del.isPending}>Cancel</Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              onClick={() => del.mutate()}
              disabled={del.isPending}
              data-testid="button-confirm-delete-customer"
            >
              {del.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsTab({ user }: { user: { id: number; name: string; email: string } }) {
  const { toast } = useToast();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const update = useMutation({
    mutationFn: async (payload: object) => {
      const res = await apiRequest("PATCH", "/api/auth/profile", payload);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Settings saved", description: "Your account has been updated." });
        queryClient.setQueryData(["/api/auth/me"], { user: data.user });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        toast({ title: "Update failed", description: data.message, variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Could not update settings.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "New password and confirmation must match.", variant: "destructive" });
      return;
    }
    const payload: Record<string, string> = { name, email };
    if (newPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }
    update.mutate(payload);
  };

  return (
    <div className="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Card className="border border-card-border">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Account Details</h3>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" data-testid="input-settings-name" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" data-testid="input-settings-email" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-card-border">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Change Password</h3>
            <p className="text-xs text-muted-foreground">Leave blank if you don't want to change your password.</p>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Current password</label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" data-testid="input-settings-current-password" autoComplete="current-password" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">New password</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" data-testid="input-settings-new-password" autoComplete="new-password" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Confirm new password</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat new password" data-testid="input-settings-confirm-password" autoComplete="new-password" />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={!name.trim() || !email.trim() || update.isPending} data-testid="button-save-settings">
          {update.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {update.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </div>
  );
}

function statusColor(status: string) {
  if (status === "completed") return "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20";
  if (status === "expired") return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20";
  return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20";
}

function DepositsTab() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ success: boolean; data: AdminDeposit[] }>({
    queryKey: ["/api/admin/deposits"],
  });
  const deposits = data?.data ?? [];

  const approve = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/deposits/${id}/approve`, {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Deposit approved", description: "Balance has been credited to the user." });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/deposits"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
      } else {
        toast({ title: "Failed", description: data.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not approve deposit.", variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  if (deposits.length === 0) {
    return (
      <Card className="border border-card-border">
        <CardContent className="p-8 text-center">
          <ArrowDownToLine className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No deposit requests yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {deposits.map((d) => (
        <Card key={d.id} className="border border-card-border" data-testid={`row-deposit-${d.id}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-semibold text-foreground text-sm">{d.userName}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground truncate">{d.userEmail}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor(d.status)}`}>
                    {d.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{d.network.toUpperCase()} · {d.amountUsdt} USDT</span>
                </div>
                {d.txHash && d.txHash !== "manual-admin-approval" && (
                  <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                    TX: {d.txHash.slice(0, 20)}...
                  </div>
                )}
                {d.txHash === "manual-admin-approval" && (
                  <div className="text-xs text-green-600 dark:text-green-400 mt-0.5">Manually approved</div>
                )}
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(d.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="text-right">
                  <div className="font-bold text-foreground">${(d.amountCents / 100).toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">face value</div>
                </div>
                {d.status === "pending" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1 border-green-500/40 text-green-600 dark:text-green-400 hover:bg-green-500/10"
                    onClick={() => approve.mutate(d.id)}
                    disabled={approve.isPending}
                    data-testid={`button-approve-deposit-${d.id}`}
                  >
                    {approve.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Approve
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const PLAN_LABELS: Record<string, string> = {
  "plus-1m":  "ChatGPT Plus 1 Month",
  "plus-1y":  "ChatGPT Plus 1 Year",
  "go-1y":    "ChatGPT GO 1 Year",
  "pro-1m":   "ChatGPT Pro 1 Month",
};

interface InventoryKey {
  id: number;
  plan: string;
  key: string;
  status: string;
  soldTo: number | null;
  soldToEmail: string | null;
  soldToName: string | null;
  soldAt: string | null;
  createdAt: string;
}

interface InventorySummaryRow { plan: string; status: string; cnt: string; }

interface DeletedKey {
  id: number;
  plan: string;
  key: string;
  deletedAt: string | null;
  createdAt: string;
}

interface KeySearchResult {
  id: number;
  plan: string;
  key: string;
  status: string;
  addedBy: number;
  soldTo: number | null;
  soldToEmail: string | null;
  soldToName: string | null;
  soldAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

function KeyInventoryTab() {
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState("plus-1m");
  const [keysText, setKeysText] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showTrash, setShowTrash] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<null | { found: true; key: KeySearchResult } | { found: false; message: string }>(null);

  const { data, isLoading, refetch } = useQuery<{ success: boolean; data: InventoryKey[]; summary: InventorySummaryRow[] }>({
    queryKey: ["/api/admin/inventory", filterPlan, filterStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterPlan !== "all") params.set("plan", filterPlan);
      if (filterStatus !== "all") params.set("status", filterStatus);
      const res = await fetch(`/api/admin/inventory?${params}`, { credentials: "include" });
      return res.json();
    },
  });

  const keys = data?.data ?? [];
  const summary = data?.summary ?? [];

  const planSummary = (plan: string) => {
    const available = summary.find((s) => s.plan === plan && s.status === "available");
    const sold = summary.find((s) => s.plan === plan && s.status === "sold");
    return { available: parseInt(available?.cnt ?? "0"), sold: parseInt(sold?.cnt ?? "0") };
  };

  const addKeys = useMutation({
    mutationFn: async () => {
      const parsed = keysText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      const res = await apiRequest("POST", "/api/admin/inventory", { plan: selectedPlan, keys: parsed });
      return res.json();
    },
    onSuccess: (d) => {
      if (d.success) {
        toast({ title: "Keys added", description: `${d.added} key${d.added !== 1 ? "s" : ""} added to ${PLAN_LABELS[selectedPlan]}` });
        setKeysText("");
        refetch();
      } else {
        toast({ title: "Failed", description: d.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not add keys.", variant: "destructive" }),
  });

  const deleteKey = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/inventory/${id}`, {});
      return res.json();
    },
    onSuccess: (d) => {
      if (d.success) {
        toast({ title: "Key moved to trash" });
        refetch();
      } else {
        toast({ title: "Failed", description: d.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not delete key.", variant: "destructive" }),
  });

  const { data: trashData, isLoading: trashLoading, refetch: refetchTrash } = useQuery<{ success: boolean; keys: DeletedKey[] }>({
    queryKey: ["/api/admin/inventory/deleted"],
    queryFn: async () => {
      const res = await fetch("/api/admin/inventory/deleted", { credentials: "include" });
      return res.json();
    },
    enabled: showTrash,
  });

  const restoreKey = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/inventory/${id}/restore`, {});
      return res.json();
    },
    onSuccess: (d) => {
      if (d.success) {
        toast({ title: "Key restored" });
        refetch();
        refetchTrash();
      } else {
        toast({ title: "Failed", description: d.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not restore key.", variant: "destructive" }),
  });

  const permanentDeleteKey = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/inventory/${id}/permanent`, {});
      return res.json();
    },
    onSuccess: (d) => {
      if (d.success) {
        toast({ title: "Key permanently deleted" });
        refetchTrash();
      } else {
        toast({ title: "Failed", description: d.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not permanently delete key.", variant: "destructive" }),
  });

  const searchKey = useMutation({
    mutationFn: async (q: string) => {
      const res = await fetch(`/api/admin/inventory/search?key=${encodeURIComponent(q)}`, { credentials: "include" });
      return res.json();
    },
    onSuccess: (d) => {
      if (d.success) {
        setSearchResult({ found: true, key: d.key });
      } else {
        setSearchResult({ found: false, message: d.message || "Key not found." });
      }
    },
    onError: () => setSearchResult({ found: false, message: "Search failed. Please try again." }),
  });

  const lineCount = keysText.split("\n").filter((l) => l.trim()).length;
  const trashKeys = trashData?.keys ?? [];

  return (
    <div className="space-y-5">
      {/* Trash / Deleted Keys dialog */}
      <Dialog open={showTrash} onOpenChange={setShowTrash}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-muted-foreground" />
              Deleted Keys
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-2 pr-0.5">
            {trashLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : trashKeys.length === 0 ? (
              <div className="text-center py-10">
                <Archive className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Trash is empty</p>
              </div>
            ) : trashKeys.map((k) => (
              <div key={k.id} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/20" data-testid={`trash-key-${k.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground mb-0.5">{PLAN_LABELS[k.plan] ?? k.plan}</div>
                  <div className="font-mono text-xs text-foreground truncate">
                    {k.key.length > 36 ? `${k.key.slice(0, 18)}…${k.key.slice(-10)}` : k.key}
                  </div>
                  {k.deletedAt && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Deleted {new Date(k.deletedAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => restoreKey.mutate(k.id)}
                    disabled={restoreKey.isPending}
                    title="Restore key"
                    className="flex items-center gap-1 px-2 py-1 rounded border border-border bg-background text-muted-foreground hover:text-primary hover:border-primary/40 text-xs transition-all"
                    data-testid={`button-restore-key-${k.id}`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restore
                  </button>
                  <button
                    onClick={() => permanentDeleteKey.mutate(k.id)}
                    disabled={permanentDeleteKey.isPending}
                    title="Permanently delete"
                    className="flex items-center gap-1 px-2 py-1 rounded border border-border bg-background text-muted-foreground hover:text-red-500 hover:border-red-500/40 text-xs transition-all"
                    data-testid={`button-perm-delete-key-${k.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Key Search dialog */}
      <Dialog open={showSearch} onOpenChange={(v) => { setShowSearch(v); if (!v) { setSearchQuery(""); setSearchResult(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              Key Lookup
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="flex gap-2">
              <Input
                placeholder="Paste or type the key…"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchResult(null); }}
                className="font-mono text-xs flex-1"
                onKeyDown={(e) => { if (e.key === "Enter" && searchQuery.trim()) searchKey.mutate(searchQuery.trim()); }}
                data-testid="input-key-search"
                autoFocus
              />
              <Button
                onClick={() => searchKey.mutate(searchQuery.trim())}
                disabled={!searchQuery.trim() || searchKey.isPending}
                data-testid="button-key-search"
              >
                {searchKey.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {searchResult && !searchResult.found && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {searchResult.message}
              </div>
            )}

            {searchResult && searchResult.found && (() => {
              const k = searchResult.key;
              const statusColor =
                k.status === "available" ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" :
                k.status === "sold" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" :
                "bg-red-500/10 text-red-500 border-red-500/20";
              return (
                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                  {/* Key value */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Key</p>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm text-foreground flex-1 break-all">{k.key}</code>
                    </div>
                  </div>

                  <div className="border-t border-border" />

                  {/* Status + Plan */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide flex items-center gap-1"><Tag className="w-3 h-3" />Status</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusColor}`}>
                        {k.status.charAt(0).toUpperCase() + k.status.slice(1)}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide flex items-center gap-1"><Key className="w-3 h-3" />Plan</p>
                      <p className="text-sm font-medium text-foreground">{PLAN_LABELS[k.plan] ?? k.plan}</p>
                    </div>
                  </div>

                  <div className="border-t border-border" />

                  {/* Timestamps */}
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Added to inventory</p>
                        <p className="text-sm text-foreground font-medium">{new Date(k.createdAt).toLocaleString()}</p>
                      </div>
                    </div>

                    {k.soldAt && (
                      <div className="flex items-start gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Sold at</p>
                          <p className="text-sm text-foreground font-medium">{new Date(k.soldAt).toLocaleString()}</p>
                        </div>
                      </div>
                    )}

                    {(k.soldToName || k.soldToEmail) && (
                      <div className="flex items-start gap-2">
                        <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Sold to</p>
                          {k.soldToName && <p className="text-sm text-foreground font-medium">{k.soldToName}</p>}
                          {k.soldToEmail && <p className="text-xs text-muted-foreground">{k.soldToEmail}</p>}
                        </div>
                      </div>
                    )}

                    {k.deletedAt && (
                      <div className="flex items-start gap-2">
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">Deleted at</p>
                          <p className="text-sm text-foreground font-medium">{new Date(k.deletedAt).toLocaleString()}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(PLAN_LABELS).map(([planId, label]) => {
          const { available, sold } = planSummary(planId);
          return (
            <Card key={planId} className="border border-card-border">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground font-medium mb-1 truncate">{label}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-foreground" data-testid={`stat-inventory-available-${planId}`}>{available}</span>
                  <span className="text-xs text-muted-foreground">avail</span>
                </div>
                <div className="text-xs text-muted-foreground">{sold} sold</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add keys form */}
      <Card className="border border-card-border">
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Add Keys to Inventory</h3>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Plan</label>
            <Select value={selectedPlan} onValueChange={setSelectedPlan}>
              <SelectTrigger data-testid="select-inventory-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLAN_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">
              Keys <span className="text-muted-foreground font-normal">(one per line)</span>
            </label>
            <Textarea
              value={keysText}
              onChange={(e) => setKeysText(e.target.value)}
              placeholder={"XXXX-XXXX-XXXX-XXXX\nXXXX-XXXX-XXXX-XXXX\n..."}
              className="font-mono text-xs min-h-[120px] resize-y"
              data-testid="textarea-inventory-keys"
            />
            {lineCount > 0 && <p className="text-xs text-muted-foreground mt-1">{lineCount} key{lineCount !== 1 ? "s" : ""} detected</p>}
          </div>
          <Button
            onClick={() => addKeys.mutate()}
            disabled={addKeys.isPending || !keysText.trim()}
            className="w-full gap-1.5"
            data-testid="button-add-keys"
          >
            {addKeys.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {addKeys.isPending ? "Adding…" : `Add ${lineCount > 0 ? lineCount : ""} Keys`}
          </Button>
        </CardContent>
      </Card>

      {/* Keys list */}
      <div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h3 className="text-sm font-semibold text-foreground flex-1">Key List</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setShowSearch(true); setSearchResult(null); setSearchQuery(""); }}
            className="gap-1.5 h-8 text-xs text-muted-foreground"
            data-testid="button-open-key-search"
          >
            <Search className="w-3.5 h-3.5" />
            Search Key
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTrash(true)}
            className="gap-1.5 h-8 text-xs text-muted-foreground"
            data-testid="button-view-trash"
          >
            <Archive className="w-3.5 h-3.5" />
            Deleted Keys
          </Button>
          <Select value={filterPlan} onValueChange={setFilterPlan}>
            <SelectTrigger className="w-40 h-8 text-xs" data-testid="select-filter-plan">
              <SelectValue placeholder="All plans" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All plans</SelectItem>
              {Object.entries(PLAN_LABELS).map(([id, label]) => (
                <SelectItem key={id} value={id}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-28 h-8 text-xs" data-testid="select-filter-status">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="sold">Sold</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {keys.length === 200 && (
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Showing first 200 keys. Use the plan or status filter to narrow results and find specific keys.
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : keys.length === 0 ? (
          <Card className="border border-card-border">
            <CardContent className="p-8 text-center">
              <Key className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No keys in inventory</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {keys.map((k) => (
              <Card key={k.id} className="border border-card-border" data-testid={`row-key-${k.id}`}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${
                        k.status === "available"
                          ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                          : "bg-muted text-muted-foreground border-border"
                      }`}>{k.status}</span>
                      <span className="text-xs text-muted-foreground">{PLAN_LABELS[k.plan] ?? k.plan}</span>
                    </div>
                    <div className="font-mono text-xs text-foreground truncate" data-testid={`text-key-${k.id}`}>
                      {k.key.length > 40 ? `${k.key.slice(0, 20)}…${k.key.slice(-10)}` : k.key}
                    </div>
                    {k.soldAt && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Sold {new Date(k.soldAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        {k.soldToEmail && (
                          <span className="ml-1">· <span className="font-medium" data-testid={`text-soldto-${k.id}`}>{k.soldToName ?? k.soldToEmail}</span></span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <CopyBtn text={k.key} />
                    {k.status === "available" && (
                      <button
                        onClick={() => deleteKey.mutate(k.id)}
                        disabled={deleteKey.isPending}
                        className="flex items-center gap-1 px-2 py-1 rounded border border-border bg-background text-muted-foreground hover:text-red-500 hover:border-red-500/40 text-xs transition-all"
                        data-testid={`button-delete-key-${k.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Types for custom products ────────────────────────────────────────────────
interface AdminProduct {
  id: number;
  name: string;
  description: string;
  priceCents: number;
  logoData: string | null;
  active: number;
  createdAt: string;
  stock: { available: number; sold: number };
}
interface ProductVoucher {
  id: number;
  code: string;
  status: string;
  soldTo: number | null;
  soldAt: string | null;
  createdAt: string;
  soldToEmail: string | null;
  soldToName: string | null;
}
interface AnnouncementCfg {
  id: number;
  title: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  logoData: string | null;
  isActive: number;
  version: number;
}

// Helper: convert file to base64 data URL
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Logo upload button ───────────────────────────────────────────────────────
function LogoUpload({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <div className={`w-14 h-14 rounded-xl border border-border flex items-center justify-center overflow-hidden shrink-0 ${value ? "bg-transparent" : "bg-muted/40"}`}>
        {value ? (
          <img src={value} alt="logo" className="w-full h-full object-cover rounded-xl" />
        ) : (
          <Store className="w-6 h-6 text-muted-foreground/40" />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground hover:bg-muted/40 transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Logo
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-xs text-muted-foreground hover:text-red-500 transition-colors text-left">
            Remove
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { alert("Image must be under 2 MB"); return; }
            const dataUrl = await readFileAsDataUrl(file);
            onChange(dataUrl);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

// ── Add / Edit Product dialog ────────────────────────────────────────────────
function AddEditProductDialog({
  product, onClose, onSaved,
}: { product: AdminProduct | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const isEdit = !!product;
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product ? (product.priceCents / 100).toFixed(2) : "");
  const [logoData, setLogoData] = useState<string | null>(product?.logoData ?? null);

  const save = useMutation({
    mutationFn: async () => {
      const priceCents = Math.round(parseFloat(price) * 100);
      if (!name.trim()) throw new Error("Name is required");
      if (isNaN(priceCents) || priceCents < 1) throw new Error("Valid price is required");
      if (isEdit) {
        const res = await apiRequest("PATCH", `/api/admin/products/custom/${product!.id}`, { name, description, priceCents, logoData });
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/admin/products/custom", { name, description, priceCents, logoData });
        return res.json();
      }
    },
    onSuccess: (d) => {
      if (d.success) {
        toast({ title: isEdit ? "Product updated" : "Product created" });
        onSaved();
        onClose();
      } else {
        toast({ title: "Failed", description: d.message, variant: "destructive" });
      }
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-1">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Logo</label>
            <LogoUpload value={logoData} onChange={setLogoData} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. LinkedIn Premium Monthly" data-testid="input-product-name" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description shown to customers" className="min-h-[80px] resize-none text-sm" data-testid="input-product-description" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Price (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} className="pl-7" data-testid="input-product-price" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={save.isPending}>Cancel</Button>
            <Button className="flex-1" onClick={() => save.mutate()} disabled={save.isPending || !name.trim() || !price}>
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isEdit ? "Save Changes" : "Create Product"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Manage Vouchers dialog ────────────────────────────────────────────────────
function ManageVouchersDialog({ product, onClose }: { product: AdminProduct; onClose: () => void }) {
  const { toast } = useToast();
  const [codesText, setCodesText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading, refetch } = useQuery<{ success: boolean; data: ProductVoucher[] }>({
    queryKey: ["/api/admin/products/custom", product.id, "vouchers", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const res = await fetch(`/api/admin/products/custom/${product.id}/vouchers?${params}`, { credentials: "include" });
      return res.json();
    },
  });
  const vouchers = data?.data ?? [];
  const lineCount = codesText.split("\n").filter((l) => l.trim()).length;

  const addCodes = useMutation({
    mutationFn: async () => {
      const codes = codesText.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      const res = await apiRequest("POST", `/api/admin/products/custom/${product.id}/vouchers`, { codes });
      return res.json();
    },
    onSuccess: (d) => {
      if (d.success) { toast({ title: `${d.added} code${d.added !== 1 ? "s" : ""} added` }); setCodesText(""); refetch(); }
      else toast({ title: "Failed", description: d.message, variant: "destructive" });
    },
    onError: () => toast({ title: "Error", description: "Could not add codes.", variant: "destructive" }),
  });

  const deleteVoucher = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("DELETE", `/api/admin/vouchers/${id}`, {}); return res.json(); },
    onSuccess: (d) => {
      if (d.success) { toast({ title: "Code deleted" }); refetch(); }
      else toast({ title: "Failed", description: d.message, variant: "destructive" });
    },
    onError: () => toast({ title: "Error", description: "Could not delete code.", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {product.logoData && <img src={product.logoData} alt="" className="w-5 h-5 rounded" />}
            {product.name} — Voucher Codes
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 space-y-4 pr-0.5">
          {/* Add codes */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Add Codes <span className="text-muted-foreground font-normal">(one per line)</span></label>
            <Textarea value={codesText} onChange={(e) => setCodesText(e.target.value)} placeholder={"CODE-XXXX\nCODE-YYYY\n..."} className="font-mono text-xs min-h-[90px] resize-y" data-testid="textarea-voucher-codes" />
            {lineCount > 0 && <p className="text-xs text-muted-foreground">{lineCount} code{lineCount !== 1 ? "s" : ""} detected</p>}
            <Button onClick={() => addCodes.mutate()} disabled={addCodes.isPending || !codesText.trim()} className="w-full gap-1.5" data-testid="button-add-codes">
              {addCodes.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add {lineCount > 0 ? lineCount : ""} Codes
            </Button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">Inventory</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-28 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : vouchers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No codes yet</p>
          ) : (
            <div className="space-y-1.5">
              {vouchers.map((v) => (
                <div key={v.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/20" data-testid={`row-voucher-${v.id}`}>
                  <span className={`text-xs px-1.5 py-0.5 rounded border font-medium shrink-0 ${v.status === "available" ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-muted text-muted-foreground border-border"}`}>{v.status}</span>
                  <code className="text-xs font-mono text-foreground flex-1 truncate">{v.code}</code>
                  {v.soldAt && <span className="text-xs text-muted-foreground shrink-0">{v.soldToName ?? v.soldToEmail}</span>}
                  <CopyBtn text={v.code} />
                  {v.status === "available" && (
                    <button onClick={() => deleteVoucher.mutate(v.id)} disabled={deleteVoucher.isPending} className="p-1 rounded text-muted-foreground hover:text-red-500 transition-colors" data-testid={`button-delete-voucher-${v.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Popup editor dialog ──────────────────────────────────────────────────────
function PopupEditorDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [logoData, setLogoData] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { isLoading, data: announcementData } = useQuery<{ success: boolean; config: AnnouncementCfg | null }>({
    queryKey: ["/api/admin/announcement"],
    queryFn: async () => { const res = await fetch("/api/admin/announcement", { credentials: "include" }); return res.json(); },
  });

  useEffect(() => {
    if (announcementData && !loaded) {
      if (announcementData.config) {
        setTitle(announcementData.config.title);
        setBody(announcementData.config.body);
        setCtaText(announcementData.config.ctaText);
        setCtaUrl(announcementData.config.ctaUrl);
        setLogoData(announcementData.config.logoData ?? null);
        setIsActive(announcementData.config.isActive === 1);
      }
      setLoaded(true);
    }
  }, [announcementData, loaded]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/admin/announcement", { title, body, ctaText, ctaUrl, logoData, isActive });
      return res.json();
    },
    onSuccess: (d) => {
      if (d.success) {
        toast({ title: "Popup saved", description: isActive ? "Popup is now live for all visitors." : "Popup saved (disabled)." });
        queryClient.invalidateQueries({ queryKey: ["/api/announcement"] });
        onClose();
      } else {
        toast({ title: "Failed", description: d.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not save popup.", variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Bell className="w-4 h-4 text-muted-foreground" /> Announcement Popup</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 space-y-4 pr-0.5 pt-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Logo / Image</label>
                <LogoUpload value={logoData} onChange={setLogoData} />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Claude Pro Weekly" data-testid="input-popup-title" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Body text</label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe your announcement..." className="min-h-[100px] resize-y text-sm" data-testid="input-popup-body" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Button text</label>
                  <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="e.g. Contact on WhatsApp" data-testid="input-popup-cta-text" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Button URL</label>
                  <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://wa.me/..." data-testid="input-popup-cta-url" />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                <div>
                  <div className="text-sm font-medium text-foreground">Show popup to visitors</div>
                  <div className="text-xs text-muted-foreground">When enabled, all visitors will see this popup. Saving increments the version so existing visitors see it again.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${isActive ? "bg-primary" : "bg-muted border border-border"}`}
                  data-testid="toggle-popup-active"
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isActive ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            </>
          )}
        </div>
        <div className="flex gap-2 pt-2 border-t border-border">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button className="flex-1" onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save & Publish
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── API Keys tab ─────────────────────────────────────────────────────────────
interface AdminApiKeyRow {
  id: number;
  name: string;
  keyPrefix: string;
  active: number;
  lastUsedAt: string | null;
  createdAt: string;
  userId: number;
  userEmail: string;
  userName: string;
}

function AdminApiKeysTab() {
  const { data, isLoading } = useQuery<{ success: boolean; data: AdminApiKeyRow[] }>({
    queryKey: ["/api/admin/api-keys"],
  });
  const keys = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Active API Keys</h2>
          <p className="text-xs text-muted-foreground mt-0.5">All customer-generated API keys</p>
        </div>
        <Badge variant="secondary">{keys.length} active</Badge>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : keys.length === 0 ? (
        <Card className="border border-card-border">
          <CardContent className="p-8 text-center">
            <Key className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No API keys have been generated yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 p-3.5 rounded-lg border border-border bg-muted/10" data-testid={`row-apikey-${k.id}`}>
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Key className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{k.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{k.keyPrefix}…</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {k.userName} · {k.userEmail}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground">
                  {k.lastUsedAt ? `Last used ${new Date(k.lastUsedAt).toLocaleDateString("en-GB")}` : "Never used"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Created {new Date(k.createdAt).toLocaleDateString("en-GB")}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Products tab ─────────────────────────────────────────────────────────────
function ProductsTab() {
  const { toast } = useToast();
  const [showPopupEditor, setShowPopupEditor] = useState(false);
  const [addProduct, setAddProduct] = useState(false);
  const [editProduct, setEditProduct] = useState<AdminProduct | null>(null);
  const [manageVouchers, setManageVouchers] = useState<AdminProduct | null>(null);

  const { data, isLoading, refetch } = useQuery<{ success: boolean; data: AdminProduct[] }>({
    queryKey: ["/api/admin/products/custom"],
    queryFn: async () => { const res = await fetch("/api/admin/products/custom", { credentials: "include" }); return res.json(); },
  });
  const products = data?.data ?? [];

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/products/custom/${id}`, { active });
      return res.json();
    },
    onSuccess: (d) => { if (d.success) refetch(); else toast({ title: "Failed", description: d.message, variant: "destructive" }); },
    onError: () => toast({ title: "Error", description: "Could not update product.", variant: "destructive" }),
  });

  const deleteProduct = useMutation({
    mutationFn: async (id: number) => { const res = await apiRequest("DELETE", `/api/admin/products/custom/${id}`, {}); return res.json(); },
    onSuccess: (d) => {
      if (d.success) { toast({ title: "Product deleted" }); refetch(); }
      else toast({ title: "Failed", description: d.message, variant: "destructive" });
    },
    onError: () => toast({ title: "Error", description: "Could not delete product.", variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      {showPopupEditor && <PopupEditorDialog onClose={() => setShowPopupEditor(false)} />}
      {(addProduct || editProduct) && (
        <AddEditProductDialog
          product={editProduct}
          onClose={() => { setAddProduct(false); setEditProduct(null); }}
          onSaved={refetch}
        />
      )}
      {manageVouchers && <ManageVouchersDialog product={manageVouchers} onClose={() => setManageVouchers(null)} />}

      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-foreground flex-1">Custom Products</h3>
        <Button variant="outline" size="sm" onClick={() => setShowPopupEditor(true)} className="gap-1.5 h-8 text-xs" data-testid="button-manage-popup">
          <Bell className="w-3.5 h-3.5" />
          Manage Popup
        </Button>
        <Button size="sm" onClick={() => setAddProduct(true)} className="gap-1.5 h-8 text-xs" data-testid="button-add-product">
          <Plus className="w-3.5 h-3.5" />
          Add Product
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : products.length === 0 ? (
        <Card className="border border-card-border">
          <CardContent className="p-10 text-center">
            <Store className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No custom products yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Add a product like LinkedIn Premium to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <Card key={p.id} className={`border ${p.active ? "border-card-border" : "border-border opacity-60"}`} data-testid={`row-product-${p.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Logo */}
                  <div className="w-10 h-10 rounded-lg border border-border flex items-center justify-center overflow-hidden shrink-0 bg-muted/20">
                    {p.logoData ? <img src={p.logoData} alt="" className="w-full h-full object-cover rounded-lg" /> : <Store className="w-5 h-5 text-muted-foreground/40" />}
                  </div>
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="font-semibold text-foreground text-sm">{p.name}</span>
                      <span className="font-bold text-primary text-sm">${(p.priceCents / 100).toFixed(2)}</span>
                      {!p.active && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
                    </div>
                    {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">{p.stock.available} available</span>
                      <span className="text-xs text-muted-foreground">{p.stock.sold} sold</span>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => setManageVouchers(p)} data-testid={`button-manage-vouchers-${p.id}`}>
                      <Key className="w-3 h-3" />
                      Codes
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1" onClick={() => setEditProduct(p)} data-testid={`button-edit-product-${p.id}`}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <button
                      onClick={() => toggleActive.mutate({ id: p.id, active: !p.active })}
                      disabled={toggleActive.isPending}
                      className="h-7 px-2 flex items-center gap-1 rounded border border-border bg-background text-muted-foreground hover:text-foreground text-xs transition-colors"
                      title={p.active ? "Hide from shop" : "Show in shop"}
                      data-testid={`button-toggle-product-${p.id}`}
                    >
                      {p.active ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${p.name}" and all its codes?`)) deleteProduct.mutate(p.id); }}
                      disabled={deleteProduct.isPending}
                      className="h-7 px-2 flex items-center gap-1 rounded border border-border bg-background text-muted-foreground hover:text-red-500 hover:border-red-500/40 text-xs transition-colors"
                      data-testid={`button-delete-product-${p.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function WhatsAppBotTab() {
  const { data, isLoading, refetch } = useQuery<{ status: string; qr?: string }>({
    queryKey: ["/api/admin/whatsapp/qr"],
    refetchInterval: 5000,
  });

  return (
    <div className="max-w-lg mx-auto py-8">
      <h2 className="text-xl font-semibold mb-2">WhatsApp Bot</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Scan the QR code below with your WhatsApp phone to activate the bot. Once connected, customers can send their CDK key to your number for automatic activation.
      </p>
      <div className="border border-border rounded-lg p-6 text-center bg-card">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Checking connection status...</p>
          </div>
        ) : data?.status === "connected" ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold text-green-600">WhatsApp Connected</p>
            <p className="text-sm text-muted-foreground">The bot is active and ready to handle customer messages.</p>
          </div>
        ) : data?.status === "qr" && data.qr ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm font-medium">Scan with WhatsApp to connect the bot</p>
            <img src={data.qr} alt="WhatsApp QR Code" className="w-64 h-64 rounded-lg border border-border" data-testid="img-whatsapp-qr" />
            <p className="text-xs text-muted-foreground">Open WhatsApp → Linked Devices → Link a Device → scan this code</p>
            <button onClick={() => refetch()} className="text-xs text-primary underline" data-testid="button-refresh-qr">Refresh QR</button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Waiting for QR code to be generated...</p>
            <button onClick={() => refetch()} className="text-xs text-primary underline mt-2" data-testid="button-refresh-status">Refresh</button>
          </div>
        )}
      </div>
      <div className="mt-6 p-4 bg-muted/50 rounded-lg">
        <p className="text-xs font-semibold mb-2">How it works:</p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Scan the QR code with your WhatsApp phone</li>
          <li>Customers message your WhatsApp number with their CDK key</li>
          <li>Bot verifies the key and asks for their ChatGPT session token</li>
          <li>Bot activates their account automatically</li>
        </ol>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [, navigate] = useLocation();
  const { user, isAdmin, isLoading } = useAuth();
  const [tab, setTab] = useState<"customers" | "orders" | "deposits" | "inventory" | "products" | "api-keys" | "whatsapp" | "settings">("customers");
  const [balanceTarget, setBalanceTarget] = useState<{ customer: Customer; mode: "credit" | "debit" } | null>(null);
  const [ordersTarget, setOrdersTarget] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");

  const { data: customersData, isLoading: customersLoading } = useQuery<{ success: boolean; data: Customer[] }>({
    queryKey: ["/api/admin/customers"],
    enabled: isAdmin,
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery<{ success: boolean; data: AdminOrder[] }>({
    queryKey: ["/api/admin/orders"],
    enabled: isAdmin && tab === "orders",
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

  if (!user || !isAdmin) {
    navigate("/");
    return null;
  }

  const customers = customersData?.data ?? [];
  const orders = ordersData?.data ?? [];
  const totalBalance = customers.filter(c => c.role !== "admin").reduce((sum, c) => sum + c.balanceCents, 0);
  const filteredCustomers = customers.filter(c => c.role !== "admin").filter(c => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  return (
    <PageLayout maxWidth="max-w-5xl">
      <BalanceDialog
        customer={balanceTarget?.customer ?? null}
        mode={balanceTarget?.mode ?? "credit"}
        onClose={() => setBalanceTarget(null)}
      />
      <CustomerHistoryDialog customer={ordersTarget} onClose={() => setOrdersTarget(null)} />
      <DeleteCustomerDialog customer={deleteTarget} onClose={() => setDeleteTarget(null)} />

      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Admin Panel</h1>
        <p className="text-muted-foreground text-sm">Manage customers, orders and settings</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Card className="border border-card-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Customers</span>
            </div>
            <div className="text-2xl font-bold text-foreground" data-testid="stat-customers">
              {customers.filter(c => c.role !== "admin").length}
            </div>
          </CardContent>
        </Card>
        <Card className="border border-card-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Orders</span>
            </div>
            <div className="text-2xl font-bold text-foreground" data-testid="stat-orders">{orders.length || "—"}</div>
          </CardContent>
        </Card>
        <Card className="border border-card-border col-span-2 sm:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Total Balance Held</span>
            </div>
            <div className="text-2xl font-bold text-foreground" data-testid="stat-balance">${(totalBalance / 100).toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-border overflow-x-auto">
        {(["customers", "orders", "deposits", "inventory", "products", "api-keys", "whatsapp", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors -mb-px whitespace-nowrap ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${t}`}
          >
            {t === "settings" && <Settings className="w-3.5 h-3.5" />}
            {t === "deposits" && <ArrowDownToLine className="w-3.5 h-3.5" />}
            {t === "inventory" && <Key className="w-3.5 h-3.5" />}
            {t === "api-keys" && <Key className="w-3.5 h-3.5" />}
            {t === "deposits" ? "Deposits" : t === "settings" ? "Settings" : t === "inventory" ? "Keys" : t === "api-keys" ? "API Keys" : t === "whatsapp" ? "WhatsApp Bot" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Customers tab */}
      {tab === "customers" && (
        <div>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="pl-9"
              data-testid="input-customer-search"
            />
          </div>

          {customersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCustomers.length === 0 ? (
            <Card className="border border-card-border">
              <CardContent className="p-8 text-center">
                <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{customerSearch ? "No customers match your search" : "No customers yet"}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredCustomers.map((c) => (
                <Card key={c.id} className="border border-card-border" data-testid={`row-customer-${c.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-foreground text-sm">{c.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Joined {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right mr-1">
                          <div className="text-base font-bold text-foreground" data-testid={`text-balance-${c.id}`}>
                            ${(c.balanceCents / 100).toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">balance</div>
                        </div>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => setOrdersTarget(c)}
                          className="gap-1 h-8 px-2.5 text-xs"
                          title="View purchase history"
                          data-testid={`button-view-orders-${c.id}`}
                        >
                          <ShoppingBag className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => setBalanceTarget({ customer: c, mode: "credit" })}
                          className="gap-1 h-8 px-2.5 text-xs text-green-600 border-green-500/30 hover:bg-green-500/10"
                          title="Add balance"
                          data-testid={`button-add-balance-${c.id}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => setBalanceTarget({ customer: c, mode: "debit" })}
                          className="gap-1 h-8 px-2.5 text-xs text-amber-600 border-amber-500/30 hover:bg-amber-500/10"
                          title="Reduce balance"
                          data-testid={`button-reduce-balance-${c.id}`}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => setDeleteTarget(c)}
                          className="gap-1 h-8 px-2.5 text-xs text-red-500 border-red-500/30 hover:bg-red-500/10"
                          title="Delete customer"
                          data-testid={`button-delete-customer-${c.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Orders tab */}
      {tab === "orders" && (
        <div>
          {ordersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <Card className="border border-card-border">
              <CardContent className="p-8 text-center">
                <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No orders yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {orders.map((o) => (
                <Card key={o.id} className="border border-card-border" data-testid={`row-order-${o.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-semibold text-foreground text-sm">{o.subscription}</span>
                          <Badge variant="secondary" className="text-xs">{o.status}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {o.userName} · {o.userEmail}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {o.quantity} key{o.quantity !== 1 ? "s" : ""} · #{o.orderNumber} · {new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-foreground">${(o.amountCents / 100).toFixed(2)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Deposits tab */}
      {tab === "deposits" && <DepositsTab />}

      {/* Key Inventory tab */}
      {tab === "inventory" && <KeyInventoryTab />}

      {/* Products tab */}
      {tab === "products" && <ProductsTab />}

      {/* API Keys tab */}
      {tab === "api-keys" && <AdminApiKeysTab />}

      {/* WhatsApp Bot tab */}
      {tab === "whatsapp" && <WhatsAppBotTab />}

      {/* Settings tab */}
      {tab === "settings" && <SettingsTab user={user} />}
    </PageLayout>
  );
}
