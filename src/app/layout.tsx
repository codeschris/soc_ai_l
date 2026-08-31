import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ghostline — AI posting in your voice",
  description:
    "Draft, approve and publish Instagram and Facebook posts written in your own voice — with your consent and your final say.",
};

const NAV = [
  { href: "/compose", label: "Compose" },
  { href: "/queue", label: "Queue" },
  { href: "/voice", label: "Voice" },
  { href: "/accounts", label: "Accounts" },
  { href: "/settings", label: "Settings" },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Ghostline
            </Link>

            {session?.user ? (
              <div className="flex flex-wrap items-center gap-5">
                <nav className="flex flex-wrap gap-4 text-sm text-neutral-600">
                  {NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="hover:text-neutral-900"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
                <form
                  action={async () => {
                    "use server";
                    await signOut({ redirectTo: "/login" });
                  }}
                >
                  <button
                    type="submit"
                    className="text-sm text-neutral-500 hover:text-neutral-900"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <nav className="flex gap-4 text-sm text-neutral-600">
                <Link href="/login" className="hover:text-neutral-900">
                  Sign in
                </Link>
                <Link href="/register" className="hover:text-neutral-900">
                  Create account
                </Link>
              </nav>
            )}
          </header>

          {children}
        </div>
      </body>
    </html>
  );
}
