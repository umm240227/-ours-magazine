import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";

import Footer from "./components/Footer";
import Header from "./components/Header";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OURS MAGAZINE | SNSマーケティングメディア",
  description: "Instagram・TikTok・YouTube・XなどのSNSの最新情報やノウハウを発信するSNSマガジン",
  metadataBase: new URL("https://www.ours-magazine.jp"),
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    title: "OURS MAGAZINE",
    description: "Instagram・TikTok・YouTube・XなどのSNSの最新情報やノウハウを発信するSNSマガジン",
    url: "https://www.ours-magazine.jp",
    siteName: "OURS MAGAZINE",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    description: "Instagram・TikTok・YouTube・XなどのSNSの最新情報やノウハウを発信するSNSマガジン",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${notoSansJp.className} min-h-screen bg-site-bg text-gray-800 antialiased flex flex-col`}>
        <Header />
        <main className="flex-grow">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
