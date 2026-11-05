"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="fallback-page"><span className="small-label">A SMALL BUMP IN THE ROAD</span><h1>Let’s try that again.</h1><p>We couldn’t load this page. Please try again in a moment.</p><button className="primary-button" onClick={reset}>Try again</button></main>;
}
