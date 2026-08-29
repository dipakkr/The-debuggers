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
      <body>{children}</body>
    </html>
  );
}
