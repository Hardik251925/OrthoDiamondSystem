"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n";
import { BootstrapClient } from "./BootstrapClient";
import { Footer } from "./Footer";
import { Header } from "./Header";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } }));
  return (
    <QueryClientProvider client={qc}>
      <I18nProvider>
        <BootstrapClient />
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">{children}</main>
        <Footer />
      </I18nProvider>
    </QueryClientProvider>
  );
}
