/** Simple drawn examples for the Shipping Process (packaging do's and don'ts, a courier waybill on a box). */

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
