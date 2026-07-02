import Link from "next/link";

export function Navbar() {
  return (
    <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
      <Link href="/" className="font-semibold tracking-tight">
        gtm-server-deployer
      </Link>
      <div className="flex gap-4 text-sm">
        <Link href="/deploy">Deploy</Link>
        <Link href="/status">Status</Link>
        <Link href="/settings">Settings</Link>
      </div>
    </nav>
  );
}
