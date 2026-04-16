import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, Clock, AlertTriangle, Copy, Check } from "lucide-react";
import { PageLayout } from "@/components/page-layout";

interface KeyStatus {
  key: string;
  status: "available" | "used" | "expired" | "invalid";
  activated_at?: string;
  activated_for?: string;
}

const STATUS_CONFIG = {
  available: {
    label: "Available",
    icon: CheckCircle,
    badge: "default" as const,
  },
  used: {
    label: "Used",
    icon: XCircle,
    badge: "secondary" as const,
  },
  expired: {
    label: "Expired",
    icon: Clock,
    badge: "secondary" as const,
  },
  invalid: {
    label: "Invalid",
    icon: AlertTriangle,
    badge: "destructive" as const,
  },
};

export default function BatchCheckPage() {
  const { toast } = useToast();
  const [keysInput, setKeysInput] = useState("");
  const [results, setResults] = useState<KeyStatus[] | null>(null);
  const [copiedKeys, setCopiedKeys] = useState<Set<string>>(new Set());
  const [copiedAll, setCopiedAll] = useState(false);

  const batchCheck = useMutation({
    mutationFn: async (keys: string[]) => {
      const res = await apiRequest("POST", "/api/batch-status", { keys });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setResults(data.data);
        setCopiedKeys(new Set());
        setCopiedAll(false);
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

  const copyKey = useCallback((key: string) => {
    navigator.clipboard.writeText(key).then(() => {
      setCopiedKeys((prev) => new Set(prev).add(key));
      setTimeout(() => {
        setCopiedKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 2000);
    });
  }, []);

  const copyAllAvailable = useCallback(() => {
    if (!results) return;
    const availableKeys = results
      .filter((r) => r.status === "available")
      .map((r) => r.key)
      .join("\n");
    if (!availableKeys) {
      toast({ title: "No available keys", description: "There are no available keys to copy.", variant: "destructive" });
      return;
    }
    navigator.clipboard.writeText(availableKeys).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
      const count = results.filter((r) => r.status === "available").length;
      toast({ title: `Copied ${count} available keys`, description: "Keys copied to clipboard." });
    });
  }, [results, toast]);

  const counts = results
    ? {
        available: results.filter((r) => r.status === "available").length,
        used: results.filter((r) => r.status === "used").length,
        expired: results.filter((r) => r.status === "expired").length,
        invalid: results.filter((r) => r.status === "invalid").length,
      }
    : null;

  const keyCount = keysInput.split(/[\n,]+/).filter((k) => k.trim().length > 0).length;

  return (
    <PageLayout>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Batch Check</h1>
        <p className="text-muted-foreground text-sm">Check the status of multiple CDK keys at once</p>
      </div>

      <Card className="border border-card-border mb-5">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Enter CDK keys</label>
            <p className="text-xs text-muted-foreground mb-3">
              Paste one key per line, or separate with commas. Maximum 500 keys.
            </p>
            <Textarea
              placeholder={"XXXXX-XXXXX-XXX\nYYYYY-YYYYY-YYY\nZZZZZ-ZZZZZ-ZZZ"}
              value={keysInput}
              onChange={(e) => { setKeysInput(e.target.value); setResults(null); }}
              className="min-h-[140px] sm:min-h-[160px] font-mono text-xs resize-none"
              data-testid="textarea-batch-keys"
            />
            <div className="flex items-center justify-between mt-3 gap-3">
              <span className="text-xs text-muted-foreground shrink-0">
                {keyCount} {keyCount === 1 ? "key" : "keys"} entered
              </span>
              <Button
                onClick={handleCheck}
                disabled={!keysInput.trim() || batchCheck.isPending}
                data-testid="button-batch-check"
                className="shrink-0"
              >
                {batchCheck.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />Checking...</>
                ) : "Check Status"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {results && (
        <>
          {/* Summary counts — 2 cols on mobile, 4 on sm+ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
            {[
              { label: "Available", count: counts!.available, variant: "default" as const },
              { label: "Used", count: counts!.used, variant: "secondary" as const },
              { label: "Expired", count: counts!.expired, variant: "secondary" as const },
              { label: "Invalid", count: counts!.invalid, variant: "destructive" as const },
            ].map(({ label, count, variant }) => (
              <Card key={label} className="border border-card-border">
                <CardContent className="p-3 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl font-bold text-foreground">{count}</div>
                  <Badge variant={variant} className="text-xs mt-1">{label}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Results card */}
          <Card className="border border-card-border">
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border gap-3">
              <span className="text-sm font-medium text-foreground shrink-0">
                {results.length} keys checked
              </span>
              {counts!.available > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs shrink-0"
                  onClick={copyAllAvailable}
                  data-testid="button-copy-all-available"
                >
                  {copiedAll ? (
                    <><Check className="w-3.5 h-3.5 text-primary" />Copied {counts!.available}</>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /><span className="hidden xs:inline">Copy All Available ({counts!.available})</span><span className="xs:hidden">Copy All ({counts!.available})</span></>
                  )}
                </Button>
              )}
            </div>

            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {results.map((item, idx) => {
                  const config = STATUS_CONFIG[item.status] || STATUS_CONFIG.invalid;
                  const Icon = config.icon;
                  const isCopied = copiedKeys.has(item.key);
                  const isAvailable = item.status === "available";

                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-4 sm:px-5 py-3 gap-2 sm:gap-3"
                      data-testid={`row-key-${idx}`}
                    >
                      <code className="text-xs sm:text-sm font-mono text-foreground truncate flex-1 min-w-0">
                        {item.key}
                      </code>
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {item.activated_for && (
                          <span className="text-xs text-muted-foreground hidden lg:block max-w-[180px] truncate">
                            {item.activated_for}
                          </span>
                        )}
                        {item.activated_at && !item.activated_for && (
                          <span className="text-xs text-muted-foreground hidden md:block">
                            {new Date(item.activated_at).toLocaleDateString()}
                          </span>
                        )}
                        <Badge variant={config.badge} className="gap-1 text-xs shrink-0">
                          <Icon className="w-3 h-3" />
                          <span className="hidden xs:inline">{config.label}</span>
                        </Badge>
                        {isAvailable && (
                          <button
                            onClick={() => copyKey(item.key)}
                            className={`flex items-center justify-center w-7 h-7 rounded-md border transition-all duration-150 shrink-0 ${
                              isCopied
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background text-muted-foreground hover-elevate"
                            }`}
                            title="Copy key"
                            data-testid={`button-copy-key-${idx}`}
                          >
                            {isCopied
                              ? <Check className="w-3.5 h-3.5" />
                              : <Copy className="w-3.5 h-3.5" />
                            }
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </PageLayout>
  );
}
