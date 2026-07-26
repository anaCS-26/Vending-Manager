"use client";

/**
 * Last-resort boundary: catches errors thrown by the ROOT layout itself, which
 * `app/error.tsx` cannot — at that point the layout (and so ThemeProvider, the
 * fonts, RealtimeRefresher) never mounted. It therefore has to render its own
 * <html>/<body> and can't rely on any app chrome or shared component.
 *
 * Styling is inline for the same reason: if the failure was in the layout, the
 * stylesheet link may not be there either.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    background: "#0b0b0d",
                    color: "#f8fafc",
                    padding: "1rem",
                }}
            >
                <div style={{ maxWidth: 420, textAlign: "center" }}>
                    <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>
                        The app failed to start
                    </h1>
                    <p style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 24px", lineHeight: 1.5 }}>
                        Something went wrong before the page could render. Try again, and if it keeps
                        happening quote the reference below.
                    </p>
                    <button
                        onClick={reset}
                        style={{
                            background: "#3b82f6",
                            color: "#fff",
                            border: 0,
                            borderRadius: 12,
                            padding: "12px 24px",
                            fontSize: 15,
                            fontWeight: 700,
                            cursor: "pointer",
                        }}
                    >
                        Try again
                    </button>
                    {error.digest && (
                        <p style={{ marginTop: 20, fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
                            Reference: {error.digest}
                        </p>
                    )}
                </div>
            </body>
        </html>
    );
}
