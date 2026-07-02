import Link from "next/link";

export function Navbar() {
  return (
    <nav className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <Link href="/" className="font-semibold tracking-tight">
        gtm-server-deployer
      </Link>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <Link href="/deploy">Deploy</Link>
        <Link href="/status">Status</Link>
        <Link href="/settings">Settings</Link>
      </div>
    </nav>
  );
}
