"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronLeft, Eye, LogOut } from "lucide-react";
import { odjava } from "@/app/actions";
import { InfoGumb } from "@/components/InfoGumb";
import { Button, IconButton, NavPovezava } from "@/components/ui";
import { lahkoZapustim } from "@/lib/neshranjeno";
import { NAMIG_SAMO_OGLED } from "@/lib/vloga";

// Glava aplikacije: logo, Nazaj (razen domače strani), "i" (spremembe), uporabnik, Izhod; spodaj 4 px oranžna črta.
// Mora iti v 360 px: logo se skrči, Izhod je na telefonu okrogel gumb z ikono, e-mail je skrit.
export function Glava({
  back,
  backHint,
  samoOgled,
  email,
}: {
  back?: string;
  backHint: string;
  samoOgled: boolean;
  email: string | null;
}) {
  const router = useRouter();
  const nazaj = () => back && lahkoZapustim() && router.push(back);

  return (
    <header className="sticky top-0 z-40 border-b-4 border-fines-500 bg-white">
      <div className="mx-auto flex h-16 w-full min-w-0 max-w-[1800px] items-center gap-1.5 px-2 sm:gap-2 sm:px-4">
        <NavPovezava href="/" title="Pojdi na domačo stran (seznam opreme)" className="flex min-w-0 shrink items-center">
          <Image
            src="/fines-logo.png"
            alt="FINES d.o.o. logotip"
            width={136}
            height={36}
            priority
            className="h-auto w-24 sm:w-[136px]"
          />
        </NavPovezava>
        {back && (
          <Button hint={backHint} variant="neutral" icon={ChevronLeft} className="ml-2 hidden sm:inline-flex" onClick={nazaj}>
            Nazaj
          </Button>
        )}
        <span className="ml-1 min-w-0 flex-1 truncate text-sm font-bold text-ink-800 sm:ml-2 sm:text-base">
          Rabljena oprema
        </span>
        {samoOgled && (
          <span
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-ink-100 px-2 text-xs font-bold text-ink-600 sm:px-3"
            title={NAMIG_SAMO_OGLED}
          >
            <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">Samo ogled</span>
          </span>
        )}
        {back && <IconButton hint={backHint} icon={ChevronLeft} variant="neutral" className="sm:hidden" onClick={nazaj} />}
        <InfoGumb />
        {email && (
          <span className="hidden text-xs text-ink-500 md:inline" title="Prijavljeni uporabnik">
            {email}
          </span>
        )}
        <form action={odjava} onSubmit={(e) => !lahkoZapustim() && e.preventDefault()}>
          <Button
            type="submit"
            hint="Odjava in izhod iz aplikacije"
            variant="primary"
            icon={LogOut}
            className="max-sm:w-10 max-sm:shrink-0 max-sm:rounded-full max-sm:px-0"
          >
            <span className="hidden sm:inline">Izhod</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
