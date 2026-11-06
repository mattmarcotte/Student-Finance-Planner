import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { themeBootstrap } from "@/lib/theme";
import "./globals.css";
import "./workspace.css";

export const metadata: Metadata = {
  title: "Buffer — Finance Planner",
  description: "Track account balances, schedule income and expenses, and forecast balances by date.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script id="buffer-theme" dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>
        <ThemeProvider>
          <a className="skip-link" href="#main">Skip to content</a>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
