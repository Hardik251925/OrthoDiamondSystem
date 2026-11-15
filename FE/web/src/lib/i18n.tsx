"use client";
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

// English + Hindi from day one (AGENTS.md). Small dictionary provider; see PROGRESS.md for the next-intl note.
const en = {
  tagline: "Orthopaedic implants & OT kits, delivered to your operation theatre",
  emergency: "Emergency OT Order", login: "Doctor login", logout: "Log out", register: "Register as doctor", browse: "Browse catalogue",
  search: "Search screws, plates, nails, SKU…", categories: "Categories", kitsToday: "Kits available today", recent: "Recently ordered",
  cart: "Cart", orders: "My orders", profile: "Profile", notifications: "Notifications", templates: "Procedure templates", kits: "Operation kits",
  addToCart: "Add to cart", outOfStock: "Out of stock", notifyMe: "Notify me", similar: "Similar sizes in stock", pricesHidden: "Log in as an approved doctor to see prices",
  checkout: "Checkout", placeOrder: "Place order", next: "Next", back: "Back", loading: "Loading…", retry: "Retry", empty: "Nothing here yet",
  pendingTitle: "Your registration is under review", pendingBody: "Ortho Diamond verifies your Medical Council registration. You can browse the catalogue meanwhile; prices and ordering unlock after approval.",
  track: "Track", invoice: "Invoice", cancel: "Cancel order", reorder: "Reorder", callAgent: "Call agent", share: "Share tracking link", eta: "ETA",
  noClinical: "Diamond AI gives product & order help only — no clinical advice.",
};
type Dict = typeof en;
const hi: Dict = {
  tagline: "ऑर्थोपेडिक इम्प्लांट और OT किट, सीधे आपके ऑपरेशन थिएटर तक",
  emergency: "इमरजेंसी OT ऑर्डर", login: "डॉक्टर लॉगिन", logout: "लॉग आउट", register: "डॉक्टर पंजीकरण", browse: "कैटलॉग देखें",
  search: "स्क्रू, प्लेट, नेल, SKU खोजें…", categories: "श्रेणियाँ", kitsToday: "आज उपलब्ध किट", recent: "हाल के ऑर्डर",
  cart: "कार्ट", orders: "मेरे ऑर्डर", profile: "प्रोफ़ाइल", notifications: "सूचनाएँ", templates: "प्रोसीजर टेम्पलेट", kits: "ऑपरेशन किट",
  addToCart: "कार्ट में डालें", outOfStock: "स्टॉक खत्म", notifyMe: "उपलब्ध होने पर बताएं", similar: "स्टॉक में मिलते-जुलते साइज़", pricesHidden: "कीमत देखने के लिए स्वीकृत डॉक्टर के रूप में लॉगिन करें",
  checkout: "चेकआउट", placeOrder: "ऑर्डर करें", next: "आगे", back: "पीछे", loading: "लोड हो रहा है…", retry: "फिर से", empty: "अभी कुछ नहीं",
  pendingTitle: "आपका पंजीकरण समीक्षा में है", pendingBody: "ऑर्थो डायमंड आपके मेडिकल काउंसिल पंजीकरण की जाँच कर रहा है। तब तक कैटलॉग देखें; स्वीकृति के बाद कीमतें और ऑर्डर खुलेंगे।",
  track: "ट्रैक", invoice: "इनवॉइस", cancel: "ऑर्डर रद्द करें", reorder: "फिर से ऑर्डर", callAgent: "एजेंट को कॉल", share: "ट्रैकिंग लिंक शेयर", eta: "पहुँचने का समय",
  noClinical: "डायमंड AI केवल उत्पाद और ऑर्डर में मदद करता है — कोई चिकित्सीय सलाह नहीं।",
};
export type Key = keyof Dict;
type Lang = "en" | "hi";
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }>({ lang: "en", setLang: () => undefined, t: (k) => en[k] });

// Language lives in localStorage; read through useSyncExternalStore so SSR renders English and the client switches cleanly.
const readLang = (): Lang => {
  try { return localStorage.getItem("od_lang") === "hi" ? "hi" : "en"; } catch { return "en"; }
};
const subscribeLang = (cb: () => void) => {
  window.addEventListener("od-lang", cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener("od-lang", cb); window.removeEventListener("storage", cb); };
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribeLang, readLang, () => "en" as Lang);
  const setLang = (l: Lang) => {
    try { localStorage.setItem("od_lang", l); } catch { /* ignore */ }
    window.dispatchEvent(new Event("od-lang"));
  };
  const dict = lang === "hi" ? hi : en;
  return <Ctx.Provider value={{ lang, setLang, t: (k) => dict[k] }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
