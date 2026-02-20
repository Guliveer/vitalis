import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">Vitalis</h1>
          <p className="text-muted-foreground mt-1">Personal System Monitoring</p>
        </div>
        {children}
      </div>
    </div>
  );
}
