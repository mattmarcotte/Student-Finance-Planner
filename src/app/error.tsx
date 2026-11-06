"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main" className="fallback-page"><h1>Couldn’t load this page</h1><button className="primary-button" onClick={reset}>Try again</button></main>;
}
