import type { Metadata } from "next";
import React from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proposal Assistant — AI In-Situ RFP Response Generator",
  description:
    "AI-powered proposal assistant providing grounded in-situ response generation for Excel RFP documents with 100% fidelity.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
