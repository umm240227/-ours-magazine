"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MobileCard = {
  id: number;
  title: string;
  image: string;
};

type MobileNewArticlesSliderProps = {
  cards: MobileCard[];
};

export default function MobileNewArticlesSlider({ cards }: MobileNewArticlesSliderProps) {
  const [mobileSlideIndex, setMobileSlideIndex] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setMobileSlideIndex((prevIndex) => (prevIndex + 1) % cards.length);
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [cards.length]);

  return (
    <div className="overflow-hidden rounded-lg shadow-sm ring-1 ring-slate-200">
      <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${mobileSlideIndex * 100}%)` }}>
        {cards.map((card) => (
          <Link
            key={card.id}
            href={`/articles/post-${card.id}`}
            className="block w-full shrink-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
          >
            <article>
              <div
                role="img"
                aria-label={`${card.title}のダミー画像`}
                className="relative aspect-[16/10] w-full bg-cover bg-center"
                style={{ backgroundImage: `url('${card.image}')` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <h3 className="absolute bottom-3 left-3 right-3 text-sm font-bold leading-snug text-white">{card.title}</h3>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}
