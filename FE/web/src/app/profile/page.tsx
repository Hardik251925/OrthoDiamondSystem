"use client";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, Loadable } from "@/components/ui";
import { get } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export default function Profile() {
  const { t, lang, setLang } = useI18n();
  const me = useQuery({ queryKey: ["me"], queryFn: () => get<{ name: string; phone: string; email: string | null; role: string; doctor: { id: string; status: string; specialisation: string } | null }>("/auth/me") });
  const doc = useQuery({ queryKey: ["doctor-me"], queryFn: () => get<{ councilRegNo: string; stateCouncil: string; hospitals: { name: string }[] }>("/doctors/me"), enabled: me.data?.role === "DOCTOR" });
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-extrabold text-navy">{t("profile")}</h1>
      <Loadable q={me} rows={2}>
        {(u) => (
          <Card className="space-y-2 text-sm">
            <div className="text-lg font-extrabold text-navy">{u.name}</div>
            <div>{u.phone} · {u.email}</div>
            <div>{u.role.replace("_", " ")} {u.doctor && <Badge value={u.doctor.status} />}</div>
            {u.doctor && <div className="text-muted">{u.doctor.specialisation}</div>}
            {doc.data && <><div className="text-muted">{doc.data.stateCouncil} · {doc.data.councilRegNo}</div><div>Hospitals: {doc.data.hospitals.map((h) => h.name).join(", ")}</div></>}
            <div className="flex items-center gap-2 pt-2">Language: <button onClick={() => setLang("en")} className={lang === "en" ? "font-bold text-cyan" : ""}>English</button> / <button onClick={() => setLang("hi")} className={lang === "hi" ? "font-bold text-cyan" : ""}>हिंदी</button></div>
          </Card>
        )}
      </Loadable>
      <p className="text-xs text-muted">{t("noClinical")}</p>
    </div>
  );
}
