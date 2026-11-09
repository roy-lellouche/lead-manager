import type { ReactNode } from "react";
import Image from "next/image";
import { FleurDeLis } from "@/components/brand/FleurDeLis";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 gothic-surface">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-2">
          <Image src="/logo-symbole.png" alt="RS ÉCOLOGIE" width={509} height={498} className="h-16 w-auto object-contain" priority />
          <span className="font-gothic chrome-text text-4xl leading-tight">RS Écologie</span>
          <div className="flex items-center gap-2 w-56" aria-hidden="true">
            <div className="chrome-rule flex-1" />
            <FleurDeLis className="w-5 h-5 shrink-0" />
            <div className="chrome-rule flex-1" />
          </div>
        </div>
        <div className="rounded-[12px] border border-[#8a8f96]/60 bg-white p-8 shadow-[0_0_0_1px_rgba(255,255,255,.06),0_20px_50px_rgba(0,0,0,.6)]">
          <h1 className="text-2xl font-bold text-[#0b1f3a]">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-[#64748b]">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-[#a9aeb5] [&_a]:!text-[#d6d9dd]">{footer}</div> : null}
      </div>
    </div>
  );
}
