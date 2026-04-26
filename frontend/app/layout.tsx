import type { Metadata } from "next";
import { Syne } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import GlobalNavbar from "../components/GlobalNavbar";
import ThemeToggle from "../components/ThemeToggle";

const themeInitScript = `
  (() => {
    try {
      const root = document.documentElement;
      const storedTheme =
        window.localStorage.getItem("theme") ||
        window.localStorage.getItem("mindpass-theme");
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
      const resolvedTheme =
        storedTheme === "light" || storedTheme === "dark"
          ? storedTheme
          : systemTheme;

      root.classList.remove("light", "dark");
      root.classList.add(resolvedTheme);
      root.style.colorScheme = resolvedTheme;
    } catch {}
  })();
`;

const syne = Syne({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-syne",
});

export const metadata: Metadata = {
  title: "MindPass",
  description: "Privacy-first counseling support platform MVP demo.",
  icons: {
    icon: "/vercel.svg",
    shortcut: "/vercel.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${syne.variable} text-foreground antialiased`}>
        <Providers>
          <GlobalNavbar />
          <div className="relative min-h-screen">{children}</div>
          <ThemeToggle />
        </Providers>
      </body>
    </html>
  );
}
