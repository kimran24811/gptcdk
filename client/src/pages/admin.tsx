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
import { Loader2, Users, Package, DollarSign, Plus } from "lucide-react";

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
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Amount (USD)</label>
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

export default function AdminPage() {
  const [, navigate] = useLocation();
  const { user, isAdmin, isLoading } = useAuth();
  const [tab, setTab] = useState<"customers" | "orders">("customers");
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
  const totalBalance = customers.reduce((sum, c) => sum + c.balanceCents, 0);
  const totalRevenue = orders.reduce((sum, o) => sum + o.amountCents, 0);

  return (
    <PageLayout maxWidth="max-w-5xl">
      <CreditDialog customer={creditTarget} onClose={() => setCreditTarget(null)} />

      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Admin Panel</h1>
        <p className="text-muted-foreground text-sm">Manage customers and view orders</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <Card className="border border-card-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Customers</span>
            </div>
            <div className="text-2xl font-bold text-foreground" data-testid="stat-customers">{customers.length}</div>
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
      <div className="flex gap-1 mb-5 border-b border-border">
        {(["customers", "orders"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`tab-${t}`}
          >
            {t}
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
          ) : customers.length === 0 ? (
            <Card className="border border-card-border">
              <CardContent className="p-8 text-center">
                <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No customers yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {customers.map((c) => (
                <Card key={c.id} className="border border-card-border" data-testid={`row-customer-${c.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm truncate">{c.name}</span>
                          {c.role === "admin" && <Badge variant="default" className="text-xs">Admin</Badge>}
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
                        {c.role !== "admin" && (
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
                        )}
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
    </PageLayout>
  );
}
