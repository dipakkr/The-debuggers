import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Adversarial Fraud Arena",
  description:
    "An AI red team evolves synthetic payment fraud against a live fraud defense. A deterministic referee proves every result.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
