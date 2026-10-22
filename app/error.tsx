"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="error-page">
      <p className="eyebrow">A LITTLE DINNER INTERRUPTION</p>
      <h1>Let’s pull up another chair.</h1>
      <p>
        Something interrupted the table. Your seat and completed orders stay
        safe.
      </p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
      <a href="/account">Visit your account</a>
    </main>
  );
}
