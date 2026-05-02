import { useState } from "react";

export function ActionStrip() {
  const [repeat, setRepeat] = useState(false);
  const [stripVisible, setStripVisible] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{
      background: "#000", fontFamily: "system-ui, sans-serif"
    }}>
      {/* header */}
      <div style={{ padding: "52px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ color: "#8e8e93", fontSize: 12 }}>Surah 36</div>
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 600 }}>Ya-Sin</div>
        </div>
        <div style={{ width: 28, height: 28, borderRadius: 14, background: "#1c1c1e",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#8e8e93", fontSize: 16 }}>⚙</span>
        </div>
      </div>

      {/* verse */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "0 28px" }}>

        <div style={{ color: "#8e8e93", fontSize: 13, marginBottom: 24 }}>Ayah 1 of 83</div>

        {/* tap verse to toggle strip */}
        <div onClick={() => setStripVisible(v => !v)} style={{ cursor: "pointer", textAlign: "center" }}>
          <div style={{ color: "#fff", fontSize: 38, lineHeight: 1.8, direction: "rtl" }}>
            يسٓ
          </div>
        </div>

        <div style={{ color: "#d4d4d4", fontSize: 15, textAlign: "center",
          marginTop: 20, lineHeight: 1.6, marginBottom: 28 }}>
          Ya, Sin.
        </div>

        {/* action strip — appears below translation */}
        <div style={{
          display: "flex", alignItems: "center", gap: 0,
          background: "#1c1c1e", borderRadius: 14,
          overflow: "hidden",
          opacity: stripVisible ? 1 : 0,
          transform: stripVisible ? "translateY(0) scale(1)" : "translateY(6px) scale(0.97)",
          transition: "opacity 0.2s, transform 0.2s",
          boxShadow: "0 2px 16px rgba(0,0,0,0.5)"
        }}>

          {/* repeat */}
          <button onClick={() => setRepeat(r => !r)} style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 4, padding: "12px 20px", background: "none", border: "none",
            cursor: "pointer", borderRight: "1px solid #2c2c2e"
          }}>
            <span style={{ fontSize: 20, color: repeat ? "#e8c078" : "#8e8e93" }}>↺</span>
            <span style={{ fontSize: 11, color: repeat ? "#e8c078" : "#8e8e93",
              fontWeight: repeat ? 600 : 400 }}>
              {repeat ? "Looping" : "Repeat"}
            </span>
          </button>

          {/* bookmark */}
          <button style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 4, padding: "12px 20px", background: "none", border: "none",
            cursor: "pointer", borderRight: "1px solid #2c2c2e"
          }}>
            <span style={{ fontSize: 20, color: "#8e8e93" }}>🔖</span>
            <span style={{ fontSize: 11, color: "#8e8e93" }}>Bookmark</span>
          </button>

          {/* copy */}
          <button onClick={handleCopy} style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 4, padding: "12px 20px", background: "none", border: "none",
            cursor: "pointer", borderRight: "1px solid #2c2c2e"
          }}>
            <span style={{ fontSize: 20, color: copied ? "#34c759" : "#8e8e93" }}>⎘</span>
            <span style={{ fontSize: 11, color: copied ? "#34c759" : "#8e8e93" }}>
              {copied ? "Copied!" : "Copy"}
            </span>
          </button>

          {/* share */}
          <button style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 4, padding: "12px 20px", background: "none", border: "none",
            cursor: "pointer"
          }}>
            <span style={{ fontSize: 20, color: "#8e8e93" }}>↗</span>
            <span style={{ fontSize: 11, color: "#8e8e93" }}>Share</span>
          </button>
        </div>

        {/* hint text */}
        <div style={{ marginTop: 12, color: "#48484a", fontSize: 12 }}>
          Tap verse to {stripVisible ? "hide" : "show"} actions
        </div>
      </div>

      {/* footer */}
      <div style={{ padding: "0 20px 40px", display: "flex", alignItems: "center",
        justifyContent: "center", gap: 32 }}>
        <div style={{ color: "#d4d4d4", fontSize: 13 }}>Mishary Alafasy  ∧</div>
        <div style={{ flex: 1 }} />
        <div style={{ color: "#8e8e93", fontSize: 22 }}>⏮</div>
        <div style={{ width: 64, height: 64, borderRadius: 32, background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>▶</div>
        <div style={{ color: "#8e8e93", fontSize: 22 }}>⏭</div>
        <div style={{ flex: 1 }} />
        <div style={{ color: "#8e8e93", fontSize: 20 }}>↺</div>
      </div>
    </div>
  );
}
