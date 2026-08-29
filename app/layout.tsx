import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Adversarial Fraud Arena — AI Defense Lab for Payment Security",
  description:
    "An AI red team evolves synthetic payment fraud against a live fraud defense. A deterministic referee proves every result. Mastercard Innovation Challenge 2026, Team The debuggers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* Browser extensions commonly inject attributes onto <body> before React
          hydrates (ColorZilla's cz-shortcut-listen, password managers, and so
          on), which React reports as a hydration mismatch. Scoping the
          suppression to <body> silences that without hiding a genuine mismatch
          anywhere inside the app. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
