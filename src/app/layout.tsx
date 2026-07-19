import type { Metadata } from "next";
import type { Viewport } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "DaStack | Docker cloud, without the overhead",
    template: "%s | DaStack",
  },
  description:
    "Deploy and operate containerized services on a focused, secure Docker cloud.",
  applicationName: "DaStack",
  robots: { index: true, follow: true },
  openGraph: {
    title: "DaStack",
    description: "Docker cloud, without the overhead.",
    type: "website",
    siteName: "DaStack",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#080a0c" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
