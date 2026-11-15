"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { Logo } from "./Header";

/** Bootstrap grid footer. */
export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="hero-bg mt-10 text-white">
      {/* not Bootstrap .container: Tailwind v4 has a `container` utility with different behaviour */}
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="row g-4">
          <div className="col-12 col-md-5">
            <div className="d-flex align-items-center gap-2 mb-2"><Logo size={34} /><span className="fw-bold fs-5">ORTHO DIAMOND</span></div>
            <p className="small mb-0" style={{ color: "rgba(255,255,255,.75)" }}>{t("tagline")}. Indore, Madhya Pradesh.</p>
          </div>
          <div className="col-6 col-md-3">
            <h6 className="fw-bold text-info">Explore</h6>
            <ul className="list-unstyled small mb-0">
              <li><Link className="text-white-50" href="/search?q=">{t("browse")}</Link></li>
              <li><Link className="text-white-50" href="/kits">{t("kits")}</Link></li>
              <li><Link className="text-white-50" href="/templates">{t("templates")}</Link></li>
              <li><Link className="text-white-50" href="/about">About us</Link></li>
            </ul>
          </div>
          <div className="col-6 col-md-4">
            <h6 className="fw-bold text-info">For doctors</h6>
            <ul className="list-unstyled small mb-0">
              <li><Link className="text-white-50" href="/login">{t("login")}</Link></li>
              <li><Link className="text-white-50" href="/register">{t("register")}</Link></li>
              <li><Link className="text-white-50" href="/orders">{t("orders")}</Link></li>
            </ul>
          </div>
        </div>
        <hr className="border-secondary my-4" />
        <div className="small text-white-50">© {new Date().getFullYear()} Ortho Diamond · Orthopaedic implants & instruments distributor · Indore</div>
      </div>
    </footer>
  );
}
