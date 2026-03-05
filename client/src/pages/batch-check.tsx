import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { SiTelegram } from "react-icons/si";

interface KeyStatus {
  key: string;
  status: "available" | "used" | "expired" | "invalid";
  activated_at?: string;
}

const STATUS_CONFIG = {
  available: {
    label: "Available",
    icon: CheckCircle,
    badge: "default" as const,
    color: "text-primary",
  },
  used: {
    label: "Used",
    icon: XCircle,
    badge: "secondary" as const,
    color: "text-muted-foreground",
  },
  expired: {
    label: "Expired",
    icon: Clock,
    badge: "secondary" as const,
    color: "text-muted-foreground",
  },
  invalid: {
    label: "Invalid",
    icon: AlertTriangle,
    badge: "destructive" as const,
    color: "text-destructive",
  },
};

export default function BatchCheckPage() {
  const { toast } = useToast();
  const [keysInput, setKeysInput] = useState("");
  const [results, setResults] = useState<KeyStatus[] | null>(null);

  const batchCheck = useMutation({
    mutationFn: async (keys: string[]) => {
      const res = await apiRequest("POST", "/api/batch-status", { keys });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setResults(data.data);
      } else {
        toast({
          title: "Check failed",
          description: data.message || "Could not check key statuses.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Request failed",
        description: "Could not reach the service. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleCheck = () => {
    const keys = keysInput
      .split(/[\n,]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (keys.length === 0) {
      toast({ title: "No keys", description: "Please enter at least one key.", variant: "destructive" });
      return;
    }
    if (keys.length > 500) {
      toast({ title: "Too many keys", description: "Maximum 500 keys per request.", variant: "destructive" });
      return;
    }
    setResults(null);
    batchCheck.mutate(keys);
  };

  const counts = results
    ? {
        available: results.filter((r) => r.status === "available").length,
        used: results.filter((r) => r.status === "used").length,
        expired: results.filter((r) => r.status === "expired").length,
        invalid: results.filter((r) => r.status === "invalid").length,
      }
    : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background sticky top-0 z-50">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-foreground text-lg tracking-tight">
              ChatGPT Recharge
            </span>
            <Badge variant="default" className="text-xs" data-testid="badge-plus">
              Plus
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1">
              <a
                href="/"
                className="px-4 py-1.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent"
                data-testid="nav-redeem"
              >
                Redeem
              </a>
              <button
                className="px-4 py-1.5 text-sm font-medium text-foreground border-b-2 border-primary"
                data-testid="nav-batch-check"
              >
                Batch Check
              </button>
              <a
                href="/shop"
                className="px-4 py-1.5 text-sm font-medium text-muted-foreground border-b-2 border-transparent"
                data-testid="nav-shop"
              >
                Shop
              </a>
            </nav>
            <a
              href="https://t.me/CDK_Keys?text=i%20want%20to%20purchase%20key"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="button-telegram"
            >
              <Button size="sm" className="gap-1.5 bg-[#229ED9] text-white border-[#1a8bbf]">
                <SiTelegram className="w-3.5 h-3.5" />
                Buy Key
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-1">Batch Check</h1>
          <p className="text-muted-foreground text-sm">Check the status of multiple CDK keys at once</p>
        </div>

        <Card className="border border-card-border mb-6">
          <CardContent className="p-6 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Enter CDK keys
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                Paste one key per line, or separate them with commas. Maximum 500 keys per request.
              </p>
              <Textarea
                placeholder={"XXXXX-XXXXX-XXX\nYYYYY-YYYYY-YYY\nZZZZZ-ZZZZZ-ZZZ"}
                value={keysInput}
                onChange={(e) => {
                  setKeysInput(e.target.value);
                  setResults(null);
                }}
                className="min-h-[160px] font-mono text-xs resize-none"
                data-testid="textarea-batch-keys"
              />
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-muted-foreground">
                  {keysInput.split(/[\n,]+/).filter((k) => k.trim().length > 0).length} keys entered
                </span>
                <Button
                  onClick={handleCheck}
                  disabled={!keysInput.trim() || batchCheck.isPending}
                  data-testid="button-batch-check"
                >
                  {batchCheck.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Checking...</>
                  ) : (
                    "Check Status"
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {results && (
          <>
            {counts && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Available", count: counts.available, variant: "default" as const },
                  { label: "Used", count: counts.used, variant: "secondary" as const },
                  { label: "Expired", count: counts.expired, variant: "secondary" as const },
                  { label: "Invalid", count: counts.invalid, variant: "destructive" as const },
                ].map(({ label, count, variant }) => (
                  <Card key={label} className="border border-card-border">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-foreground">{count}</div>
                      <Badge variant={variant} className="text-xs mt-1">{label}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Card className="border border-card-border">
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {results.map((item, idx) => {
                    const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.invalid;
                    const Icon = config.icon;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-5 py-3 gap-4"
                        data-testid={`row-key-${idx}`}
                      >
                        <code className="text-sm font-mono text-foreground truncate flex-1">
                          {item.key}
                        </code>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.activated_at && (
                            <span className="text-xs text-muted-foreground hidden sm:block">
                              {new Date(item.activated_at).toLocaleDateString()}
                            </span>
                          )}
                          <Badge variant={config.badge} className="gap-1">
                            <Icon className="w-3 h-3" />
                            {config.label}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
