import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
