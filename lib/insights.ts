export type Insight = {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  publishedAt: string;
  icon: "package" | "ship" | "clock" | "clipboard";
  sections: Array<{
    heading: string;
    paragraphs?: string[];
    bullets?: string[];
  }>;
};

export const insights: Insight[] = [
  {
    slug: "importing-from-china-to-the-philippines",
    title: "Beginner’s Guide sa Importing from China to the Philippines",
    seoTitle: "Importing from China to the Philippines: Beginner’s Guide | KargoDoor PH",
    description:
      "Alamin ang basic process ng importing from China to the Philippines—supplier, documents, sea freight, air freight, at delivery.",
    publishedAt: "2026-09-21",
    icon: "package",
    sections: [
      {
        heading: "Simulan sa tamang impormasyon",
        paragraphs: [
          "Kung first time mong mag-importing from China to the Philippines, normal lang na maraming tanong. Ano ang unang step? Sea freight ba o air freight? Ano ang kailangan para sa shipping quotation?",
          "Mas magiging maayos ang process kung ihahanda mo ang product, supplier, at shipping details bago pa umalis ang cargo mula China.",
        ],
      },
      {
        heading: "1. Piliin at i-check ang product",
        paragraphs: [
          "Bago umorder, siguraduhing malinaw ang details ng product: ano ito, ilan ang order, magkano ang halaga, at paano ito gagamitin. Humingi sa supplier ng malinaw na larawan, sukat, timbang, materials, at packing details.",
          "May ilang product na maaaring may dagdag na requirements, gaya ng pagkain, cosmetics, medical items, chemicals, wireless devices, at ilang electrical products. Mabuting i-check muna kung may permit o clearance bago magpadala.",
        ],
      },
      {
        heading: "2. Humingi ng kumpletong details sa supplier",
        paragraphs: ["Para makakuha ng tamang shipping quotation, kailangan ang:"],
        bullets: [
          "Product name, description, at larawan",
          "Pickup address ng supplier sa China",
          "Bilang ng cartons, sukat, at timbang ng bawat carton",
          "Kabuuang cargo value",
          "Delivery address sa Pilipinas",
          "Target delivery date, kung mayroon",
        ],
      },
      {
        heading: "3. Piliin ang shipping method",
        paragraphs: [
          "Karaniwang mas bagay ang sea freight sa malalaki, mabibigat, o maraming cartons na hindi urgent. Karaniwang mas mabilis ang air freight at mas bagay sa maliit, magaan, high-value, o kailangang-kailangan agad na cargo.",
          "Kung gusto mong makatipid sa shipping cost, planuhin ang order nang mas maaga para magkaroon ng sapat na oras para sa sea freight.",
        ],
      },
      {
        heading: "4. Ihanda ang documents at delivery plan",
        paragraphs: [
          "Madalas na kailangan ang commercial invoice, packing list, at bill of lading o air waybill. Depende sa product, maaaring kailanganin din ang permit, clearance, o iba pang supporting documents.",
          "Dapat tugma ang product description, quantity, at declared value sa lahat ng documents. Ang mali o kulang na details ay maaaring magdulot ng delay sa customs processing.",
          "I-send sa KargoDoor PH ang product details, packing list, pickup address, at Philippine delivery address para sa shipping quotation.",
        ],
      },
    ],
  },
  {
    slug: "sea-freight-vs-air-freight-philippines",
    title: "Sea Freight vs. Air Freight: Alin ang Mas Bagay sa Cargo Mo?",
    seoTitle: "Sea Freight vs. Air Freight mula China papuntang Pilipinas | KargoDoor PH",
    description:
      "Alamin ang pagkakaiba ng sea freight at air freight para sa China to Philippines shipping at piliin ang tamang option para sa cargo mo.",
    publishedAt: "2026-09-21",
    icon: "ship",
    sections: [
      {
        heading: "Ano ang tamang option para sa iyo?",
        paragraphs: [
          "Isa sa pinakamahalagang desisyon sa China to Philippines shipping ay kung sea freight o air freight ang gagamitin. Walang iisang sagot para sa lahat—nakadepende ito sa sukat, timbang, halaga, at urgency ng cargo mo.",
        ],
      },
      {
        heading: "Kailan mas bagay ang sea freight?",
        paragraphs: [
          "Ang sea freight ay madalas na mas practical para sa malalaki, mabibigat, o maraming cartons na cargo. Mainam ito para sa restocking ng inventory, furniture, equipment, at bulk orders.",
          "Sa sea freight, mahalaga ang CBM o cubic meter. Ito ang sukat ng space na ginagamit ng cargo sa shipment.",
        ],
        bullets: [
          "Marami, malalaki, o mabibigat ang cartons",
          "Hindi urgent ang delivery",
          "Mas mahalaga ang mas mababang freight cost",
          "Kaya mong magplano ng inventory nang mas maaga",
        ],
      },
      {
        heading: "Kailan mas bagay ang air freight?",
        paragraphs: [
          "Ang air freight ay karaniwang mas mabilis. Mainam ito para sa samples, urgent na restocking, maliit na orders, o high-value products na kailangan agad.",
          "Tandaan: sa air freight, maaaring gamitin ang actual weight o volumetric weight sa computation, depende kung alin ang mas mataas.",
        ],
        bullets: [
          "Urgent ang delivery",
          "Maliit at magaan ang cargo",
          "Nagte-test ka pa lamang ng product",
          "Kailangan ang products para sa sale, launch, o event",
        ],
      },
      {
        heading: "Huwag freight cost lang ang ikumpara",
        paragraphs: [
          "Kapag humihingi ng shipping quotation, tingnan ang kabuuang gastos, hindi lang ang unang freight rate. Isaalang-alang ang supplier price, China pickup, freight, customs charges kung applicable, special handling, at local delivery.",
          "I-send sa KargoDoor PH ang product description, cartons, dimensions, weight, pickup location, at destination. Matutulungan ka naming ikumpara ang sea freight at air freight para sa cargo mo.",
        ],
      },
    ],
  },
  {
    slug: "china-to-philippines-shipping-time",
    title: "Gaano Katagal ang China to Philippines Shipping?",
    seoTitle: "Gaano Katagal ang China to Philippines Shipping? | KargoDoor PH",
    description:
      "Alamin kung ano ang nakaaapekto sa China to Philippines shipping time, mula supplier preparation hanggang customs at final delivery.",
    publishedAt: "2026-09-21",
    icon: "clock",
    sections: [
      {
        heading: "Hindi lang biyahe ang binibilang",
        paragraphs: [
          "Gaano katagal bago dumating ang cargo? Ito ang isa sa pinakamadalas na tanong ng mga importer. Ang total na China to Philippines shipping time ay nagsisimula sa supplier at nagtatapos sa delivery sa iyong address.",
        ],
      },
      {
        heading: "Ano ang nakaaapekto sa shipping time?",
        bullets: [
          "Supplier production: Mas mabilis kung ready stock; isama ang production period kung made-to-order.",
          "Pickup at warehouse receiving: Kailangan makarating ang cargo nang maayos ang label at documents.",
          "Shipping method: Karaniwang mas mabilis ang air freight kaysa sea freight.",
          "Consolidation schedule: Ang cargo ay maaaring pagsamahin sa ibang shipments bago umalis.",
          "Customs processing: Nag-iiba ang oras depende sa product type, documents, permits, at inspection.",
          "Final delivery: Magkaiba ang schedule para sa Metro Manila, Luzon, Visayas, at Mindanao.",
        ],
      },
      {
        heading: "Paano mabawasan ang delay?",
        bullets: [
          "Kumpirmahin kung kailan talaga ready ang products.",
          "Ibigay ang tamang product description at declared value.",
          "Siguraduhing tugma ang commercial invoice at packing list.",
          "Ipaayos ang packaging at labels bago ipadala ng supplier.",
          "I-check muna kung may permit requirements ang product.",
          "Maglaan ng extra time bago ang sale, launch, o peak season.",
        ],
      },
      {
        heading: "Magplano gamit ang delivery window",
        paragraphs: [
          "Mas ligtas na gumamit ng estimated delivery window kaysa mangako ng isang eksaktong araw. Sa ganitong paraan, mas maayos mong mapaplano ang inventory at customer orders.",
          "Para sa mas malinaw na estimate, ipadala sa KargoDoor PH ang cargo type, pickup location sa China, bilang ng cartons, dimensions, weight, at delivery address sa Pilipinas.",
        ],
      },
    ],
  },
  {
    slug: "packaging-requirements-shipping-quotation",
    title: "Packaging Requirements at Paano Humingi ng Shipping Quotation",
    seoTitle: "Packaging Requirements at Shipping Quotation mula China | KargoDoor PH",
    description:
      "Alamin ang tamang packaging requirements at mga details na kailangan para sa accurate na China to Philippines shipping quotation.",
    publishedAt: "2026-09-21",
    icon: "clipboard",
    sections: [
      {
        heading: "Bakit mahalaga ang tamang packaging?",
        paragraphs: [
          "Ang maayos na packaging ay nakakatulong protektahan ang cargo, gawing mas ligtas ang handling, at magbigay ng mas tamang shipping quotation.",
          "Bago ipadala ng supplier ang cargo mula China, siguraduhing tama ang packing, sukat, timbang, at impormasyon sa mga cartons.",
        ],
      },
      {
        heading: "Basic packaging requirements",
        paragraphs: [
          "Gumamit ng matibay na outer carton na kayang i-stack at i-handle habang nasa biyahe. Dapat maayos ang pagkaka-seal at hindi punit, basa, durog, o sobrang siksik ang laman.",
          "Para sa fragile items, gumamit ng bubble wrap, foam, dividers, corner protection, o ibang internal protection. Punan ang bakanteng space sa loob ng carton para hindi gumalaw ang product.",
          "Para sa mabibigat na items, maaaring kailanganin ang reinforced cartons, pallets, o crates. Kung may wooden packaging, i-check muna ang applicable treatment o marking requirements bago magpadala.",
        ],
      },
      {
        heading: "Details na kailangan para sa shipping quotation",
        bullets: [
          "Product description at malinaw na larawan",
          "China pickup address at Philippine delivery address",
          "Bilang ng cartons o packages",
          "Length, width, at height ng bawat carton",
          "Gross weight ng bawat carton at total weight",
          "Total cargo value",
          "Kung may batteries, liquids, magnets, chemicals, pagkain, cosmetics, o ibang special items",
          "Preferred shipping method: sea freight o air freight",
        ],
      },
      {
        heading: "Bakit dapat kumpleto ang details?",
        paragraphs: [
          "Hindi sapat ang “10 boxes lang” para makapagbigay ng maaasahang freight quote. Magkaiba ang shipping cost ng dalawang cartons depende sa sukat, timbang, product, at destinasyon.",
          "Para sa sea freight, mahalaga ang CBM. Para sa air freight, mahalaga ang actual weight at volumetric weight. Kapag kumpleto ang information, mas madali naming ma-recommend ang tamang shipping option at maipaliwanag kung ano ang kasama sa quotation.",
          "May ilang products na maaaring regulated, restricted, o may dagdag na permit requirements. Para sa product-specific permits, customs classification, duties, at taxes, kumpirmahin sa tamang Philippine government authority o qualified customs professional.",
        ],
      },
    ],
  },
];

export function getInsight(slug: string) {
  return insights.find((insight) => insight.slug === slug);
}
