import type { ReactNode } from "react";

export const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
);

export const stepIcons = {
  SOURCE: icon(<><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6" /></>),
  SHIP: icon(<path d="M2 20c2 1 4 1 6 0s4-1 6 0 4 1 6 0M4 17l-1-5h18l-2 5M6 12V6h6v6M12 9h5v3" />),
  RECEIVE: icon(<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>),
};

export const clockIcon = icon(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>);
