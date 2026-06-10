import Link from "next/link";

export function Navbar() {
  return (
    <nav className="navbar">
      <Link href="/" className="navbar__brand">
        🏏 <span>CrickVerse</span>
      </Link>
      <div className="navbar__links">
        <Link href="/">Live &amp; Fixtures</Link>
      </div>
    </nav>
  );
}
