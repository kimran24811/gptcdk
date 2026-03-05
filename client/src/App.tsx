import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import RedeemPage from "@/pages/redeem";
import BatchCheckPage from "@/pages/batch-check";
import ShopPage from "@/pages/shop";

function Router() {
  return (
    <Switch>
      <Route path="/" component={RedeemPage} />
      <Route path="/batch" component={BatchCheckPage} />
      <Route path="/shop" component={ShopPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
