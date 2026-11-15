"use client";
import Link from "next/link";
import { publicFile } from "@/lib/config";
import { useI18n } from "@/lib/i18n";

/** Founder / owner block — Bootstrap grid + card. */
export function FounderSection() {
  const { lang } = useI18n();
  return (
    <section className="py-2">
      <div className="card border-0 shadow-sm overflow-hidden rounded-4">
        <div className="row g-0 align-items-stretch">
          <div className="col-12 col-md-4">
            <img src={publicFile("/owner/rakesh-maradiya.jpg")} alt="Rakesh Maradiya, Founder & Owner of Ortho Diamond" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", minHeight: 320, maxHeight: 460, display: "block" }} />
          </div>
          <div className="col-12 col-md-8">
            <div className="card-body p-4 p-lg-5 d-flex flex-column h-100 justify-content-center">
              <span className="badge rounded-pill text-bg-info align-self-start mb-3">{lang === "hi" ? "संस्थापक" : "Meet our founder"}</span>
              <h2 className="fs-2 fw-bold text-primary mb-1">Rakesh Maradiya</h2>
              <div className="text-secondary mb-3">{lang === "hi" ? "संस्थापक एवं मालिक, ऑर्थो डायमंड, इंदौर" : "Founder & Owner, Ortho Diamond, Indore"}</div>
              <p className="mb-3">
                {lang === "hi"
                  ? "ऑर्थो डायमंड का एक ही वादा है — किसी भी मरीज़ की सर्जरी इम्प्लांट के इंतज़ार में न रुके। हर नया ऑर्डर सीधे राकेश जी के WhatsApp पर पहुँचता है, और इमरजेंसी ऑर्डर सबसे पहले भेजे जाते हैं।"
                  : "Ortho Diamond has one promise: no patient's surgery should wait for an implant. Every new order reaches Rakesh ji directly on WhatsApp, and emergency OT orders are dispatched first."}
              </p>
              <div className="row row-cols-1 row-cols-sm-3 g-2 mb-4">
                {[["⚡", lang === "hi" ? "इमरजेंसी पहले" : "Emergency first"], ["📍", lang === "hi" ? "लाइव ट्रैकिंग" : "Live tracking"], ["🧰", lang === "hi" ? "लोन किट" : "Loan OT kits"]].map(([i, l]) => (
                  <div className="col" key={l}><div className="border rounded-3 p-2 text-center small fw-semibold bg-light">{i} {l}</div></div>
                ))}
              </div>
              <div className="d-flex flex-wrap gap-2">
                <Link href="/register" className="btn btn-primary px-4">{lang === "hi" ? "डॉक्टर पंजीकरण" : "Register as doctor"}</Link>
                <Link href="/search?q=" className="btn btn-outline-primary px-4">{lang === "hi" ? "कैटलॉग देखें" : "Browse catalogue"}</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const SLIDES = [
  { title: "Emergency OT supply, 24×7", body: "Mark an order EMERGENCY and it jumps the queue — the owner is alerted instantly and an agent is dispatched first.", c1: "#0b2545", c2: "#13c4e3" },
  { title: "Every size, every material", body: "Cortical, locking and cannulated screws, LCP / DCP plates, nails and K-wires in stainless steel and titanium.", c1: "#13315c", c2: "#0e7c99" },
  { title: "Track your delivery live", body: "Watch the agent on the map with ETA until the implants reach your operation theatre.", c1: "#0b2545", c2: "#ff6b4a" },
];

/** Bootstrap carousel (static marketing slides — no business data). */
export function WhyCarousel() {
  return (
    <div id="whyCarousel" className="carousel slide rounded-4 overflow-hidden shadow-sm" data-bs-ride="carousel" data-bs-interval="4500">
      <div className="carousel-indicators">
        {SLIDES.map((s, i) => <button key={s.title} type="button" data-bs-target="#whyCarousel" data-bs-slide-to={i} className={i === 0 ? "active" : ""} aria-current={i === 0} aria-label={s.title} />)}
      </div>
      <div className="carousel-inner">
        {SLIDES.map((s, i) => (
          <div key={s.title} className={`carousel-item ${i === 0 ? "active" : ""}`}>
            <div className="d-flex align-items-center" style={{ minHeight: 220, padding: "0 15%", background: `linear-gradient(135deg, ${s.c1}, ${s.c2})` }}>
              <div className="text-white py-4" style={{ maxWidth: 640 }}>
                <h3 className="fs-3 fw-bold mb-2">{s.title}</h3>
                <p className="mb-0 opacity-75">{s.body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className="carousel-control-prev" type="button" data-bs-target="#whyCarousel" data-bs-slide="prev"><span className="carousel-control-prev-icon" aria-hidden="true" /><span className="visually-hidden">Previous</span></button>
      <button className="carousel-control-next" type="button" data-bs-target="#whyCarousel" data-bs-slide="next"><span className="carousel-control-next-icon" aria-hidden="true" /><span className="visually-hidden">Next</span></button>
    </div>
  );
}

const FAQ = [
  ["Who can see prices and order?", "Doctors approved by Ortho Diamond after Medical Council verification, and registered hospital purchase desks. Everyone else can browse the catalogue without prices."],
  ["How fast is an emergency delivery?", "Emergency orders are accepted and dispatched first. You can see the agent live on the map with an ETA from the moment it leaves the warehouse."],
  ["What is a loan kit?", "A sterilised instrument and implant tray lent for one surgery. After surgery it is collected; only the implants you used are billed."],
  ["Which payment options are available?", "Hospital credit (as per your hospital's terms), pay on delivery, or UPI."],
];

/** Bootstrap accordion FAQ. */
export function FaqAccordion() {
  return (
    <div className="accordion shadow-sm rounded-4 overflow-hidden" id="faq">
      {FAQ.map(([q, a], i) => (
        <div className="accordion-item" key={q}>
          <h3 className="accordion-header">
            <button className={`accordion-button fw-semibold ${i ? "collapsed" : ""}`} type="button" data-bs-toggle="collapse" data-bs-target={`#faq-${i}`} aria-expanded={i === 0} aria-controls={`faq-${i}`}>{q}</button>
          </h3>
          <div id={`faq-${i}`} className={`accordion-collapse collapse ${i === 0 ? "show" : ""}`} data-bs-parent="#faq">
            <div className="accordion-body small">{a}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
