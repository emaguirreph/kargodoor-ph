const paths = {
  package: <><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8M7.5 5.5l9 5" /></>,
  ship: <path d="M2 20c2 1 4 1 6 0s4-1 6 0 4 1 6 0M4 17l-1-5h18l-2 5M6 12V6h6v6M12 9h5v3" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4" /></>,
};

export type InsightIcon = keyof typeof paths;

/** Animated card art for an Insights guide. */
export function InsightArt({ icon, cover }: { icon: InsightIcon; cover?: string }) {
  return (
    <div className={`iart ${icon}`} aria-hidden="true">
      {cover ? (
        <img className="icover" src={cover} alt="" />
      ) : (
        <>
          <span className="ring" />
          <span className="fb" style={{ left: "12%", top: "22%" }} />
          <span className="fb" style={{ right: "14%", bottom: "18%", animationDelay: "-3s", width: 18, height: 18 }} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[icon]}</svg>
        </>
      )}
    </div>
  );
}
