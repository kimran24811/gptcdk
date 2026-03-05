import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle, ExternalLink, Zap, AlertTriangle,
  Loader2, Check, User, Calendar, Package,
} from "lucide-react";
import { PageLayout } from "@/components/page-layout";

type Step = 1 | 2 | 3;

interface ActivationResult {
  email?: string;
  product?: string;
  subscription?: string;
  activatedAt?: string;
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center mb-6 sm:mb-8">
      {[1, 2, 3].map((step, idx) => {
        const done = current > step;
        const active = current === step;
        return (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 shrink-0 ${
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground border border-border"
              }`}
              data-testid={`step-indicator-${step}`}
            >
              {done ? <Check className="w-4 h-4" /> : step}
            </div>
            {idx < 2 && (
              <div
                className={`flex-1 h-0.5 transition-all duration-500 ${
                  current > step ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function RedeemPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [cdkKey, setCdkKey] = useState("");
  const [cdkInfo, setCdkInfo] = useState<{ type: string } | null>(null);
  const [sessionData, setSessionData] = useState("");
  const [sessionValidated, setSessionValidated] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [activationResult, setActivationResult] = useState<ActivationResult | null>(null);

  const validateCdk = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest("POST", "/api/validate-cdk", { key });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.valid) {
        setCdkInfo({ type: data.type });
        setStep(2);
      } else {
        toast({
          title: "Invalid CDK",
          description: data.message || "The key you entered is not valid.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Validation failed",
        description: "Could not reach the validation service. Please try again.",
        variant: "destructive",
      });
    },
  });

  const validateSession = useMutation({
    mutationFn: async (data: string) => {
      const res = await apiRequest("POST", "/api/validate-session", { sessionData: data });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.valid) {
        setSessionValidated(true);
        setSessionError(null);
      } else {
        setSessionError(data.message || "Please paste valid JSON from the AuthSession page.");
      }
    },
    onError: () => {
      setSessionError("Could not validate session data. Please try again.");
    },
  });

  const activate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/activate", { cdkKey, sessionData });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setActivationResult({
          email: data.email,
          product: data.product,
          subscription: data.subscription,
          activatedAt: data.activatedAt,
        });
        setStep(3);
      } else {
        toast({
          title: "Activation failed",
          description: data.message || "Something went wrong. Please try again.",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "Activation error",
        description: "Could not reach the activation service. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetFlow = () => {
    setStep(1);
    setCdkKey("");
    setCdkInfo(null);
    setSessionData("");
    setSessionValidated(false);
    setSessionError(null);
    setActivationResult(null);
  };

  return (
    <PageLayout>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">Redeem CDK</h1>
        <p className="text-muted-foreground text-sm">Safe and fast subscription activation service</p>
      </div>

      <StepIndicator current={step} />

      {step === 3 && activationResult ? (
        <Card className="border border-card-border">
          <CardContent className="py-10 sm:py-12 flex flex-col items-center gap-5 sm:gap-6 text-center px-4 sm:px-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-primary" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-1">Activation Successful!</h2>
              <p className="text-muted-foreground text-sm">
                Your subscription has been activated successfully.
              </p>
            </div>

            {(activationResult.email || activationResult.product || activationResult.subscription) && (
              <div className="w-full max-w-sm rounded-md border border-card-border bg-muted/40 divide-y divide-border text-sm text-left">
                {activationResult.email && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground mb-0.5">Account</div>
                      <div className="font-medium text-foreground truncate" data-testid="text-activation-email">{activationResult.email}</div>
                    </div>
                  </div>
                )}
                {activationResult.product && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Product</div>
                      <div className="font-medium text-foreground" data-testid="text-activation-product">{activationResult.product}</div>
                    </div>
                  </div>
                )}
                {activationResult.subscription && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Zap className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Subscription</div>
                      <div className="font-medium text-foreground" data-testid="text-activation-subscription">{activationResult.subscription}</div>
                    </div>
                  </div>
                )}
                {activationResult.activatedAt && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Activated at</div>
                      <div className="font-medium text-foreground" data-testid="text-activation-date">
                        {new Date(activationResult.activatedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="p-4 rounded-md bg-accent/50 border border-accent-border text-accent-foreground text-sm max-w-sm w-full">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                <span>
                  After activation, try refreshing the ChatGPT page multiple times. The page will refresh itself to update the subscription status.
                </span>
              </div>
            </div>

            <Button variant="outline" onClick={resetFlow} data-testid="button-redeem-again">
              Redeem Another
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-card-border">
          <CardContent className="p-4 sm:p-6 space-y-6 sm:space-y-8">
            {/* Step 1 — CDK */}
            <div>
              <h2 className="text-base font-semibold text-foreground mb-3 sm:mb-4">
                Enter and verify your CDK
              </h2>
              <div className="flex gap-2 sm:gap-3">
                <Input
                  placeholder="Enter your CDK key"
                  value={cdkKey}
                  onChange={(e) => setCdkKey(e.target.value)}
                  disabled={step > 1 || validateCdk.isPending}
                  className={`flex-1 font-mono text-sm ${step > 1 ? "border-primary bg-primary/5" : ""}`}
                  data-testid="input-cdk-key"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && cdkKey.trim() && step === 1) {
                      validateCdk.mutate(cdkKey.trim());
                    }
                  }}
                />
                <Button
                  onClick={() => validateCdk.mutate(cdkKey.trim())}
                  disabled={!cdkKey.trim() || step > 1 || validateCdk.isPending}
                  data-testid="button-validate-cdk"
                >
                  {validateCdk.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Validate"
                  )}
                </Button>
              </div>
              {step > 1 && cdkInfo && (
                <div className="flex items-center gap-2 mt-3 flex-wrap" data-testid="cdk-valid-status">
                  <Badge variant="default" className="gap-1">
                    <Check className="w-3 h-3" />
                    Valid
                  </Badge>
                  <Badge variant="secondary" data-testid="badge-cdk-type">
                    {cdkInfo.type}
                  </Badge>
                </div>
              )}
            </div>

            {/* Step 2 — Session */}
            <div className={`transition-opacity duration-300 ${step >= 2 ? "opacity-100" : "opacity-40 pointer-events-none select-none"}`}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                <h2 className="text-base font-semibold text-foreground">
                  Get AuthSession data
                </h2>
                {step >= 2 && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <a
                      href="https://chat.openai.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary font-medium"
                      data-testid="link-open-chatgpt"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open ChatGPT
                    </a>
                    <a
                      href="https://chat.openai.com/api/auth/session"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary font-medium"
                      data-testid="link-open-authsession"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open AuthSession Page
                    </a>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Open the AuthSession page, copy the full JSON content, then paste it here and click validate.
              </p>
              <Textarea
                placeholder='Paste the full JSON from AuthSession page (e.g. {"accessToken":"...","user":{...}})'
                value={sessionData}
                onChange={(e) => {
                  setSessionData(e.target.value);
                  setSessionValidated(false);
                  setSessionError(null);
                }}
                disabled={step < 2 || validateSession.isPending || activate.isPending}
                className={`min-h-[100px] sm:min-h-[110px] font-mono text-xs resize-none ${
                  sessionValidated ? "border-primary" : sessionError ? "border-destructive" : ""
                }`}
                data-testid="textarea-session-data"
              />
              {sessionError && (
                <div className="flex items-start gap-2 mt-2 text-xs text-destructive" data-testid="session-error-message">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{sessionError}</span>
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                {sessionValidated && (
                  <div className="flex items-center gap-1.5 text-xs text-primary font-medium" data-testid="session-valid-indicator">
                    <Check className="w-3.5 h-3.5" />
                    Session validated
                  </div>
                )}
                <div className="ml-auto">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => validateSession.mutate(sessionData.trim())}
                    disabled={!sessionData.trim() || step < 2 || sessionValidated || validateSession.isPending}
                    data-testid="button-validate-session"
                  >
                    {validateSession.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : null}
                    {validateSession.isPending ? "Verifying..." : "Validate"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Activate */}
            <Button
              className="w-full gap-2"
              size="lg"
              onClick={() => activate.mutate()}
              disabled={!sessionValidated || step < 2 || activate.isPending}
              data-testid="button-activate"
            >
              {activate.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {activate.isPending ? "Activating..." : "Activate"}
            </Button>

            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <span>
                After activation, try refreshing the ChatGPT page multiple times. The page will refresh itself to update the subscription status.
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </PageLayout>
  );
}
