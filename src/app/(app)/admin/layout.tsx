import { getSessionProfile, getSessionUser } from "@/lib/supabase/session";
import { redirect } from "next/navigation";
import { CodeCourrierNotifications } from "./code-courrier/CodeCourrierNotifications";
import { RappelsNotifications } from "./rappels-notifications/RappelsNotifications";
import { TaskReminders } from "@/components/tasks/TaskReminders";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  if (!user) redirect("/login");

  const profile = await getSessionProfile(user.id);

  const role = profile?.role?.toString().trim().toLowerCase();
  if (role === "telepro") {
    redirect("/telepro");
  }

  return (
    <>
      {role === "secretaire" && (
        <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-2 max-w-sm">
          <CodeCourrierNotifications />
          <RappelsNotifications />
        </div>
      )}
      {role !== "cee" && <TaskReminders tasksHref="/admin/taches" />}
      {children}
    </>
  );
}
