import { useState } from "react";
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
import { Loader2, Users, Package, DollarSign, Plus, Copy, Check, Settings, ArrowDownToLine, Key, Trash2 } from "lucide-react";

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

function CreditDialog({
  customer,
  onClose,
}: {
  customer: Customer | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const credit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/customers/${customer!.id}/credit`, {
        amountUsd: amount,
        description: description.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({ title: "Balance added", description: `$${parseFloat(amount).toFixed(2)} added to ${customer!.email}` });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/customers"] });
        onClose();
        setAmount("");
        setDescription("");
      } else {
        toast({ title: "Failed", description: data.message, variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Could not add balance.", variant: "destructive" });
    },
  });

  return (
    <Dialog open={!!customer} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Balance</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="text-sm text-muted-foreground">
            Adding balance to: <span className="font-medium text-foreground">{customer?.email}</span>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 divide-y divide-border">
            <div className="px-3 py-2">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Your Binance Pay (receive USDT here)</p>
            </div>
            <div className="flex items-center justify-between px-3 py-2 gap-2">
              <div>
                <div className="text-xs text-muted-foreground">Pay ID</div>
                <div className="font-mono font-bold text-foreground text-sm">{BINANCE_PAY_ID}</div>
              </div>
              <CopyBtn text={BINANCE_PAY_ID} />
            </div>
            <div className="flex items-center justify-between px-3 py-2 gap-2">
              <div>
                <div className="text-xs text-muted-foreground">Username</div>
                <div className="font-mono font-semibold text-foreground text-sm">{BINANCE_USERNAME}</div>
              </div>
              <CopyBtn text={BINANCE_USERNAME} />
            </div>
            <div className="flex items-center justify-between px-3 py-2 gap-2">
              <div>
                <div className="text-xs text-muted-foreground">WhatsApp</div>
                <div className="font-mono font-semibold text-foreground text-sm">{WHATSAPP}</div>
              </div>
              <CopyBtn text={WHATSAPP} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Amount to credit (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7"
                data-testid="input-credit-amount"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Description (optional)</label>
            <Input
              placeholder="e.g. Binance Pay top-up"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-credit-description"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={credit.isPending}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={!amount || parseFloat(amount) <= 0 || credit.isPending}
              onClick={() => credit.mutate()}
              data-testid="button-submit-credit"
            >
              {credit.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Add Balance
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

function KeyInventoryTab() {
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState("plus-1m");
  const [keysText, setKeysText] = useState("");
  const [filterPlan, setFilterPlan] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

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
        toast({ title: "Key deleted" });
        refetch();
      } else {
        toast({ title: "Failed", description: d.message, variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Error", description: "Could not delete key.", variant: "destructive" }),
  });

  const lineCount = keysText.split("\n").filter((l) => l.trim()).length;

  return (
    <div className="space-y-5">
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

export default function AdminPage() {
  const [, navigate] = useLocation();
  const { user, isAdmin, isLoading } = useAuth();
  const [tab, setTab] = useState<"customers" | "orders" | "deposits" | "inventory" | "settings">("customers");
  const [creditTarget, setCreditTarget] = useState<Customer | null>(null);

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

  return (
    <PageLayout maxWidth="max-w-5xl">
      <CreditDialog customer={creditTarget} onClose={() => setCreditTarget(null)} />

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
        {(["customers", "orders", "deposits", "inventory", "settings"] as const).map((t) => (
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
            {t === "deposits" ? "Deposits" : t === "settings" ? "Settings" : t === "inventory" ? "Keys" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Customers tab */}
      {tab === "customers" && (
        <div>
          {customersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : customers.filter(c => c.role !== "admin").length === 0 ? (
            <Card className="border border-card-border">
              <CardContent className="p-8 text-center">
                <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No customers yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {customers.filter(c => c.role !== "admin").map((c) => (
                <Card key={c.id} className="border border-card-border" data-testid={`row-customer-${c.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm truncate">{c.name}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Joined {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-base font-bold text-foreground" data-testid={`text-balance-${c.id}`}>
                            ${(c.balanceCents / 100).toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">balance</div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCreditTarget(c)}
                          className="gap-1.5"
                          data-testid={`button-add-balance-${c.id}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add
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

      {/* Settings tab */}
      {tab === "settings" && <SettingsTab user={user} />}
    </PageLayout>
  );
}
