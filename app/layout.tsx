import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/navbar";

export const metadata: Metadata = {
  title: "gtm-server-deployer",
  description: "Local-first GTM Server-Side tagging infrastructure deployment tool"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="border-b bg-white">
          <Navbar />
        </header>
        {children}
      </body>
    </html>
  );
}
