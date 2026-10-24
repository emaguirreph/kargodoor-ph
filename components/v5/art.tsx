import type { CSSProperties } from "react";

/* Animated illustrations for the v5 design (static SVG markup, animated with CSS in app/v5.css). */

export const SCENES = {
sea:`<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><circle cx="320" cy="60" r="26" fill="#ffe6a0"/>
<g fill="#fff" opacity=".9"><g class="cloud"><ellipse cx="60" cy="50" rx="30" ry="10"/><ellipse cx="76" cy="43" rx="18" ry="11"/></g><g class="cloud c2"><ellipse cx="200" cy="80" rx="34" ry="10"/><ellipse cx="218" cy="72" rx="18" ry="11"/></g></g>
<g class="bobx"><path d="M110 170 h190 l-26 40 h-140 z" fill="#003b9d"/><rect x="120" y="164" width="180" height="8" fill="#00215c"/>
<rect x="132" y="138" width="30" height="26" fill="#55a430"/><rect x="164" y="138" width="30" height="26" fill="#d39a55"/><rect x="196" y="138" width="30" height="26" fill="#1356c9"/><rect x="148" y="112" width="30" height="26" fill="#d39a55"/><rect x="180" y="112" width="30" height="26" fill="#55a430"/>
<rect x="244" y="118" width="34" height="46" rx="3" fill="#fff"/><rect x="250" y="126" width="8" height="8" fill="#1356c9"/><rect x="264" y="126" width="8" height="8" fill="#1356c9"/><rect x="256" y="100" width="10" height="18" fill="#e11d48"/>
<text x="150" y="196" font-family="Poppins,sans-serif" font-weight="900" font-style="italic" font-size="14" fill="#7fd34c">KARGODOOR</text></g>
<g class="wave"><path d="M0 200 q30 -12 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 V260 H0z" fill="#1356c9" opacity=".55"/></g>
<g class="wave" style="animation-duration:6s"><path d="M0 214 q30 -10 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 V260 H0z" fill="#003b9d"/></g></svg>`,
air:`<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<g fill="#fff"><g class="cloud"><ellipse cx="60" cy="190" rx="44" ry="14"/><ellipse cx="84" cy="180" rx="26" ry="15"/></g><g class="cloud c2"><ellipse cx="120" cy="70" rx="38" ry="12"/><ellipse cx="140" cy="61" rx="22" ry="13"/></g><g class="cloud" style="animation-duration:9s;animation-delay:-4s"><ellipse cx="260" cy="220" rx="50" ry="14"/></g></g>
<path d="M20 200 Q 120 150 180 140" stroke="#fff" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round" fill="none" opacity=".9"/>
<g class="planef"><path d="M150 130 L300 118 Q330 118 336 128 Q330 138 300 138 L150 136Z" fill="#fff" stroke="#c8d6f3" stroke-width="2"/><path d="M220 126 L262 78 L278 80 L252 126Z" fill="#003b9d"/><path d="M226 136 L262 176 L276 174 L254 136Z" fill="#1356c9"/><path d="M152 132 L136 104 L150 104 L172 128Z" fill="#55a430"/><circle cx="314" cy="126" r="3" fill="#1356c9"/><rect x="184" y="124" width="100" height="5" rx="2" fill="#55a430"/></g></svg>`,
road:`<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="#bfe3a6"><circle cx="60" cy="150" r="26"/><circle cx="330" cy="140" r="34"/><circle cx="210" cy="150" r="20"/></g>
<rect x="0" y="176" width="400" height="84" fill="#2c3f66"/><g class="lane" fill="#fff" opacity=".8"><rect x="0" y="214" width="34" height="5" rx="2"/><rect x="60" y="214" width="34" height="5" rx="2"/><rect x="120" y="214" width="34" height="5" rx="2"/><rect x="180" y="214" width="34" height="5" rx="2"/><rect x="240" y="214" width="34" height="5" rx="2"/><rect x="300" y="214" width="34" height="5" rx="2"/><rect x="360" y="214" width="34" height="5" rx="2"/><rect x="420" y="214" width="34" height="5" rx="2"/></g>
<g class="truckb"><rect x="110" y="120" width="130" height="78" rx="6" fill="#fff" stroke="#dce5f2" stroke-width="2"/><rect x="110" y="182" width="130" height="10" fill="#55a430"/><text x="122" y="164" font-family="Poppins,sans-serif" font-weight="900" font-style="italic" font-size="18" fill="#003b9d">KargoDoor</text><path d="M240 140 h40 l22 28 v30 h-62z" fill="#55a430"/><path d="M252 148 h24 l14 18 h-38z" fill="#cfe3ff"/></g>
<g class="spin"><circle cx="150" cy="202" r="15" fill="#111827"/><circle cx="150" cy="202" r="6" fill="#9ca3af"/><rect x="148" y="188" width="4" height="8" fill="#4b5563"/></g>
<g class="spin"><circle cx="270" cy="202" r="15" fill="#111827"/><circle cx="270" cy="202" r="6" fill="#9ca3af"/><rect x="268" y="188" width="4" height="8" fill="#4b5563"/></g></svg>`,
source:`<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="260" fill="#eaf1fb"/>
<rect x="90" y="40" width="220" height="140" rx="12" fill="#00215c"/><rect x="100" y="50" width="200" height="120" rx="6" fill="#fff"/>
<g><rect x="112" y="62" width="54" height="46" rx="6" fill="#e7f5de"/><rect x="173" y="62" width="54" height="46" rx="6" fill="#eaf1fb"/><rect x="234" y="62" width="54" height="46" rx="6" fill="#fdf1e2"/>
<rect x="112" y="116" width="54" height="8" rx="4" fill="#dce5f2"/><rect x="173" y="116" width="54" height="8" rx="4" fill="#dce5f2"/><rect x="234" y="116" width="54" height="8" rx="4" fill="#dce5f2"/>
<rect x="180" y="140" width="40" height="18" rx="9" fill="#55a430"><animate attributeName="opacity" values="1;.5;1" dur="1.6s" repeatCount="indefinite"/></rect></g>
<path d="M70 180 h260 l-16 14 h-228z" fill="#003b9d"/>
<g class="bobx"><rect x="300" y="120" width="56" height="50" rx="4" fill="#d39a55"/><rect x="323" y="120" width="10" height="50" fill="#55a430"/><text x="306" y="162" font-family="Poppins,sans-serif" font-weight="900" font-style="italic" font-size="12" fill="#003b9d">KD</text></g>
<g class="bobx" style="animation-delay:-1.2s"><rect x="40" y="132" width="44" height="40" rx="4" fill="#ebbb7d"/><rect x="58" y="132" width="8" height="40" fill="#55a430"/></g>
<rect x="0" y="210" width="400" height="50" fill="#dce5f2"/></svg>`
} as const;

export type SceneKind = keyof typeof SCENES;

export const HERO_ROUTE = `<svg viewBox="0 0 1200 170" overflow="visible" aria-hidden="true">
      <path id="seaP" class="arc" d="M90 140 C 380 60, 820 60, 1110 130" stroke="#55a430" stroke-width="3.5" fill="none"/>
      <path id="airP" class="arc" d="M90 140 C 360 -10, 840 -10, 1110 130" stroke="#1356c9" stroke-opacity=".55" stroke-width="2.6" fill="none"/>
      <circle cx="90" cy="140" r="10" fill="#55a430"/><circle cx="90" cy="140" r="10" fill="#55a430" class="pulse-ring"/>
      <circle cx="1110" cy="130" r="10" fill="#003b9d"/><circle cx="1110" cy="130" r="10" fill="#003b9d" class="pulse-ring"/>
      <g font-family="Plus Jakarta Sans,sans-serif" font-size="21" font-weight="800" letter-spacing="2.5" text-anchor="middle">
        <rect class="lb" x="15" y="80" width="150" height="40" rx="20" fill="#fff" stroke="#dce5f2"/><text class="tc" x="90" y="108" fill="#3f8a1f">CHINA</text>
        <rect class="lb" x="1005" y="70" width="210" height="40" rx="20" fill="#fff" stroke="#dce5f2"/><text class="tp" x="1110" y="98" fill="#003b9d">PHILIPPINES</text>
      </g>
      <g><g transform="translate(-22,-26)"><path d="M4 18h40l-6 10H10z" fill="#003b9d"/><rect x="12" y="8" width="10" height="10" fill="#55a430"/><rect x="23" y="4" width="10" height="14" fill="#d39a55"/><rect x="34" y="10" width="6" height="8" fill="#1356c9"/></g><animateMotion dur="10s" repeatCount="indefinite" rotate="auto"><mpath href="#seaP"/></animateMotion></g>
      <g><g transform="translate(-18,-12)"><path d="M0 12 L30 8 L40 12 L30 16Z" fill="#1356c9"/><path d="M14 11 L22 0 L26 0 L22 11Z M14 13 L22 24 L26 24 L22 13Z" fill="#7fa6e6"/></g><animateMotion dur="5s" repeatCount="indefinite" rotate="auto"><mpath href="#airP"/></animateMotion></g>
      </svg>`;


export function Scene({ kind, className = "", style }: { kind: SceneKind; className?: string; style?: CSSProperties }) {
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: SCENES[kind] }} />;
}
