"use client";
import { KitStrip } from "@/components/Catalog";
import { useI18n } from "@/lib/i18n";

export default function Kits() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-navy">{t("kits")}</h1>
      <p className="text-sm text-muted">LOAN sets are sterilised instrument + implant trays returned after surgery (used items billed automatically). SALE kits are sterile packs you keep.</p>
      <KitStrip />
    </div>
  );
}
