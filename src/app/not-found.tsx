import Link from "next/link";

export default function NotFoundPage() {
  return <main id="main" className="fallback-page"><span className="small-label">404</span><h1>Page not found</h1><Link className="primary-button" href="/">Back to Buffer</Link></main>;
}
