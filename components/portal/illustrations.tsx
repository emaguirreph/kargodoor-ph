/** Simple drawn examples for the Shipping Process (packaging do's and don'ts, a courier waybill on a box). */

const Box = ({ children, damaged = false }: { children?: React.ReactNode; damaged?: boolean }) => (
  <>
    <path d="M20 46 L80 30 L140 46 L80 62 Z" fill="#e2b77a" />
    <path d="M20 46 L80 62 L80 128 L20 112 Z" fill="#c98d47" />
    <path d="M80 62 L140 46 L140 112 L80 128 Z" fill="#d9a35f" />
    <path d="M48 38 L108 54 L108 60 L48 44 Z" fill="#f3dca8" opacity=".85" />
    {damaged ? <path d="M96 70 L110 84 L102 88 L118 104" stroke="#5a3311" strokeWidth="3" fill="none" /> : null}
    {children}
  </>
);

function Example({ ok, title, text, children }: { ok: boolean; title: string; text: string; children: React.ReactNode }) {
  return (
    <figure className={`pex ${ok ? "ok" : "bad"}`}>
      <svg viewBox="0 0 160 140" role="img" aria-label={title}>{children}</svg>
      <figcaption><b>{ok ? "✓" : "✗"} {title}</b><span>{text}</span></figcaption>
    </figure>
  );
}

export function PackagingExamples({ code }: { code: string }) {
  return (
    <div className="pexgrid">
      <Example ok title="Label on every carton" text={`${code}, item name, supplier's phone and your PH phone number.`}>
        <Box>
          <g transform="skewY(-15) translate(0 30)">
            <rect x="90" y="62" width="40" height="30" rx="2" fill="#fff" stroke="#111" strokeWidth="1.5" />
            <rect x="94" y="67" width="32" height="5" fill="#0b2f8a" />
            <rect x="94" y="76" width="24" height="3" fill="#888" />
            <rect x="94" y="82" width="28" height="3" fill="#888" />
          </g>
        </Box>
      </Example>
      <Example ok title="Packing list inside" text="Product name in Chinese, material, quantity, weight and the supplier's phone number.">
        <Box />
        <g transform="rotate(-8 120 60)">
          <rect x="104" y="14" width="40" height="52" rx="2" fill="#fff" stroke="#555" strokeWidth="1.5" />
          <rect x="110" y="21" width="28" height="4" fill="#0b2f8a" />
          {[31, 38, 45, 52].map((y) => <rect key={y} x="110" y={y} width="26" height="2.5" fill="#999" />)}
        </g>
      </Example>
      <Example ok title="Fragile? Wrap it well" text="Bubble wrap, corner guards and strong tape. Fill empty space so nothing moves.">
        <Box>
          {[[34, 74], [48, 88], [34, 100], [58, 102], [60, 76]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="6" fill="#e9f4ff" stroke="#9cc4ea" />)}
          <path d="M20 46 L32 49 L32 112 L20 112 Z" fill="#7a5a33" opacity=".5" />
          <path d="M128 49 L140 46 L140 112 L128 115 Z" fill="#7a5a33" opacity=".5" />
        </Box>
      </Example>
      <Example ok={false} title="Will be refused" text="No label, wrong code, or a torn, wet or crushed box.">
        <Box damaged />
        <g stroke="#d93a2b" strokeWidth="7" strokeLinecap="round"><path d="M50 48 L110 108" /><path d="M110 48 L50 108" /></g>
      </Example>
    </div>
  );
}

export function WaybillExample() {
  return (
    <figure className="pwaybill">
      <svg viewBox="0 0 320 200" role="img" aria-label="Example courier waybill sticker on a carton">
        <rect x="0" y="0" width="320" height="200" rx="10" fill="#d9a35f" />
        <rect x="140" y="0" width="40" height="200" fill="#f3dca8" opacity=".7" />
        <g transform="rotate(-3 160 100)">
          <rect x="44" y="26" width="232" height="148" rx="4" fill="#fff" stroke="#222" strokeWidth="2" />
          <rect x="44" y="26" width="232" height="26" fill="#222" />
          <text x="56" y="44" fill="#fff" fontSize="13" fontWeight="800" fontFamily="sans-serif">COURIER WAYBILL</text>
          <text x="264" y="44" fill="#fff" fontSize="11" fontWeight="700" fontFamily="sans-serif" textAnchor="end">PCS 1/1</text>
          {Array.from({ length: 34 }, (_, i) => <rect key={i} x={58 + i * 6} y="60" width={i % 3 === 0 ? 3.5 : 1.8} height="36" fill="#111" />)}
          <text x="160" y="112" fontSize="14" fontWeight="800" fontFamily="monospace" textAnchor="middle" fill="#111">SF123456789</text>
          <line x1="56" y1="122" x2="264" y2="122" stroke="#bbb" />
          <text x="56" y="140" fontSize="10" fontFamily="sans-serif" fill="#333">TO: Tongda warehouse + KDOOR-XXXX</text>
          <text x="56" y="158" fontSize="10" fontFamily="sans-serif" fill="#333">Weight: 12 kg · Total packages: 1</text>
        </g>
        <g fill="none" stroke="#d93a2b" strokeWidth="3"><rect x="66" y="98" width="190" height="22" rx="11" /></g>
      </svg>
      <figcaption>The <b>tracking / waybill number</b> is the number under the barcode on the courier sticker. Take a photo of it.</figcaption>
    </figure>
  );
}
