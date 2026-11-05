import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buffer — A little room for your future",
  description: "A simpler space for students to plan their finances, between paydays and beyond.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
