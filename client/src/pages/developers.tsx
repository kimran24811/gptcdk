import { useState } from "react";
import { PageLayout } from "@/components/page-layout";
import { Copy, Check, Code2, Key, Zap, Shield, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

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

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const { copied, copy } = useCopied();
  return (
    <div className="relative group rounded-lg border border-border bg-[#0d1117] overflow-hidden">
      {label && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/20">
          <span className="text-xs text-muted-foreground font-mono">{label}</span>
          <button
            onClick={() => copy(code)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-all ${
              copied ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`button-copy-code-${label}`}
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed whitespace-pre">
        {code}
      </pre>
      {!label && (
        <button
          onClick={() => copy(code)}
          className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded border text-xs transition-all opacity-0 group-hover:opacity-100 ${
            copied
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

interface EndpointProps {
  method: "POST" | "GET";
  path: string;
  description: string;
  requestBody?: { field: string; type: string; required: boolean; desc: string }[];
  responseExample: string;
  curlExample: string;
}

function Endpoint({ method, path, description, requestBody, responseExample, curlExample }: EndpointProps) {
  const [open, setOpen] = useState(false);
  const methodColors: Record<string, string> = {
    POST: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    GET: "bg-green-500/15 text-green-400 border-green-500/30",
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/20 transition-colors"
        data-testid={`endpoint-toggle-${path.replace(/\//g, "-")}`}
      >
        <span className={`px-2.5 py-1 rounded-md border text-xs font-bold font-mono shrink-0 ${methodColors[method]}`}>
          {method}
        </span>
        <code className="text-sm font-mono text-foreground flex-1">{path}</code>
        <span className="text-xs text-muted-foreground hidden sm:block flex-1">{description}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4 bg-muted/5">
          <p className="text-sm text-muted-foreground">{description}</p>

          {requestBody && requestBody.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Request Body (JSON)</h4>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left p-2.5 text-muted-foreground font-medium">Field</th>
                      <th className="text-left p-2.5 text-muted-foreground font-medium">Type</th>
                      <th className="text-left p-2.5 text-muted-foreground font-medium">Required</th>
                      <th className="text-left p-2.5 text-muted-foreground font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestBody.map((f) => (
                      <tr key={f.field} className="border-b border-border last:border-0">
                        <td className="p-2.5 font-mono text-foreground">{f.field}</td>
                        <td className="p-2.5 text-blue-400 font-mono">{f.type}</td>
                        <td className="p-2.5">
                          <Badge variant={f.required ? "default" : "secondary"} className="text-xs">
                            {f.required ? "required" : "optional"}
                          </Badge>
                        </td>
                        <td className="p-2.5 text-muted-foreground">{f.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">curl Example</h4>
            <CodeBlock code={curlExample} label="bash" />
          </div>

          <div>
            <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2">Response</h4>
            <CodeBlock code={responseExample} label="json" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function DevelopersPage() {
  const { user } = useAuth();
  const BASE_URL = "https://gptcdk.xyz";

  const endpoints: EndpointProps[] = [
    {
      method: "POST",
      path: "/api/v1/check",
      description: "Check the status of a CDK key — whether it is available, already used, or expired.",
      requestBody: [
        { field: "key", type: "string", required: true, desc: "The CDK key string to check." },
      ],
      curlExample: `curl -X POST ${BASE_URL}/api/v1/check \\
  -H "Authorization: Bearer sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"key": "XXXX-XXXX-XXXX-XXXX"}'`,
      responseExample: `// Available key
{
  "success": true,
  "status": "available",
  "type": "ChatGPT Plus 1 Month"
}

// Already used key
{
  "success": true,
  "status": "used",
  "message": "This key has already been activated.",
  "activatedFor": "user@example.com",
  "activatedAt": "2025-01-15T10:30:00Z"
}

// Expired key
{
  "success": true,
  "status": "expired",
  "message": "This key has expired."
}`,
    },
    {
      method: "POST",
      path: "/api/v1/redeem",
      description: "Redeem (activate) a CDK key on a ChatGPT account using a session token.",
      requestBody: [
        { field: "key", type: "string", required: true, desc: "The CDK key to activate." },
        { field: "session", type: "string", required: true, desc: "ChatGPT session JSON (from chat.openai.com/api/auth/session) or raw access token." },
      ],
      curlExample: `curl -X POST ${BASE_URL}/api/v1/redeem \\
  -H "Authorization: Bearer sk_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "key": "XXXX-XXXX-XXXX-XXXX",
    "session": "{\\"accessToken\\": \\"eyJ...\\"}"
  }'`,
      responseExample: `// Success
{
  "success": true,
  "email": "user@example.com",
  "product": "ChatGPT",
  "subscription": "ChatGPT Plus 1 Month",
  "activatedAt": "2025-01-15T10:30:00Z"
}

// Failure
{
  "success": false,
  "error": "activation_failed",
  "message": "Activation failed. Please check your session data and try again."
}`,
    },
  ];

  const errors = [
    { code: "401", error: "missing_api_key", desc: "No Authorization header provided." },
    { code: "401", error: "invalid_api_key", desc: "API key not found, revoked, or wrong format." },
    { code: "429", error: "rate_limit_exceeded", desc: "Exceeded 60 requests per minute." },
    { code: "400", error: "missing_key", desc: "The 'key' field was not provided in the request body." },
    { code: "400", error: "missing_session", desc: "The 'session' field was not provided (redeem only)." },
    { code: "500", error: "server_error", desc: "Unexpected server error. Retry after a moment." },
  ];

  return (
    <PageLayout maxWidth="max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Code2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Developer API</h1>
            <p className="text-muted-foreground text-sm">Integrate CDK key checking and redemption into your apps</p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Introduction */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">Introduction</h2>
          <div className="rounded-xl border border-border p-5 bg-muted/10 space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              The ChatGPT Recharge API lets you check CDK key status and redeem keys programmatically.
              It's designed for resellers, bots, and automation scripts that need to interact with CDK keys
              without manual intervention.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              All requests are authenticated via an API key. You can generate API keys from your{" "}
              <a href="/account" className="text-primary hover:underline font-medium">Account page</a>.
            </p>
          </div>
        </section>

        {/* Base URL */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">Base URL</h2>
          <CodeBlock code={BASE_URL} />
        </section>

        {/* Authentication */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">Authentication</h2>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              All API requests must include your API key in the <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded">Authorization</code> header:
            </p>
            <CodeBlock code={`Authorization: Bearer sk_live_your_api_key_here`} label="http" />
            <div className="flex gap-2.5 p-3.5 rounded-lg border border-amber-500/20 bg-amber-500/5">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-500">Keep your API key private</p>
                <p className="text-xs text-muted-foreground">
                  Treat your API key like a password. Never expose it in client-side code or public repositories.
                  If compromised, revoke it immediately from your Account page and generate a new one.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Endpoints */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">Endpoints</h2>
          <div className="space-y-3">
            {endpoints.map((ep) => (
              <Endpoint key={ep.path} {...ep} />
            ))}
          </div>
        </section>

        {/* Error Codes */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">Error Codes</h2>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 text-muted-foreground font-medium">HTTP</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">error field</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="p-3 font-mono text-foreground">{e.code}</td>
                    <td className="p-3 font-mono text-red-400">{e.error}</td>
                    <td className="p-3 text-muted-foreground">{e.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Rate Limits */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">Rate Limits</h2>
          <div className="rounded-xl border border-border p-5 bg-muted/10 space-y-2">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">60 requests per minute per API key</span>
            </div>
            <p className="text-sm text-muted-foreground">
              When exceeded, the API returns HTTP 429 with error <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded">rate_limit_exceeded</code>.
              The limit resets every 60 seconds. Contact support if you need a higher limit.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
          <Zap className="w-8 h-8 text-primary mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Ready to start?</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {user ? "Generate an API key from your Account page to get started." : "Create an account and generate your first API key."}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            {user ? (
              <a href="/account" data-testid="link-get-apikey">
                <Button className="gap-2">
                  <Key className="w-4 h-4" />
                  Get API Key
                </Button>
              </a>
            ) : (
              <>
                <a href="/register" data-testid="link-register-for-api">
                  <Button className="gap-2">
                    <Key className="w-4 h-4" />
                    Create Account
                  </Button>
                </a>
                <a href="/login" data-testid="link-login-for-api">
                  <Button variant="outline">Login</Button>
                </a>
              </>
            )}
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
