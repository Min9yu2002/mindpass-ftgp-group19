import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import GlobalNavbar from "../components/GlobalNavbar";
import ThemeToggle from "../components/ThemeToggle";

export const metadata: Metadata = {
  title: "MindPass",
  description: "Privacy-first counseling support platform MVP demo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className="text-foreground antialiased">
        <Providers>
          <GlobalNavbar />
          <div className="relative min-h-screen">{children}</div>
          <ThemeToggle />
        </Providers>
      </body>
    </html>
  );
}
