// Post library for FB Posts (Em, 2026-11-24): ready-made Facebook posts that teach and help
// importers, so the Page gets followers and shares, not only "rates" posts.
// Each item has a branded image card (public/fb-cards/<key>.png, made by
// scripts/make-fb-cards.mjs from this file) and a Taglish caption Em can edit before scheduling.
// Rates here follow lib/shipping-estimate.mjs (sea KD Mini/Lite/Plus/Standard, ₱19/kg heavy, air ₱500/kg).
// Keep this file free of imports: the card script reads it directly.

export type FbCategory = "Learning" | "Business" | "Importing" | "Rate comparison" | "Tip" | "Rates" | "Blog";

export type FbLibraryItem = {
  key: string;
  category: Exclude<FbCategory, "Blog">;
  /** Card headline (short). */
  headline: string;
  /** Big number or word on the card, optional. */
  stat?: string;
  statLabel?: string;
  /** 2 to 4 short lines on the card. */
  lines: string[];
  caption: string;
};

// No links in captions: Facebook allows only 2 link posts a month for Pages without Meta One
// (Em, 2026-11-24). The comment-to-message automation sends the rates link in Messenger instead.
const TAGS = "#KargoDoorPH #ChinaToPhilippines #Importing";

export const fbLibrary: FbLibraryItem[] = [
  // ---------- Learning ----------
  {
    key: "learning-cbm",
    category: "Learning",
    headline: "Paano i-compute ang CBM?",
    stat: "L × W × H",
    statLabel: "in meters = CBM",
    lines: ["Box: 50 × 40 × 30 cm", "0.5 × 0.4 × 0.3 = 0.06 CBM", "Sea freight is priced by CBM"],
    caption: `Ano ba talaga ang CBM? 📦

CBM = cubic meter. Ito ang sukat ng space ng cargo mo sa container.

Formula: Length × Width × Height (in meters)

Example: 50 × 40 × 30 cm na box
0.5 × 0.4 × 0.3 = 0.06 CBM

Tip: itanong sa supplier ang carton size BAGO ka magbayad, para alam mo agad ang shipping.

Comment "RATE" at isesend namin ang rates sa Messenger.

${TAGS}`,
  },
  {
    key: "learning-cargo-code",
    category: "Learning",
    headline: "Ano ang Cargo Code?",
    stat: "KDOOR-####",
    statLabel: "your cargo code",
    lines: ["Your name tag sa China warehouse", "Dapat nasa label ng bawat box", "Walang code = mahirap hanapin"],
    caption: `Ano ang Cargo Code at bakit importante? 🏷️

Pag nag-sign up ka sa KargoDoor, may sarili kang code: KDOOR-####

Ito ang ilalagay ng supplier sa label ng box mo. Dito namin nalalaman na sa'yo ang cargo pagdating sa China warehouse.

Walang code sa box = matagal hanapin, delayed ang shipment.

Laging ibigay ang code mo sa supplier kasama ng warehouse address.

Message us para makuha ang cargo code mo.

${TAGS}`,
  },
  {
    key: "learning-lcl-fcl",
    category: "Learning",
    headline: "LCL vs FCL: Ano'ng pagkakaiba?",
    lines: ["LCL: share ka sa container", "Bayad ka lang sa CBM mo", "FCL: buong container, para sa malalaking order"],
    caption: `LCL vs FCL, alin ang para sa'yo? 🚢

LCL (Less than Container Load)
Kasama ng ibang cargo ang boxes mo sa isang container. Bayad ka lang sa CBM na gamit mo. Bagay sa small at medium sellers.

FCL (Full Container Load)
Sa'yo ang buong container. Para sa malalaking order na halos puno na ang container.

Karamihan sa nagsisimula, LCL muna. Pag lumaki na ang volume, saka mag-FCL.

May FCL kang plano? Message us for a quote 📩

${TAGS}`,
  },
  {
    key: "learning-landed-cost",
    category: "Learning",
    headline: "Landed Cost: totoong puhunan mo",
    stat: "₱54/pc",
    statLabel: "sample landed cost",
    lines: ["Presyo ng item sa supplier", "+ China shipping + KargoDoor freight", "÷ number of pieces"],
    caption: `Alam mo ba ang totoong puhunan mo per piece? 🧮

Landed cost = lahat ng gastos hanggang makarating sa'yo ang item.

Item price + shipping sa China + freight to PH + delivery
Tapos i-divide sa number of pieces.

Sample computation:
100 pcs × ₱40 = ₱4,000
Freight (0.1 CBM, KD Plus) = ₱1,400
Total ₱5,400 ÷ 100 = ₱54 per piece

Diyan mo i-base ang selling price, hindi sa item price lang.

${TAGS}`,
  },
  {
    key: "learning-heavy-cargo",
    category: "Learning",
    headline: "Bakit minsan by kilo ang singil?",
    stat: "₱19/kg",
    statLabel: "for heavy sea cargo",
    lines: ["Sea freight: by CBM or weight", "Kung mabigat pero maliit, by kilo", "Halimbawa: tiles, metal parts, books"],
    caption: `Bakit minsan by kilo ang sea freight? ⚖️

Usually by CBM (laki ng box) ang sea freight.

Pero kung mabigat pero maliit ang cargo, tulad ng tiles, metal parts o libro, by weight ang computation: ₱19 per kg.

Kung alin ang mas mataas sa dalawa, yun ang singil. Fair ito para sa lahat ng nasa container.

Comment "RATE" at isesend namin ang rates sa Messenger.

${TAGS}`,
  },

  // ---------- Importing ----------
  {
    key: "importing-4-steps",
    category: "Importing",
    headline: "4 steps para mag-import from China",
    lines: ["1. Get your KDOOR cargo code", "2. Supplier ships to our China warehouse", "3. We ship sea or air to PH", "4. Pick up in Malabon or door-to-door"],
    caption: `Gusto mo mag-import from China pero di mo alam paano? Ganito lang 👇

1. Mag-sign up para makuha ang cargo code mo (KDOOR-####)
2. Ibigay sa supplier ang China warehouse address namin + code mo
3. Kami na ang bahala: sea (3–5 weeks) o air (5–7 days)
4. Pick up sa Malabon warehouse o door-to-door delivery

Kasama na sa rate ang customs clearance at taxes. Walang surprise charges.

Message us para makapagsimula.

${TAGS}`,
  },
  {
    key: "importing-box-label",
    category: "Importing",
    headline: "Ano ang dapat nakasulat sa box?",
    lines: ["KDOOR-#### (cargo code mo)", "Item name", "Supplier tracking number", "Your PH mobile number"],
    caption: `Bago mag-ship ang supplier mo, siguraduhin na kumpleto ang label ng box 📦

Dapat nakasulat:
KDOOR-#### (cargo code mo)
Item name
Supplier tracking number
PH mobile number mo

Para sa air cargo: AIR KDOOR-####

Kumpletong label = mabilis ma-receive sa warehouse at walang delay.

Questions? Message us anytime 📩

${TAGS}`,
  },
  {
    key: "importing-1688",
    category: "Importing",
    headline: "1688 kahit hindi marunong mag-Chinese",
    lines: ["Use Google Translate on the app", "Check seller rating at years", "Ask for carton size bago magbayad", "Ship to our China warehouse"],
    caption: `Gusto mo bumili sa 1688 pero Chinese lahat? Kaya mo 'to 💪

Gamitin ang translate ng browser o Google Lens sa app
Tingnan ang rating at ilang taon na ang seller
Itanong ang carton size at weight bago magbayad
Ipadala sa China warehouse namin gamit ang cargo code mo

Mas mura ang 1688 dahil factory price. Kami na sa shipping papuntang Pilipinas.

Comment "GUIDE" at isesend namin ang full guide sa Messenger.

${TAGS}`,
  },
  {
    key: "importing-warehouses",
    category: "Importing",
    headline: "Saan ang China warehouses namin?",
    lines: ["Guangzhou", "Yiwu", "Shishi", "Hong Kong and Taiwan"],
    caption: `Saan pwedeng ipadala ng supplier ang order mo? 📍

May warehouses kami sa:
Guangzhou
Yiwu
Shishi
Hong Kong
Taiwan

Piliin ang pinakamalapit sa supplier mo para mas mabilis dumating sa warehouse.

Di sigurado kung alin? Message us with your supplier's city and we'll tell you 📩

${TAGS}`,
  },
  {
    key: "importing-tracking",
    category: "Importing",
    headline: "Bakit kailangan namin ang supplier tracking no.?",
    lines: ["Para ma-match ang box sa'yo", "Mas mabilis ma-receive", "I-send sa amin pag na-ship na ng supplier"],
    caption: `Na-ship na ng supplier? I-send mo agad sa amin ang tracking number 🔎

Bakit?
Para ma-match namin agad ang box sa account mo pagdating sa warehouse
Para ma-follow up namin kung na-delay sa China courier
Para ma-update ka namin agad pag na-receive na

I-send lang sa amin sa Messenger 📩

${TAGS}`,
  },

  // ---------- Business ----------
  {
    key: "business-pricing",
    category: "Business",
    headline: "Paano mag-presyo ng imported products?",
    lines: ["Start sa landed cost", "Add platform fees + packaging", "Target 2x to 3x ng landed cost", "Check competitor prices"],
    caption: `Paano mag-presyo para may tubo talaga? 💰

1. Alamin ang landed cost per piece (item + freight + delivery)
2. Idagdag ang Shopee/Lazada fees, packaging at ads
3. Maraming sellers ang nagta-target ng 2x to 3x ng landed cost
4. I-check ang presyo ng competitors, pero wag makipag-presyuhan hanggang lugi

Ang tamang presyo: may tubo ka, at bibili pa rin ang customer.

Comment "RATE" at isesend namin ang rates sa Messenger.

${TAGS}`,
  },
  {
    key: "business-test-order",
    category: "Business",
    headline: "Test order muna bago bulk",
    lines: ["Order 5–20 pcs muna", "Check quality at sizes", "Test kung mabenta", "Saka mag-bulk order"],
    caption: `Bago ka mag-order ng 500 pcs, test order muna 🧪

Order ng 5 to 20 pieces muna
I-check ang quality, sizes at packaging
I-post at tingnan kung may bibili
Pag mabenta, saka mag-bulk order

Maliit na test = maliit na risk. Para sa small orders, may KD Mini (₱250) at KD Lite (₱750) kami.

${TAGS}`,
  },
  {
    key: "business-supplier-check",
    category: "Business",
    headline: "5 signs ng legit na supplier",
    lines: ["May years na sa platform", "Maraming reviews at photos", "Mabilis sumagot", "Nagbibigay ng carton size at weight", "Ok sa sample order"],
    caption: `Paano malaman kung legit ang supplier? ✅

1. Ilang taon na sa 1688 o Alibaba
2. Maraming reviews na may real photos
3. Mabilis at malinaw sumagot
4. Kaya magbigay ng carton size at weight
5. Pumapayag sa sample o small order

Kung iwas sumagot o sobrang mura, ingat.

Ikaw, may tips ka pa? Comment below 👇

${TAGS}`,
  },
  {
    key: "business-plan-ahead",
    category: "Business",
    headline: "Mag-stock nang maaga",
    stat: "3–5 weeks",
    statLabel: "sea freight transit",
    lines: ["Sea freight: 3–5 weeks", "Air freight: 5–7 days", "Order 6–8 weeks bago ang peak season"],
    caption: `Seller tip: wag hintayin maubos bago mag-order 📅

Sea freight: 3–5 weeks
Air freight: 5–7 days

Para sa peak seasons (pay day sales, Christmas, back to school), mag-order 6 to 8 weeks bago para dumating on time at sea freight pa rin ang gamit mo. Mas tipid.

Air lang pag urgent o maliit at mahal ang item.

${TAGS}`,
  },
  {
    key: "business-start-small",
    category: "Business",
    headline: "Maliit ang puhunan? Pwede!",
    stat: "₱250",
    statLabel: "KD Mini sea package",
    lines: ["Start sa 1 product na alam mo", "Test order lang muna", "Ship small: KD Mini or KD Lite", "Reinvest ang tubo"],
    caption: `Kahit maliit ang puhunan, pwede ka magsimula mag-import 🚀

Pumili ng 1 product na kilala mo o ginagamit mo
Test order lang muna, 5 to 20 pcs
Ship small: KD Mini (₱250) o KD Lite (₱750)
I-reinvest ang tubo sa susunod na order

Lahat ng malalaking sellers, nagsimula sa isang box.

Ask us anything, message lang 📩

${TAGS}`,
  },

  // ---------- Rate comparison ----------
  {
    key: "compare-sea-air-10kg",
    category: "Rate comparison",
    headline: "Sea vs Air: 1 box, 10 kg",
    stat: "₱750 vs ₱5,000",
    statLabel: "sea vs air",
    lines: ["Box 0.05 CBM, 10 kg", "Sea (KD Lite): ₱750, 3–5 weeks", "Air: ₱5,000, 5–7 days"],
    caption: `Sea o Air? Tingnan natin ang isang box 📦

Box: 0.05 CBM, 10 kg

Sea freight (KD Lite): ₱750
3–5 weeks

Air freight (₱500/kg): ₱5,000
5–7 days

Kung hindi urgent, sea ang pinaka-tipid. Air kung kailangan agad o samples lang.

Comment "RATE" at isesend namin ang rates sa Messenger.

${TAGS}`,
  },
  {
    key: "compare-small-parcel",
    category: "Rate comparison",
    headline: "Maliit na parcel: Sea vs Air",
    stat: "₱250 vs ₱1,000",
    statLabel: "sea vs air, 2 kg shoebox",
    lines: ["Shoebox size, about 2 kg", "Sea (KD Mini): ₱250", "Air: ₱1,000"],
    caption: `Maliit lang ang order mo? Eto ang comparison 👟

Shoebox size (up to 0.01 CBM), about 2 kg

Sea freight (KD Mini): ₱250
Air freight (2 kg × ₱500): ₱1,000

4x ang tipid sa sea kung kaya maghintay ng 3–5 weeks.

${TAGS}`,
  },
  {
    key: "compare-1cbm",
    category: "Rate comparison",
    headline: "1 CBM ng damit: Sea vs Air",
    stat: "₱7,999",
    statLabel: "1 CBM by sea",
    lines: ["1 CBM, about 150 kg", "Sea: ₱7,999", "Air: ₱75,000"],
    caption: `Bulky ang order mo? Sea freight talaga 🚢

1 CBM ng damit, about 150 kg

Sea freight: ₱7,999
Air freight (150 kg × ₱500): ₱75,000

Halos ₱67,000 ang matitipid mo. Para sa bulky items, laging sea.

Comment "RATE" at isesend namin ang rates sa Messenger.

${TAGS}`,
  },
  {
    key: "compare-packages",
    category: "Rate comparison",
    headline: "Alin ang sakto sa cargo mo?",
    lines: ["KD Mini, up to 0.01 CBM: ₱250", "KD Lite, up to 0.05 CBM: ₱750", "KD Plus, up to 0.125 CBM: ₱1,400", "KD Standard: ₱7,999 per CBM"],
    caption: `Sea freight packages namin, from small to big 📦

KD Mini: up to 0.01 CBM, ₱250
KD Lite: up to 0.05 CBM, ₱750
KD Plus: up to 0.125 CBM, ₱1,400
KD Standard: ₱7,999 per CBM (min ₱1,700)

Mabigat pero maliit? By weight, ₱19 per kg.

Kasama na ang customs clearance at taxes. Pick up sa Malabon o door-to-door.

Comment "RATE" at isesend namin ang rates sa Messenger.

${TAGS}`,
  },

  // ---------- Tips ----------
  {
    key: "tip-carton-size",
    category: "Tip",
    headline: "Itanong ito sa supplier bago magbayad",
    lines: ["Carton size (L × W × H)", "Weight per carton", "Ilang pcs per carton"],
    caption: `Quick tip bago ka magbayad sa supplier 💡

Itanong ang:
Carton size (L × W × H)
Weight per carton
Ilang pieces per carton

Dito namin ma-compute agad ang shipping mo. Walang gulat pagdating ng bill.

${TAGS}`,
  },
  {
    key: "tip-code-every-box",
    category: "Tip",
    headline: "Cargo code sa BAWAT box",
    lines: ["Hindi lang sa isang box", "Lalo na kung maraming cartons", "Iwas mixed up at delay"],
    caption: `Tip: ilagay ang cargo code sa BAWAT box, hindi lang sa isa 🏷️

Lalo na kung 3 o higit pa ang cartons. Pag may box na walang code, pwedeng mahiwalay o ma-delay.

Paalala sa supplier: "Please write KDOOR-#### on every carton."

${TAGS}`,
  },
  {
    key: "tip-photos",
    category: "Tip",
    headline: "Humingi ng photos bago i-ship",
    lines: ["Photo ng items", "Photo ng packed cartons", "Photo ng label with your code"],
    caption: `Tip: humingi ng photos sa supplier bago nila i-ship 📸

Photo ng actual items
Photo ng packed cartons
Photo ng label na may cargo code mo

May proof ka kung tama ang order, at mas madali i-match sa warehouse.

${TAGS}`,
  },
  {
    key: "tip-all-in",
    category: "Tip",
    headline: "Iwas hidden charges",
    lines: ["Itanong kung all-in ang rate", "Kasama ba ang customs at taxes?", "Magkano ang delivery?"],
    caption: `Bago mag-book sa kahit anong forwarder, itanong ito 👇

All-in na ba ang rate?
Kasama na ba ang customs clearance at taxes?
May minimum charge ba?
Magkano ang delivery sa address mo?

Sa KargoDoor, kasama na ang customs at taxes sa rate. Delivery lang ang dagdag kung door-to-door.

Comment "GUIDE" at isesend namin ang full guide sa Messenger.

${TAGS}`,
  },
  {
    key: "tip-batch-orders",
    category: "Tip",
    headline: "Sabay-sabayin ang orders",
    lines: ["Isang linggo, maraming supplier", "Iisang cargo code lahat", "Message us para ma-check"],
    caption: `Tip para makatipid: sabay-sabayin ang orders mo 🛒

Kung maraming supplier ang bibilhan mo, i-order sa parehong linggo at iisang cargo code ang gamit.

Message us bago mag-ship para ma-check namin kung pwedeng pagsamahin sa isang shipment 📩

${TAGS}`,
  },

  // ---------- Rates ----------
  {
    key: "rates-sea",
    category: "Rates",
    headline: "Sea Freight Rates",
    stat: "₱7,999",
    statLabel: "per CBM, all-in",
    lines: ["Small boxes from ₱250", "Customs and taxes included", "3–5 weeks"],
    caption: `Sea Freight, China to Philippines 🚢

₱7,999 per CBM (min ₱1,700)
Small boxes: KD Mini ₱250, KD Lite ₱750, KD Plus ₱1,400
Heavy cargo: ₱19 per kg

Kasama na ang customs clearance at taxes
3–5 weeks transit
Pick up sa Malabon o door-to-door

Comment "RATE" at isesend namin ang rates sa Messenger.

${TAGS}`,
  },
  {
    key: "rates-air",
    category: "Rates",
    headline: "Air Freight Rates",
    stat: "₱500/kg",
    statLabel: "air freight, all-in",
    lines: ["5–7 days transit", "Customs and taxes included", "Best for urgent or small items"],
    caption: `Need it fast? Air Freight ✈️

₱500 per kg
5–7 days China to Philippines
Kasama na ang customs clearance at taxes

Bagay sa samples, urgent restock at maliliit pero mahal na items.

Comment "RATE" at isesend namin ang rates sa Messenger.

${TAGS}`,
  },
  {
    key: "rates-calculator",
    category: "Rates",
    headline: "Alamin ang shipping mo in 30 seconds",
    lines: ["I-type ang size at weight", "Makikita agad ang sea at air rate", "Walang sign up"],
    caption: `Magkano ang shipping ng order mo? Alamin in 30 seconds ⏱️

1. Buksan ang rates calculator
2. I-type ang size at weight ng box
3. Makikita agad ang sea at air rate

Walang sign up needed.

Comment "RATE" at isesend namin ang rates sa Messenger.

${TAGS}`,
  },
  {
    key: "rates-door-to-door",
    category: "Rates",
    headline: "Door-to-door, China hanggang bahay mo",
    lines: ["Supplier to our China warehouse", "Sea or air to Manila", "Delivered to your door"],
    caption: `China hanggang pintuan mo 🚪

Supplier mo → China warehouse namin → Manila → bahay o store mo

Pwede rin i-pick up sa Malabon warehouse para walang delivery fee.

Kasama na ang customs at taxes sa freight rate.

Comment "RATE" at isesend namin ang rates sa Messenger.

${TAGS}`,
  },
];

/** Order of post types day by day (repeats). Blog posts come from the published articles. */
export const fbRotation: FbCategory[] = ["Learning", "Rates", "Importing", "Blog", "Tip", "Business", "Rate comparison"];

/** Caption for a Blog article post. */
export function blogCaption(title: string, description: string) {
  return `Bago sa Blog 📖

${title}

${description}

Comment "GUIDE" at isesend namin ang full guide sa Messenger.

#KargoDoorPH #ChinaToPhilippines`;
}
