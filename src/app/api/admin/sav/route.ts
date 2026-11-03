import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSavFromFormData, requireSavStaff, withPhotoUrls } from "@/lib/sav-server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireSavStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const result = await createSavFromFormData(admin, formData, { source: "interne", createdBy: auth.userId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const [sav] = await withPhotoUrls(admin, [result.sav]);
  return NextResponse.json(sav);
}
