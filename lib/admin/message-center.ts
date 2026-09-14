import { esc, page } from "./ui";

const templates = [
  ["👋 Welcome", `Hi! 👋 Welcome to **KargoDoor PH!** 💙💚
Simple shipping from China to the Philippines. 🇨🇳📦🇵🇭

How can we help?`],
  ["📦 Get a Quote", `Sure! 😊 Please send:

📦 Item name
📸 Item picture
🏷️ Use / Category
📏 Dimensions (L × W × H)
🔢 No. of packages
📐 Total CBM
⚖️ Total weight (kg)
📍 Supplier location
🚢 Sea or ✈️ Air

We'll check the applicable rate for you.

🧮 Calculator: https://www.kargodoorph.com/rates-calculator`],
  ["💰 How Much Is Shipping?", `Hi! 😊 Shipping rate depends on the **item category, CBM, weight, and Sea/Air freight**.

Send us your cargo details and we'll prepare an estimated quotation. 📦

*Final rate is subject to actual cargo details and warehouse inspection.*`],
  ["🚢 Sea Freight", `Best for **larger, heavier, or bulk cargo** where cost matters more than speed.

⏱️ Estimated transit: **3–5 weeks**

Send us your cargo details for a quote. 😊`],
  ["✈️ Air Freight", `Best for **smaller, lightweight, or urgent cargo**.

⏱️ Estimated transit: **5–7 days**

Send us your cargo details for a quote. 😊`],
  ["🚚 Delivery", `Delivery from our **Malabon Warehouse** can be arranged.

📦 **2 CBM+** — Free delivery within 20 km
🚚 Other locations — Delivery fee may apply

Delivery may also be arranged through Lalamove or Transportify.`],
  ["💙 How KargoDoor Works", `Simple lang!

**SOURCE → SHIP → RECEIVE**

1️⃣ Supplier sends cargo to our assigned origin warehouse using your KargoDoor cargo code.

2️⃣ KargoDoor ships it to the Philippines and handles customs clearance.

3️⃣ Pickup or delivery from our receiving warehouse.

**China to PH, made SIMPLE.** 🇨🇳➡️🇵🇭`],
  ["🔎 Track Shipment", `Sure! 📦 Send us your **KargoDoor tracking number**, or track it here:

https://www.kargodoorph.com/track`],
  ["📍 Our Origin Warehouses", `We have warehouse options in:

🇨🇳 Guangzhou
🇨🇳 Yiwu
🇨🇳 Shishi
🇭🇰 Hong Kong
🇹🇼 Taiwan

Send us your **supplier location** and we'll help determine the appropriate warehouse.`],
  ["⏳ Waiting for Supplier Details", `No worries! 😊 Once available na ang **dimensions, CBM, weight, and package details**, send them to us and we'll prepare your quotation.`],
  ["👋 Follow-up", `Hi! 👋 Following up on your China shipment inquiry.

If ready na ang cargo details, send them anytime and we'll prepare your quotation. 😊📦`],
  ["📄 Quotation Sent", `Here's your **KargoDoor PH quotation**. 😊

Please review the cargo details and estimated all-in rate. If everything looks good, message us and we'll guide you through the next step. 💙💚`],
  ["🙏 Thank You", `Thank you for choosing **KargoDoor PH!** 💙💚

**SOURCE • SHIP • RECEIVE**
China to PH, made simple.

🌐 https://www.kargodoorph.com
💬 https://m.me/KargoDoorPH
📧 support@kargodoorph.com`],
] as const;

export function messageCenterPage(user: string, canWrite = true) {
  const cards = templates.map(([title, message]) => `<section class="message-template"><div class="message-template-header"><h2>${esc(title)}</h2><button type="button" class="copy-message">Copy message</button></div><textarea readonly aria-label="${esc(title)} message">${esc(message)}</textarea></section>`).join("");
  return page("Message Center", `<p class="notice">Copy a ready-to-send reply, then paste it into Messenger, WhatsApp, or another customer chat. Review the cargo details before sending a quotation or shipping estimate.</p><div class="message-center">${cards}</div><script>document.querySelectorAll('.copy-message').forEach((button)=>button.addEventListener('click',async()=>{const textarea=button.closest('.message-template').querySelector('textarea');textarea.select();try{await navigator.clipboard.writeText(textarea.value);button.textContent='Copied!'}catch{document.execCommand('copy');button.textContent='Copied!'}setTimeout(()=>button.textContent='Copy message',1600)}))</script><style>.message-center{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.message-template{margin:0}.message-template-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.message-template-header h2{margin:0}.message-template textarea{min-height:185px;white-space:pre-wrap}.copy-message{white-space:nowrap}@media(max-width:760px){.message-center{grid-template-columns:1fr}.message-template-header{align-items:flex-start;flex-direction:column}}</style>`, user, 200, {}, canWrite);
}
