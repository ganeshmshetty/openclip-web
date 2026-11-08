import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";
import LiquidGlassDefs from "./components/LiquidGlassDefs";
import Script from "next/script";
import { siteUrl } from "@/lib/site";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#090a0f" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "OpenClip",
  appleWebApp: {
    title: "OpenClip",
    capable: true,
    statusBarStyle: "default",
  },
  title: {
    default: "OpenClip — Floating Action Bar for macOS",
    template: "%s | OpenClip",
  },
  description:
    "Turn selected text into instant actions on macOS. Copy, calculate, transform text, or run custom scripts from a floating action bar. Free, fast & open source.",
  keywords: [
    "OpenClip",
    "PopClip alternative",
    "open source PopClip alternative",
    "free PopClip alternative for Mac",
    "macOS floating action bar",
    "floating popup menu macOS",
    "text selection utility Mac",
    "run scripts on selected text Mac",
    "instant text actions macOS",
    "inline calculator selected text Mac",
    "macOS text formatting tool",
    "macOS context menu actions",
    "select text do things",
    "Swift 6",
    "free open source macOS app",
  ],
  authors: [{ name: "OpenClip Team" }],
  creator: "Ganesh M",
  publisher: "OpenClip",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    title: "OpenClip — Floating Action Bar for macOS",
    description:
      "Turn selected text into instant actions on macOS. Copy, calculate, transform text, or run custom scripts from a floating action bar. Free, fast & open source.",
    url: siteUrl,
    siteName: "OpenClip",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenClip — Floating Action Bar for macOS",
    description:
      "Turn selected text into instant actions on macOS. Copy, calculate, transform text, or run custom scripts from a floating action bar. Free, fast & open source.",
  },
  verification: {
    google: "mH8cbCn7AzGqzvWakax6PkhAJyBWm0B2VIFYqbTTtjQ",
  },
  icons: {
    icon: [
      { url: '/icons/openclip-icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/openclip-icon.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "OpenClip",
              "url": siteUrl,
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "OpenClip",
              "alternateName": "OpenClip — Floating Action Bar for macOS",
              "url": `${siteUrl}/`,
              "downloadUrl": `${siteUrl}/download`,
              "image": `${siteUrl}/opengraph-image`,
              "operatingSystem": "macOS 14.0+",
              "applicationCategory": "UtilitiesApplication",
              "applicationSubCategory": "Text Utilities",
              "description": "Turn selected text into instant actions — copy, calculate, fix grammar, run scripts — from a floating action bar on macOS. Privacy-first, never touches your clipboard.",
              "offers": {
                "@type": "Offer",
                "price": "0.00",
                "priceCurrency": "USD"
              },
              "author": {
                "@type": "Person",
                "name": "Ganesh M"
              },
              "sameAs": [
                "https://github.com/ganeshmshetty/openclip"
              ]
            }),
          }}
        />

        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('openclip-theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (saved === 'dark' || (!saved && prefersDark)) {
                    document.documentElement.classList.add('dark');
                  } else if (saved === 'light') {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors duration-300">
        <LiquidGlassDefs />
        <ThemeProvider>
          {children}
        </ThemeProvider>
        {process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN ? (
          <Script
            defer
            strategy="afterInteractive"
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({
              token: process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN,
            })}
          />
        ) : null}
      </body>
    </html>
  );
}
