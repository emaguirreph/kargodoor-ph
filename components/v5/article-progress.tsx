"use client";

import { useEffect, useState } from "react";

/** Reading progress bar and the article's section menu, which highlights the section being read. */
export function ArticleProgress({ headings }: { headings: string[] }) {
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const height = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(height > 0 ? (window.scrollY / height) * 100 : 0);
      let current = 0;
      document.querySelectorAll(".acontent section[id]").forEach((section, i) => {
        if (section.getBoundingClientRect().top < 160) current = i;
      });
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <div className="rbar" style={{ width: `${progress}%` }} aria-hidden="true" />
      {headings.length > 1 && (
        <nav className="toc" aria-label="Sections">
          {headings.map((heading, i) => (
            <a key={heading} href={`#section-${i + 1}`} className={i === active ? "on" : undefined}>{heading}</a>
          ))}
        </nav>
      )}
    </>
  );
}
