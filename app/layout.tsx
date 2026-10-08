import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kanakku – split trip expenses",
  description: "Track what a trip costs and who owes whom. Share one link with the group.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Kanakku", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
  robots: { index: false, follow: false }, // trip links are the only key, so keep them out of search engines
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1a2166" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1130" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
