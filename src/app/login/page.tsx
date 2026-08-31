import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Access your voice profiles and posting queue.
      </p>
      <LoginForm />
    </main>
  );
}
