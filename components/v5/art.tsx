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

export const HERO_ROUTE = `<svg viewBox="0 0 1200 190" aria-hidden="true">
      <path id="seaP" class="arc" d="M90 150 C 380 60, 820 60, 1110 140" stroke="rgba(127,211,76,.8)" stroke-width="3" fill="none"/>
      <path id="airP" class="arc" d="M90 150 C 360 -10, 840 -10, 1110 140" stroke="rgba(255,255,255,.35)" stroke-width="2" fill="none"/>
      <circle cx="90" cy="150" r="9" fill="#7fd34c"/><circle cx="90" cy="150" r="9" fill="#7fd34c" class="pulse-ring"/>
      <circle cx="1110" cy="140" r="9" fill="#7fd34c"/><circle cx="1110" cy="140" r="9" fill="#7fd34c" class="pulse-ring"/>
      <text x="90" y="182" fill="#c8d6f3" font-family="Plus Jakarta Sans,sans-serif" font-size="15" font-weight="800" letter-spacing="2" text-anchor="middle">GUANGZHOU</text>
      <text x="1110" y="172" fill="#c8d6f3" font-family="Plus Jakarta Sans,sans-serif" font-size="15" font-weight="800" letter-spacing="2" text-anchor="middle">MALABON WAREHOUSE</text>
      <g><g transform="translate(-22,-26)"><path d="M4 18h40l-6 10H10z" fill="#fff"/><rect x="12" y="8" width="10" height="10" fill="#55a430"/><rect x="23" y="4" width="10" height="14" fill="#d39a55"/><rect x="34" y="10" width="6" height="8" fill="#1356c9"/></g><animateMotion dur="10s" repeatCount="indefinite" rotate="auto"><mpath href="#seaP"/></animateMotion></g>
      <g><g transform="translate(-18,-12)"><path d="M0 12 L30 8 L40 12 L30 16Z" fill="#fff"/><path d="M14 11 L22 0 L26 0 L22 11Z M14 13 L22 24 L26 24 L22 13Z" fill="#c8d6f3"/></g><animateMotion dur="5s" repeatCount="indefinite" rotate="auto"><mpath href="#airP"/></animateMotion></g>
    </svg>`;

export const STORY_STAGE = `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
          <defs>
            <g id="cityFar"><path d="M0 230V190h22v-20h16v30h14v-46h20v46h12v-26h22v26h18v-60h8v-10h8v10h8v60h14v-34h24v34h16v-24h18v24h20v-52h22v52h16v-30h18v30h20v-40h16v40h18v-28h22v28h16v-18h12v48z" /></g>
            <g id="cityNear"><path d="M0 250v-36h30v-24h28v60h18v-44h34v44h20v-70h26v70h16v-30h30v30h22v-56h30v56h18v-38h26v38h20v-26h30v26h12v-48h20v48z"/></g>
            <g id="clouds"><ellipse cx="60" cy="50" rx="34" ry="12"/><ellipse cx="80" cy="42" rx="22" ry="14"/><ellipse cx="250" cy="70" rx="40" ry="12"/><ellipse cx="272" cy="61" rx="22" ry="13"/></g>
          </defs>
          <circle cx="330" cy="60" r="30" fill="#ffe6a0" opacity=".9"/>
          <g class="sky1" fill="#fff" opacity=".85"><use href="#clouds"/><use href="#clouds" x="400"/></g>
          <g class="sky1" fill="#a9c6f2"><use href="#cityFar"/><use href="#cityFar" x="400"/></g>
          <g class="sky2" fill="#7fa6e6"><use href="#cityNear"/><use href="#cityNear" x="400"/></g>
          <rect x="0" y="250" width="400" height="14" fill="#55a430"/>
          <rect x="0" y="262" width="400" height="38" fill="#2c3f66"/>
          <g class="ground-dash" fill="#fff" opacity=".7"><rect x="0" y="280" width="40" height="4" rx="2"/><rect x="80" y="280" width="40" height="4" rx="2"/><rect x="160" y="280" width="40" height="4" rx="2"/><rect x="240" y="280" width="40" height="4" rx="2"/><rect x="320" y="280" width="40" height="4" rx="2"/><rect x="400" y="280" width="40" height="4" rx="2"/></g>
          <ellipse cx="230" cy="264" rx="90" ry="6" fill="#000" opacity=".2"/>
          
          <g class="legB"><path d="M178 190 V226" stroke="#00163f" stroke-width="17" stroke-linecap="round"/><g class="shinB" style="--kx:178px;--ky:226px"><path d="M178 226 V256" stroke="#00163f" stroke-width="15" stroke-linecap="round"/><path d="M172 257 h22 a5 5 0 0 1 0 8 h-24 z" fill="#111827"/></g></g>
          
          <g>
            <path d="M262 140 L292 250" stroke="#3f8a1f" stroke-width="7" stroke-linecap="round"/>
            <path d="M292 254 H338" stroke="#3f8a1f" stroke-width="6" stroke-linecap="round"/>
            <g transform="rotate(-4 315 250)">
              <rect x="294" y="208" width="44" height="44" rx="3" fill="#d39a55"/><rect x="312" y="208" width="8" height="44" fill="#55a430"/><text x="300" y="242" font-family="Poppins,sans-serif" font-weight="900" font-style="italic" font-size="11" fill="#003b9d">KD</text>
              <rect x="298" y="172" width="36" height="36" rx="3" fill="#ebbb7d"/><rect x="313" y="172" width="7" height="36" fill="#55a430"/>
            </g>
            <g class="wheel"><circle cx="292" cy="252" r="12" fill="#1f2937"/><circle cx="292" cy="252" r="5" fill="#9ca3af"/><path d="M292 242v20M282 252h20" stroke="#4b5563" stroke-width="2"/></g>
          </g>
          
          <g class="legA"><path d="M178 190 V226" stroke="#00215c" stroke-width="17" stroke-linecap="round"/><g class="shinA" style="--kx:178px;--ky:226px"><path d="M178 226 V256" stroke="#00215c" stroke-width="15" stroke-linecap="round"/><path d="M172 257 h22 a5 5 0 0 1 0 8 h-24 z" fill="#1f2937"/></g></g>
          
          <g class="bodybob">
            <path d="M206 136 L230 158 L258 144" stroke="#002a78" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <path d="M181 190 L205 132" stroke="#003b9d" stroke-width="36" stroke-linecap="round"/>
            <text x="184" y="170" font-family="Poppins,sans-serif" font-weight="900" font-style="italic" font-size="12" fill="#7fd34c" transform="rotate(-67 190 165)">KD</text>
            <path d="M210 108 l4 18" stroke="#b97a4f" stroke-width="10" stroke-linecap="round"/>
            <circle cx="220" cy="100" r="18" fill="#c68a5e"/>
            <path d="M202 99 a18 18 0 0 1 36 -2 z" fill="#55a430"/>
            <path d="M232 95 l20 3 -2 5 -20 -2 z" fill="#3f8a1f"/>
            <circle cx="229" cy="104" r="2.2" fill="#1f2937"/>
            <path d="M226 112 q4 3 8 0" stroke="#7a4a2c" stroke-width="2" fill="none" stroke-linecap="round"/>
            <path d="M208 140 L234 160 L262 142" stroke="#003b9d" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="263" cy="141" r="6.5" fill="#c68a5e"/>
          </g>
        </svg>`;

export function Scene({ kind, className = "", style }: { kind: SceneKind; className?: string; style?: CSSProperties }) {
  return <div className={className} style={style} dangerouslySetInnerHTML={{ __html: SCENES[kind] }} />;
}
