import { useEffect, useState } from "react";

// REPLACE WITH YOUR ACTUAL GOOGLE REVIEW LINK
const GOOGLE_REVIEW_LINK = "https://g.page/r/XXXXX/review";

export default function ReviewPage() {
  const [guj, setGuj] = useState("");
  const [eng, setEng] = useState("");
  const [copied, setCopied] = useState("");

  // Deployment-audit fix: this page previously read query params via
  // react-router-dom's useSearchParams(), but the app has no <Router>
  // anywhere (App.tsx renders pages via plain useState, not client-side
  // routing) -- that hook throws outside a Router context, so this page
  // would crash on load in production. Reading window.location.search
  // directly needs no Router and matches how the rest of the app already
  // inspects the URL (see App.tsx's window.location.pathname checks).
  // Read once on mount: this page is only ever reached via a fresh
  // full-page navigation with the query string already present, not via
  // in-app client-side navigation that could change it afterward.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("g") || "";
    const e = params.get("e") || "";

    // Use try-catch to handle potential malformed URIs
    try {
      setGuj(decodeURIComponent(g));
      setEng(decodeURIComponent(e));
    } catch (err) {
      setGuj(g);
      setEng(e);
    }
  }, []);

  const copyText = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(""), 2000);
    } catch (err) {
      alert("Please manually select and copy the text.");
    }
  };

  return (
    <div style={styles.container}>
      
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>⭐ Share Your Experience</h2>
        <p style={styles.subtitle}>
          It takes just 10 seconds and helps others 🙏
        </p>
      </div>

      {/* Gujarati Review */}
      {guj && (
        <div style={styles.card}>
          <h3 style={styles.label}>Gujarati Review</h3>
          <textarea style={styles.textarea} value={guj} readOnly />
          
          <button
            style={styles.copyBtn}
            onClick={() => copyText(guj, "guj")}
          >
            {copied === "guj" ? "✅ Copied!" : "📋 Copy Gujarati"}
          </button>
        </div>
      )}

      {/* English Review */}
      {eng && (
        <div style={styles.card}>
          <h3 style={styles.label}>English Review</h3>
          <textarea style={styles.textarea} value={eng} readOnly />
          
          <button
            style={styles.copyBtn}
            onClick={() => copyText(eng, "eng")}
          >
            {copied === "eng" ? "✅ Copied!" : "📋 Copy English"}
          </button>
        </div>
      )}

      {/* Action Button */}
      <a href={GOOGLE_REVIEW_LINK} target="_blank" rel="noreferrer" style={styles.reviewBtn}>
        ⭐ Open Google Review
      </a>

      <p style={{ fontSize: '11px', textAlign: 'center', color: '#888', marginTop: '10px' }}>
        Step: 1. Click Copy button above. <br />
        Step: 2. Click Orange button and Paste your review.
      </p>

      {/* Footer */}
      <p style={styles.footer}>
        Thank you for supporting Sakhi Clinic 💙
      </p>
    </div>
  );
}

const styles: any = {
  container: {
    padding: "24px 16px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    maxWidth: "500px",
    margin: "0 auto",
    background: "#f7f9fc",
    minHeight: "100vh",
  },
  header: {
    textAlign: "center",
    marginBottom: "30px",
  },
  title: {
    margin: "0",
    fontSize: "22px",
    fontWeight: "800",
    color: "#0f172a"
  },
  subtitle: {
    fontSize: "14px",
    color: "#64748b",
    marginTop: "8px"
  },
  card: {
    background: "#fff",
    padding: "16px",
    borderRadius: "16px",
    marginBottom: "20px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
    border: "1px solid #e2e8f0"
  },
  label: {
    marginBottom: "10px",
    fontSize: "13px",
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase"
  },
  textarea: {
    width: "100%",
    minHeight: "100px",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    padding: "12px",
    fontSize: "15px",
    lineHeight: "1.5",
    marginBottom: "12px",
    resize: "none",
    color: "#1e293b"
  },
  copyBtn: {
    width: "100%",
    padding: "12px",
    borderRadius: "10px",
    border: "none",
    background: "#22c55e",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer"
  },
  reviewBtn: {
    display: "block",
    textAlign: "center",
    padding: "16px",
    borderRadius: "14px",
    background: "#f59e0b",
    color: "#fff",
    fontSize: "16px",
    fontWeight: "800",
    textDecoration: "none",
    marginTop: "20px",
    boxShadow: "0 10px 15px -3px rgba(245, 158, 11, 0.3)"
  },
  footer: {
    textAlign: "center",
    fontSize: "12px",
    color: "#94a3b8",
    marginTop: "40px",
  },
};