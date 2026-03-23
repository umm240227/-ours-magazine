"use client";

import { Menu, Search, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const navItems = [
  { label: "Instagram", slug: "instagram" },
  { label: "TikTok", slug: "tiktok" },
  { label: "X（Twitter）", slug: "x" },
  { label: "YouTube", slug: "youtube" },
  { label: "SNS運用", slug: "sns" },
];

function SearchForm({ compact = false }: { compact?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <form action="/search" className="flex items-center gap-2">
      <button
        type="button"
        aria-label="検索"
        onClick={() => setIsOpen((prev) => !prev)}
        onFocus={() => setIsOpen(true)}
        className="rounded-full border border-slate-300 p-2 text-brand-primary"
      >
        <Search className="h-5 w-5" />
      </button>
      {isOpen && (
        <input
          ref={inputRef}
          type="text"
          name="q"
          placeholder="キーワードを入力"
          className={`rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-brand-primary placeholder:text-brand-primary/50 focus:outline-none ${
            compact ? "w-40" : "w-56"
          }`}
        />
      )}
    </form>
  );
}

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [isMobileMenuOpen]);

  return (
    <>
      <header className="fixed top-0 z-50 w-full border-b border-gray-200 bg-white lg:hidden">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center text-sm font-extrabold tracking-[0.12em] text-brand-primary">
            SNS <span className="mx-1 rounded-sm bg-brand-accent px-1.5 py-0.5 text-brand-primary">OURS</span> MAGAZINE
          </Link>
          <div className="flex items-center gap-3">
            <SearchForm compact />
            <button
              type="button"
              aria-label="メニューを開く"
              onClick={() => setIsMobileMenuOpen(true)}
              className="flex items-center text-brand-primary"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-white lg:hidden">
          <div className="flex h-full flex-col px-6 pb-8 pt-5 opacity-100 transition-opacity duration-200">
            <div className="flex justify-end">
              <button
                type="button"
                aria-label="メニューを閉じる"
                onClick={() => setIsMobileMenuOpen(false)}
                className="rounded-full p-2 text-brand-primary transition-colors hover:bg-slate-100"
              >
                <X className="h-7 w-7" />
              </button>
            </div>

            <nav className="mt-10 flex flex-col gap-7 text-3xl font-bold text-brand-primary">
              {navItems.map((item) => (
                <Link
                  key={item.slug}
                  href={`/category/${item.slug}`}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="transition-opacity hover:opacity-70"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 hidden w-full border-b border-gray-200 bg-white lg:block">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="flex items-center text-base font-extrabold tracking-[0.12em] text-brand-primary sm:text-lg">
            SNS <span className="mx-1 rounded-sm bg-brand-accent px-1.5 py-0.5 text-brand-primary">OURS</span> MAGAZINE
          </Link>
          <div className="flex items-center gap-4 lg:pr-2">
            <nav className="hidden items-center gap-6 text-sm font-medium text-brand-primary lg:flex">
              {navItems.map((item) => (
                <Link
                  key={item.slug}
                  href={`/category/${item.slug}`}
                  className="border-b-2 border-transparent transition-colors hover:border-brand-primary hover:text-brand-primary/80"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <SearchForm />
          </div>
        </div>
      </header>
    </>
  );
}
