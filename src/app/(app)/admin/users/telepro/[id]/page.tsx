import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TeleproAgentConfigForm } from "./TeleproAgentConfigForm";
import { getSessionUser } from "@/lib/supabase/session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeStr(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val);
}

export default async function TeleproConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: teleproId } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role?.toString().trim().toLowerCase();
  if (role !== "admin") redirect("/admin");

  const { data: telepro, error } = await adminClient
    .from("profiles")
    .select("id, full_name, email, role, phone, twilio_phone_number, vapi_hold_message, twilio_say_voice")
    .eq("id", teleproId)
    .single();

  const roleLower = telepro?.role?.toString().trim().toLowerCase();
  if (error || !telepro || roleLower !== "telepro") {
    redirect("/admin/users");
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/users"
          className="p-2 rounded-[9px] hover:bg-line text-subtle transition-colors"
          aria-label="Retour aux utilisateurs"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-ink">
            Configuration télépro — {telepro.full_name || telepro.email}
          </h1>
          <p className="text-subtle text-sm mt-0.5">
            Numéro du télépro, numéro Twilio et message d&apos;accueil (lorsque le lead répond).
          </p>
        </div>
      </div>

      <TeleproAgentConfigForm
        teleproId={telepro.id}
        teleproName={telepro.full_name || telepro.email}
        initial={{
          phone: safeStr(telepro.phone),
          twilio_phone_number: safeStr(telepro.twilio_phone_number),
          welcome_message: safeStr(telepro.vapi_hold_message),
          twilio_say_voice: safeStr(telepro.twilio_say_voice),
        }}
      />
    </div>
  );
}
