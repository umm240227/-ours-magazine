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
  title: "SNS OURS MAGAZINE",
  description: "SNSマーケティング特化のWebメディア",
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
