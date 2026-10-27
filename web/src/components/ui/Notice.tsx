import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from "lucide-react";

const TONI = {
  warn: { cls: "bg-warn-50 text-warn-700", icon: AlertTriangle, role: "status" },
  ok: { cls: "bg-ok-50 text-ok-600", icon: CheckCircle2, role: "status" },
  nok: { cls: "bg-nok-50 text-nok-600", icon: XCircle, role: "alert" },
} satisfies Record<string, { cls: string; icon: LucideIcon; role: string }>;

function NoticeText({ ton, className = "", children }: { ton: keyof typeof TONI; className?: string; children: ReactNode }) {
  const { cls, icon: Icon, role } = TONI[ton];
  return (
    <div role={role} className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm font-medium ${cls} ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Opozorilo: rumeno ozadje, ikona trikotnika, temno rumen tekst. */
export function WarningText({ className, children }: { className?: string; children: ReactNode }) {
  return <NoticeText ton="warn" className={className}>{children}</NoticeText>;
}

/** Uspeh (isti slog kot opozorilo, zelen). */
export function SuccessText({ className, children }: { className?: string; children: ReactNode }) {
  return <NoticeText ton="ok" className={className}>{children}</NoticeText>;
}

/** Napaka (isti slog kot opozorilo, rdeč). */
export function ErrorText({ className, children }: { className?: string; children: ReactNode }) {
  return <NoticeText ton="nok" className={className}>{children}</NoticeText>;
}
