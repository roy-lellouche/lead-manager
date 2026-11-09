import type { ReactNode } from "react";
import Image from "next/image";
import { GothicCross } from "@/components/brand/GothicCross";

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
            <GothicCross className="w-8 h-8 shrink-0" />
            <div className="chrome-rule flex-1" />
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-8 shadow-[0_1px_2px_rgba(16,24,40,.04),0_12px_32px_rgba(16,24,40,.08)]">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-subtle">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-subtle">{footer}</div> : null}
      </div>
    </div>
  );
}
