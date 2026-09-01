import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { RegisterForm } from "./form";

export default async function RegisterPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <main className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Create your account
      </h1>
      <p className="mb-6 text-sm text-neutral-500">
        Ghostline only ever writes as you — with your explicit consent, and never
        without your approval.
      </p>
      <RegisterForm />
    </main>
  );
}
