import Link from "next/link";

export default function NotFoundPage() {
  return <main id="main" className="fallback-page"><span className="small-label">404 / A LITTLE OFF TRACK</span><h1>Nothing here just yet.</h1><p>Let’s get you back to a little more clarity.</p><Link className="primary-button" href="/">Back to Buffer</Link></main>;
}
