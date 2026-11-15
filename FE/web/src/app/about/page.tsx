"use client";
import { FaqAccordion, FounderSection, WhyCarousel } from "@/components/Marketing";

export default function About() {
  return (
    <div className="space-y-8">
      <FounderSection />
      <WhyCarousel />
      <section>
        <h2 className="mb-3 text-lg font-extrabold text-navy">Frequently asked questions</h2>
        <FaqAccordion />
      </section>
    </div>
  );
}
