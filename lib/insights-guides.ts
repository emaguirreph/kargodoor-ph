import type { Insight } from "./insights";

// SEO guides added 2026-11. Each one targets a search Filipino importers type on Google.
export const guideInsights: Insight[] = [
  {
    slug: "paano-mag-order-sa-1688-ipadala-sa-pilipinas",
    title: "Paano Mag-order sa 1688 at Ipadala sa Pilipinas",
    seoTitle: "1688 to Philippines: Paano Mag-order at Magpadala | KargoDoor PH",
    description:
      "Step-by-step guide kung paano mag-order sa 1688 at ipadala ang items mo from China to the Philippines gamit ang China warehouse at cargo code.",
    publishedAt: "2026-11-06",
    icon: "package",
    related: ["paano-i-compute-ang-cbm", "1688-vs-alibaba-vs-taobao", "ano-ang-cargo-code"],
    sections: [
      {
        heading: "Bakit hindi diretso sa Pilipinas ang 1688?",
        paragraphs: [
          "Ang 1688 ay wholesale site para sa mga buyer sa loob ng China. Kaya mura ang presyo, pero karamihan ng sellers ay nagpapadala lang sa address na nasa China.",
          "Dito pumapasok ang forwarder. Bibigyan ka ng China warehouse address, doon ipapadala ng seller ang order mo, at ang forwarder na ang bahala sa pagpapadala papuntang Pilipinas.",
        ],
      },
      {
        heading: "1. Hanapin ang product at i-check ang seller",
        paragraphs: [
          "Gamitin ang translate ng browser o ang search by photo para mahanap ang item. Tingnan ang ratings, tagal na ng shop, at reviews ng seller bago umorder.",
        ],
        bullets: [
          "I-check ang MOQ o minimum order quantity",
          "Humingi ng sukat at timbang ng carton kung marami ang order",
          "Itanong kung ready stock o gagawin pa lang (made-to-order)",
        ],
      },
      {
        heading: "2. Kunin ang China warehouse address at cargo code",
        paragraphs: [
          "Bago ka magbayad sa seller, kunin muna sa KargoDoor PH ang tamang warehouse address at ang cargo code mo. May warehouses kami sa Guangzhou, Yiwu, Shishi, Hong Kong, at Taiwan, at sasabihin namin kung alin ang pinakamalapit sa seller mo.",
          "Ang cargo code (KDOOR XXXX para sa sea, AIR KDOOR XXXX para sa air) ang nagsasabi sa warehouse na sa iyo ang package.",
        ],
      },
      {
        heading: "3. Ilagay ang address sa order at ipa-label ang bawat box",
        paragraphs: [
          "Sa checkout ng 1688, ilagay ang warehouse address bilang delivery address. Sabihan ang seller na ilagay ang cargo code mo sa bawat box o sa remarks ng order.",
          "Kapag walang cargo code ang box, mahirap itong i-match sa iyo at maaaring ma-delay.",
        ],
      },
      {
        heading: "4. Hintayin ang arrival sa warehouse, then ship to PH",
        paragraphs: [
          "Kapag dumating na sa warehouse ang items mo, susukatin at titimbangin ito para sa final na shipping charge. Sea freight ay karaniwang 3–5 weeks, at air freight ay 5–7 days.",
          "Pagdating sa Pilipinas, puwede mong i-pick up sa Malabon warehouse namin o ipa-deliver sa address mo.",
        ],
      },
    ],
  },
  {
    slug: "paano-i-compute-ang-cbm",
    title: "Paano I-compute ang CBM (May Sample Computation)",
    seoTitle: "How to Compute CBM: Paano I-compute ang CBM ng Cargo | KargoDoor PH",
    description:
      "Alamin kung paano i-compute ang CBM ng carton mo para sa sea freight, may sample computation at tips para hindi ka ma-overcharge.",
    publishedAt: "2026-11-06",
    icon: "clipboard",
    related: ["magkano-shipping-from-china-to-philippines", "landed-cost-computation", "sea-freight-vs-air-freight-philippines"],
    sections: [
      {
        heading: "Ano ang CBM?",
        paragraphs: [
          "Ang CBM o cubic meter ay ang laki ng space na ginagamit ng cargo mo sa barko. Sa sea freight, CBM ang madalas na basehan ng shipping charge, kaya mahalagang alam mo kung paano ito i-compute.",
        ],
      },
      {
        heading: "Ang formula",
        paragraphs: [
          "Sukatin ang carton sa centimeters: haba (L) × lapad (W) × taas (H), tapos i-divide sa 1,000,000. Kapag marami ang cartons na pare-pareho ang sukat, i-multiply sa bilang ng cartons.",
        ],
        bullets: [
          "CBM ng isang carton = L × W × H (cm) ÷ 1,000,000",
          "Total CBM = CBM ng isang carton × bilang ng cartons",
        ],
      },
      {
        heading: "Sample computation",
        paragraphs: [
          "Halimbawa, may 5 cartons ka na tig-50 cm × 40 cm × 30 cm.",
        ],
        bullets: [
          "50 × 40 × 30 = 60,000",
          "60,000 ÷ 1,000,000 = 0.06 CBM bawat carton",
          "0.06 × 5 cartons = 0.30 CBM total",
          "Sa KD Standard rate na ₱7,999 per CBM: 0.30 × ₱7,999 = ₱2,399.70",
        ],
      },
      {
        heading: "Maliit lang ang box? May fixed price",
        paragraphs: [
          "Para sa maliliit na sea freight packages, hindi mo na kailangang mag-compute nang matagal. May fixed price ang KargoDoor PH ayon sa laki:",
        ],
        bullets: [
          "KD Mini: hanggang 0.01 CBM, ₱250",
          "KD Lite: hanggang 0.05 CBM, ₱750",
          "KD Plus: hanggang 0.125 CBM, ₱1,400",
          "KD Standard: higit 0.125 CBM, ₱7,999 per CBM (minimum ₱1,700)",
        ],
      },
      {
        heading: "Paano kung mabigat pero maliit?",
        paragraphs: [
          "May cargo na mabigat para sa laki nito, gaya ng metal parts, tiles, o tools. Para dito, ikinukumpara ang charge by size at by weight, at ang mas mataas ang sinusunod. Sa KargoDoor PH, ito ang KD Max na nagsisimula sa ₱19 per kg.",
          "Tip: laging sukatin ang carton mismo, hindi ang product sa loob. Ang sukat ng carton ang ginagamit sa warehouse.",
        ],
      },
    ],
  },
  {
    slug: "magkano-shipping-from-china-to-philippines",
    title: "Magkano ang Shipping from China to Philippines? (2026 Guide)",
    seoTitle: "Shipping Cost from China to Philippines 2026 | KargoDoor PH",
    description:
      "Magkano ang shipping from China to the Philippines ngayong 2026? Alamin ang sea freight at air freight rates, at ano ang kasama sa all-in na presyo.",
    publishedAt: "2026-11-06",
    icon: "ship",
    related: ["paano-i-compute-ang-cbm", "hidden-charges-sa-forwarder", "sea-freight-vs-air-freight-philippines"],
    sections: [
      {
        heading: "Depende sa laki, timbang, at bilis",
        paragraphs: [
          "Walang iisang presyo para sa lahat ng cargo. Ang shipping cost ay nakadepende sa CBM (laki), timbang, at kung sea o air freight ang gagamitin. Narito ang mga rate ng KargoDoor PH para may idea ka bago humingi ng quote.",
        ],
      },
      {
        heading: "Sea freight rates (3–5 weeks)",
        bullets: [
          "KD Mini: hanggang 0.01 CBM, ₱250",
          "KD Lite: hanggang 0.05 CBM, ₱750",
          "KD Plus: hanggang 0.125 CBM, ₱1,400",
          "KD Standard: ₱7,999 per CBM, minimum ₱1,700",
          "KD Max (mabigat na cargo): nagsisimula sa ₱19 per kg",
        ],
      },
      {
        heading: "Air freight rate (5–7 days)",
        paragraphs: [
          "Ang air freight ay ₱500 per kg. Mas mabilis ito, kaya bagay sa samples, urgent na restock, at maliliit pero mahalagang items.",
          "Halimbawa: ang 3 kg na package by air ay ₱1,500. Ang parehong maliit na box by sea ay maaaring pumasok sa KD Lite na ₱750, pero mas matagal ang dating.",
        ],
      },
      {
        heading: "Ano ang kasama sa presyo?",
        paragraphs: [
          "All-in ang rate ng KargoDoor PH mula sa assigned China warehouse hanggang sa Pilipinas. Kasama na ang:",
        ],
        bullets: [
          "International freight",
          "Customs clearance",
          "Duties at taxes",
          "Processing",
        ],
      },
      {
        heading: "Delivery sa Pilipinas",
        paragraphs: [
          "Puwede mong i-pick up ang cargo sa Malabon warehouse namin. May FREE delivery para sa shipments na 2 CBM pataas sa loob ng 20 km mula Malabon. Para sa ibang lugar, puwedeng ipa-deliver sa third-party courier o trucking, may hiwalay na delivery charge.",
          "Gusto mo ng mabilis na estimate? Gamitin ang rate calculator sa website o i-send sa amin ang sukat at timbang ng cartons mo.",
        ],
      },
    ],
  },
  {
    slug: "1688-vs-alibaba-vs-taobao",
    title: "1688 vs Alibaba vs Taobao: Alin ang Para sa Business Mo?",
    seoTitle: "1688 vs Alibaba vs Taobao: Alin ang Mas Bagay? | KargoDoor PH",
    description:
      "Pare-pareho ba ang 1688, Alibaba, at Taobao? Alamin ang pagkakaiba nila sa presyo, minimum order, at shipping para piliin ang tama sa negosyo mo.",
    publishedAt: "2026-11-06",
    icon: "package",
    related: ["paano-mag-order-sa-1688-ipadala-sa-pilipinas", "landed-cost-computation", "importing-from-china-to-the-philippines"],
    sections: [
      {
        heading: "Tatlong site, tatlong klase ng buyer",
        paragraphs: [
          "Iisang grupo ang may-ari ng tatlong ito, pero magkakaiba sila ng gamit. Ang tamang piliin ay depende kung ilan ang order mo, gaano ka kabilis kailangan, at kung komportable ka sa Chinese na website.",
        ],
      },
      {
        heading: "1688: pinakamura, pang-wholesale",
        bullets: [
          "Factory at wholesale prices, kadalasan pinakamura sa tatlo",
          "Chinese ang site, kaya kailangan ng translate",
          "Karaniwang sa loob lang ng China nagpapadala, kaya kailangan ng China warehouse address",
          "Bagay sa resellers na bulk ang order",
        ],
      },
      {
        heading: "Alibaba: English, pang-export",
        bullets: [
          "English ang site at sanay ang sellers sa international buyers",
          "Mas mataas ang presyo at kadalasan mas mataas ang MOQ",
          "Puwedeng mag-request ng custom product o sariling brand",
          "Bagay sa may malaking order o gustong mag-private label",
        ],
      },
      {
        heading: "Taobao: retail, konti lang ang order",
        bullets: [
          "Parang Shopee o Lazada ng China, puwede kahit isang piraso",
          "Mas mahal per piraso kumpara sa 1688",
          "Bagay sa samples, personal na gamit, o pag-test ng bagong product",
        ],
      },
      {
        heading: "Alinman ang piliin mo, iisa ang forwarder",
        paragraphs: [
          "Kahit saan ka bumili, puwede mong ipadala sa China warehouse ng KargoDoor PH gamit ang cargo code mo. Pagsasamahin namin ang mga package mo at ipapadala papuntang Pilipinas.",
          "Tip: magsimula sa Taobao o maliit na order sa 1688 para ma-test ang product, tapos lumipat sa bulk kapag mabenta na.",
        ],
      },
    ],
  },
  {
    slug: "ano-ang-cargo-code",
    title: "Ano ang Cargo Code at Bakit Hindi Dapat Kalimutan",
    seoTitle: "Ano ang Cargo Code sa Forwarder? | KargoDoor PH",
    description:
      "Ang cargo code ang nagsasabi sa China warehouse kung kanino ang package. Alamin kung paano ito gamitin para hindi mawala o ma-delay ang cargo mo.",
    publishedAt: "2026-11-06",
    icon: "clipboard",
    related: ["paano-mag-order-sa-1688-ipadala-sa-pilipinas", "packaging-requirements-shipping-quotation", "door-to-door-cargo-china-to-philippines"],
    sections: [
      {
        heading: "Ang cargo code ay parang pangalan ng box mo",
        paragraphs: [
          "Araw-araw, daan-daang package ang dumarating sa China warehouse mula sa iba't ibang seller. Ang cargo code ang paraan para malaman agad kung kanino ang bawat box.",
          "Sa KargoDoor PH, bawat customer ay may sariling code: KDOOR XXXX para sa sea freight at AIR KDOOR XXXX para sa air freight.",
        ],
      },
      {
        heading: "Ano ang nangyayari kapag walang code?",
        bullets: [
          "Hindi agad ma-match ang box sa iyo",
          "Maaaring ma-hold sa warehouse habang hinahanap ang may-ari",
          "Puwedeng ma-delay ang buong shipment mo",
        ],
      },
      {
        heading: "Ano ang dapat nakasulat sa label?",
        paragraphs: ["Sabihan ang seller na ilagay ito sa labas ng bawat box:"],
        bullets: [
          "Ang cargo code mo (hal. KDOOR 1234)",
          "Pangalan ng item",
          "Phone number ng seller o supplier",
          "Ang Philippine phone number mo",
        ],
      },
      {
        heading: "Tips para hindi magkamali",
        bullets: [
          "Ibigay ang code sa seller bago ka magbayad, hindi pagkatapos",
          "Ilagay din ang code sa remarks o notes ng order",
          "Kung marami kang seller, pare-pareho ang code mo sa lahat",
          "Para sa air freight, siguraduhing may AIR sa unahan ng code",
          "I-send sa amin ang tracking number ng seller para ma-monitor namin",
        ],
      },
    ],
  },
  {
    slug: "landed-cost-computation",
    title: "Landed Cost: Paano Malaman ang Totoong Puhunan Bawat Piraso",
    seoTitle: "Landed Cost Computation para sa China Imports | KargoDoor PH",
    description:
      "Akala mo ₱20 lang ang puhunan, pero magkano talaga pagdating sa Pilipinas? Alamin kung paano i-compute ang landed cost para tama ang presyo mo.",
    publishedAt: "2026-11-06",
    icon: "clipboard",
    related: ["paano-i-compute-ang-cbm", "magkano-shipping-from-china-to-philippines", "1688-vs-alibaba-vs-taobao"],
    sections: [
      {
        heading: "Hindi lang presyo sa 1688 ang puhunan mo",
        paragraphs: [
          "Maraming reseller ang nagpe-presyo base lang sa nakita nilang presyo sa supplier. Pagdating ng cargo, saka nila nalalaman na manipis pala ang kita. Ang landed cost ay ang totoong gastos bawat piraso hanggang makarating sa kamay mo.",
        ],
      },
      {
        heading: "Ang formula",
        bullets: [
          "Item price (lahat ng piraso)",
          "+ China local shipping (seller papuntang warehouse)",
          "+ International shipping (forwarder)",
          "+ Local delivery sa Pilipinas, kung meron",
          "÷ bilang ng piraso = landed cost bawat piraso",
        ],
      },
      {
        heading: "Sample computation",
        paragraphs: ["Halimbawa, umorder ka ng 200 pirasong phone case:"],
        bullets: [
          "Item price: 200 × ₱20 = ₱4,000",
          "China local shipping: ₱150",
          "Sea freight (KD Lite, 0.05 CBM): ₱750",
          "Total: ₱4,900",
          "₱4,900 ÷ 200 = ₱24.50 bawat piraso",
        ],
      },
      {
        heading: "Paano mag-presyo pagkatapos",
        paragraphs: [
          "Kapag alam mo na ang landed cost, saka ka magdagdag ng kita. Isama rin sa isip ang platform fees, packaging, at posibleng sirang items para hindi ka malugi.",
          "Tip: mas malaki ang order, mas maliit ang shipping bawat piraso. Kung mabenta ang item, mas tipid ang mas malaking batch by sea.",
          "Kailangan mo ng shipping cost para sa computation mo? I-send ang sukat at timbang ng cartons at bibigyan ka namin ng quote.",
        ],
      },
    ],
  },
  {
    slug: "hidden-charges-sa-forwarder",
    title: "Hidden Charges sa Forwarder: 5 Tanong Bago Ka Mag-book",
    seoTitle: "Hidden Charges sa Cargo Forwarder: 5 Tanong Bago Mag-book | KargoDoor PH",
    description:
      "Iwasan ang surprise na singil pagdating ng cargo. Ito ang 5 tanong na dapat mong itanong sa forwarder bago ka mag-book ng shipment from China.",
    publishedAt: "2026-11-06",
    icon: "clipboard",
    related: ["magkano-shipping-from-china-to-philippines", "door-to-door-cargo-china-to-philippines", "landed-cost-computation"],
    sections: [
      {
        heading: "Mura sa umpisa, mahal sa dulo",
        paragraphs: [
          "Karaniwang reklamo ng importers: mababa ang quote sa umpisa, pero pagdating ng cargo, may dagdag na singil na hindi nabanggit. Para maiwasan ito, itanong ang mga ito bago ka mag-book.",
        ],
      },
      {
        heading: "1. Kasama na ba ang customs clearance, duties, at taxes?",
        paragraphs: [
          "Ito ang pinakamalaking source ng surprise na singil. Itanong kung all-in ang rate o hiwalay pa ang customs at taxes.",
        ],
      },
      {
        heading: "2. May minimum charge ba?",
        paragraphs: [
          "Kahit maliit ang box mo, may forwarder na may minimum. Mas mabuting alam mo ito bago ka magpadala ng maliit na order.",
        ],
      },
      {
        heading: "3. Paano kinukuha ang final na sukat at timbang?",
        paragraphs: [
          "Itanong kung sa warehouse ba susukatin at kung by size o by weight ang singil. Dapat malinaw kung bakit nagbago ang presyo kumpara sa estimate.",
        ],
      },
      {
        heading: "4. May storage fee ba kapag hindi agad na-pick up?",
        paragraphs: [
          "May mga warehouse na naniningil kapag matagal bago kinuha ang cargo. Alamin kung ilang araw ang libre.",
        ],
      },
      {
        heading: "5. Magkano ang delivery hanggang sa address ko?",
        paragraphs: [
          "Iba ang presyo hanggang warehouse sa Pilipinas at iba ang hanggang pintuan mo. Itanong kung may delivery fee at saan ang pickup point.",
        ],
      },
      {
        heading: "Ang sagot ng KargoDoor PH",
        bullets: [
          "All-in ang rate: freight, customs clearance, duties, taxes, at processing",
          "Malinaw na rates: KD Mini ₱250, KD Lite ₱750, KD Plus ₱1,400, KD Standard ₱7,999/CBM",
          "Final charge base sa sukat at timbang sa warehouse, at ipinapakita namin kung by size o by weight",
          "Pickup sa Malabon, at FREE delivery para sa 2 CBM pataas sa loob ng 20 km",
        ],
      },
    ],
  },
  {
    slug: "door-to-door-cargo-china-to-philippines",
    title: "Door-to-Door Cargo: Paano Gumagana mula China Hanggang Bahay Mo",
    seoTitle: "Door to Door Cargo from China to Philippines | KargoDoor PH",
    description:
      "Paano gumagana ang door-to-door cargo from China to the Philippines? Alamin ang bawat step mula sa supplier hanggang sa delivery sa address mo.",
    publishedAt: "2026-11-06",
    icon: "ship",
    related: ["paano-mag-order-sa-1688-ipadala-sa-pilipinas", "ano-ang-cargo-code", "china-to-philippines-shipping-time"],
    sections: [
      {
        heading: "Isang forwarder, buong biyahe",
        paragraphs: [
          "Sa door-to-door cargo, hindi mo na kailangang kausapin ang iba't ibang tao para sa bawat step. Ang forwarder na ang bahala mula sa China warehouse hanggang makarating ang cargo sa Pilipinas, at puwede pang ipa-deliver sa address mo.",
        ],
      },
      {
        heading: "Ang mga step",
        bullets: [
          "1. Humingi ng quote: i-send ang item, dami, sukat, at timbang",
          "2. Kunin ang China warehouse address at cargo code mo",
          "3. Ipadala ng supplier sa warehouse, may cargo code sa bawat box",
          "4. Susukatin at titimbangin sa warehouse, at makakatanggap ka ng final na bill",
          "5. Magbayad, at aalis na ang cargo: sea 3–5 weeks, air 5–7 days",
          "6. Customs clearance sa Pilipinas, kasama na sa rate",
          "7. Pick up sa Malabon o ipa-deliver sa address mo",
        ],
      },
      {
        heading: "Paano mo malalaman kung nasaan na ang cargo?",
        paragraphs: [
          "Bawat shipment ay may tracking number (KDSEA o KDAIR). Puwede mo itong i-check sa Track page ng website o sa MY KargoDoorPH portal, kung saan makikita mo rin ang bill at payment status.",
        ],
      },
      {
        heading: "Delivery options",
        bullets: [
          "Pickup sa Malabon warehouse",
          "FREE delivery para sa 2 CBM pataas sa loob ng 20 km mula Malabon",
          "Delivery sa ibang lugar gamit ang third-party courier o trucking, may hiwalay na singil",
        ],
      },
      {
        heading: "Handa ka na?",
        paragraphs: [
          "Puwede kang mag-book ng shipment sa website o makipag-chat sa amin para sa quote. Sasabihin namin kung sea o air ang mas tipid para sa cargo mo.",
        ],
      },
    ],
  },
  {
    slug: "pinduoduo-to-philippines-forwarder",
    title: "Pinduoduo to Philippines: Kailangan Mo Ba ng Forwarder?",
    seoTitle: "Pinduoduo Forwarder Philippines: Pros, Cons, at Paano Pumili | KargoDoor PH",
    description:
      "Gusto mong umorder sa Pinduoduo pero paano ito makakarating sa Pilipinas? Ikumpara ang forwarder, pabili, kakilala sa China, at local seller, at alamin kung ano ang hahanapin sa forwarder.",
    publishedAt: "2026-11-10",
    icon: "package",
    related: ["paano-mag-order-sa-1688-ipadala-sa-pilipinas", "ano-ang-cargo-code", "landed-cost-computation"],
    sections: [
      {
        heading: "Mura sa Pinduoduo, pero paano ito darating sa iyo?",
        paragraphs: [
          "Isa ang Pinduoduo sa pinakamurang shopping apps sa China, kaya maraming Pinoy resellers ang nag-aabang dito ng stocks. Ang problema: karamihan ng sellers ay nagde-deliver lang sa loob ng China.",
          "May ilang listings na ngayon na puwedeng ipadala diretso sa Pilipinas, pero hindi lahat, at bawat seller ay hiwalay na nagpapadala. Matagal din ito kadalasan. Kaya kung ilang items mula sa iba't ibang shops ang bibilhin mo, kailangan mo pa rin ng paraan para pagsamahin at ipadala ang mga ito.",
        ],
      },
      {
        heading: "4 na paraan para makuha ang Pinduoduo order mo",
        bullets: [
          "Forwarder: ikaw ang bibili sa app, ipapadala ng seller sa China warehouse ng forwarder, at sila ang magpapadala sa Pilipinas. Bagay sa maramihang order at sa resellers.",
          "Pabili o buying agent: sila ang bibili at magbabayad para sa iyo. Bagay kung ayaw mong humawak ng app, pero may dagdag na service fee bukod pa sa shipping.",
          "Kakilala o kamag-anak sa China: puwede sa paminsan-minsang box, pero nakadepende sa oras nila, at ikaw pa rin ang aayos ng padala at customs.",
          "Local seller sa Shopee, Lazada, o Facebook: pinakamabilis kung isa o dalawang piraso lang ang kailangan mo, pero may patong na sila at limitado ang pagpipilian.",
        ],
      },
      {
        heading: "Bakit forwarder ang madalas piliin ng resellers",
        bullets: [
          "Presyong pang-China ang nakukuha mo. Item price plus shipping lang, walang patong ng ibang reseller.",
          "Kahit anong shop sa Pinduoduo, puwede. Hindi ka limitado sa items na pinili ng ibang nagbebenta.",
          "Isang shipment para sa maraming sellers. Naiipon sa warehouse ang mga parcel mo gamit ang cargo code, kaya sabay-sabay silang bumibiyahe at mas tipid.",
          "Kasama na ang customs. Sa all-in rate, wala nang gulat na duties o taxes pagdating sa Pilipinas.",
          "Lumalaki kasama ng negosyo mo. Pareho ang proseso, maliit man o malaking order.",
        ],
      },
      {
        heading: "Ang mga kailangan mong tanggapin",
        bullets: [
          "Ikaw ang mag-o-order. Chinese ang app at kadalasan kailangan ng Chinese payment gaya ng Alipay o WeChat Pay.",
          "Mahirap ang return. Kapag nakaalis na ng China ang item, halos hindi na praktikal ibalik sa seller. Ayusin ang problema habang nasa China pa ang parcel.",
          "Hindi sulit ang isang murang piraso. May minimum charge ang shipping, kaya mas tipid kapag pinagsama-sama mo ang orders.",
          "Mas matagal kaysa local order. Bilangin ang delivery ng seller papunta sa warehouse, plus ang biyahe by sea o by air.",
          "May bawal pa rin. Hindi puwedeng ipadala ang peke o counterfeit, at may mga item na kailangan ng permit. Magtanong muna bago bumili.",
        ],
      },
      {
        heading: "Alin ang bagay sa iyo?",
        paragraphs: [
          "Kung maramihan ang bibilhin mo, pang-resell, o regular kang umo-order: forwarder. Kung ayaw mo talagang humawak ng app at OK lang magbayad ng dagdag para sa convenience: pabili. Kung isa o dalawang item lang at kailangan mo na agad: local seller.",
          "Para patas ang paghahambing, kunin ang total na gastos ng parehong basket sa bawat option: presyo ng item, shipping, at lahat ng fees. Makakatulong ang landed cost guide namin dito.",
        ],
      },
      {
        heading: "Checklist bago ka pumili ng Pinduoduo forwarder",
        bullets: [
          "May sariling warehouse sa China, at malinaw kung alin ang pinakamalapit sa seller mo",
          "May cargo code system para siguradong sa iyo mapupunta ang bawat parcel",
          "Nakasulat at all-in ang rates, kasama ang customs, duties, at taxes",
          "Sinusukat at tinitimbang sa warehouse, at ipinapakita kung bakit ganoon ang final na singil",
          "May tracking at malinaw na pickup o delivery sa Pilipinas",
          "Totoong negosyo na puwede mong i-verify at makausap bago ka magbayad",
        ],
      },
      {
        heading: "Paano ito ginagawa ng KargoDoor PH",
        bullets: [
          "China warehouses sa Guangzhou, Yiwu, Shishi, Hong Kong, at Taiwan. Sasabihin namin kung saan dapat ipadala ng seller.",
          "Sariling cargo code (KDOOR XXXX para sa sea, AIR KDOOR XXXX para sa air) na ilalagay mo sa bawat order",
          "Susukatin at titimbangin ang parcels sa warehouse bago ka bigyan ng final na bill",
          "All-in rates: freight, customs clearance, duties, at taxes. Sea freight 3–5 weeks, air freight 5–7 days.",
          "Tracking number at bill na makikita mo sa MY KargoDoorPH portal",
          "Pickup sa Malabon, o FREE delivery para sa 2 CBM pataas sa loob ng 20 km",
        ],
      },
      {
        heading: "Mabilis na sagot sa karaniwang tanong",
        paragraphs: [
          "Kailangan ba talaga ng forwarder para sa Pinduoduo? Hindi palagi. Kung may direct shipping ang listing at hindi ka nagmamadali, puwede na iyon. Pero kung galing sa iba't ibang shops ang order mo, o walang Philippine shipping ang item, forwarder ang pinakapraktikal.",
          "Mas mura ba ang forwarder kaysa pabili? Kadalasan oo, kung kaya mong mag-order mismo, dahil shipping lang ang babayaran mo at walang service fee sa pagbili.",
          "Puwede bang isang item lang? Puwede, pero mas sulit kapag pinagsama mo ang ilang orders sa isang shipment.",
          "Handa ka nang umorder? Mag-chat sa amin o mag-book ng shipment sa website para makuha ang warehouse address at cargo code mo bago ka mag-checkout sa Pinduoduo.",
        ],
      },
    ],
  },
];
