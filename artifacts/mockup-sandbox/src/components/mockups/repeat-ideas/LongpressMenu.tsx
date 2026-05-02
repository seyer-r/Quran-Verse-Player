import { useState } from "react";

export function LongpressMenu() {
  const [menuOpen, setMenuOpen] = useState(true);
  const [repeating, setRepeating] = useState(false);
  const [toast, setToast] = useState("");

  const handleRepeat = () => {
    setRepeating(r => !r);
    setMenuOpen(false);
    setToast(repeating ? "Repeat off" : "Repeating this ayah");
    setTimeout(() => setToast(""), 2000);
  };

  const handleCopy = () => {
    setMenuOpen(false);
    setToast("Copied");
    setTimeout(() => setToast(""), 1500);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{
      background: "#000", fontFamily: "system-ui, sans-serif", position: "relative"
    }}>
      {/* header */}
      <div style={{ padding: "52px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ color: "#8e8e93", fontSize: 12 }}>Surah 2</div>
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 600 }}>Al-Baqarah</div>
        </div>
        <div style={{ width: 28, height: 28, borderRadius: 14, background: "#1c1c1e",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "#8e8e93", fontSize: 16 }}>⚙</span>
        </div>
      </div>

      {/* verse area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "0 28px", position: "relative" }}>

        {/* ayah counter */}
        <div style={{ color: "#8e8e93", fontSize: 13, marginBottom: 24 }}>Ayah 255 of 286</div>

        {/* arabic text — tappable */}
        <div onClick={() => setMenuOpen(m => !m)} style={{
          textAlign: "center", lineHeight: 2.0, cursor: "pointer",
          background: menuOpen ? "rgba(255,255,255,0.04)" : "transparent",
          borderRadius: 16, padding: "12px 8px", transition: "background 0.15s"
        }}>
          <div style={{ color: "#fff", fontSize: 28, direction: "rtl" }}>
            ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ
          </div>
        </div>

        <div style={{ color: "#d4d4d4", fontSize: 15, textAlign: "center",
          marginTop: 20, lineHeight: 1.6 }}>
          Allah — there is no deity except Him, the Ever-Living, the Sustainer of existence.
        </div>

        {/* repeat indicator */}
        {repeating && (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6,
            color: "#e8c078", fontSize: 13 }}>
            <span>↺</span>
            <span>Repeating this ayah</span>
          </div>
        )}

        {/* contextual popup menu */}
        {menuOpen && (
          <div style={{
            position: "absolute", top: "38%", left: "50%",
            transform: "translateX(-50%)",
            background: "#2c2c2e", borderRadius: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            overflow: "hidden", minWidth: 220, zIndex: 10
          }}>
            {/* hint */}
            <div style={{ padding: "10px 16px 0", color: "#8e8e93", fontSize: 11,
              textTransform: "uppercase", letterSpacing: "0.06em" }}>Hold verse to open</div>

            <button onClick={handleRepeat} style={{
              display: "flex", alignItems: "center", gap: 12,
              width: "100%", padding: "13px 16px", background: "none",
              border: "none", cursor: "pointer", borderBottom: "1px solid #3a3a3c",
              color: repeating ? "#e8c078" : "#fff", fontSize: 15, textAlign: "left"
            }}>
              <span style={{ fontSize: 18 }}>↺</span>
              <span>{repeating ? "Stop Repeating" : "Repeat Ayah"}</span>
            </button>
            <button onClick={handleCopy} style={{
              display: "flex", alignItems: "center", gap: 12,
              width: "100%", padding: "13px 16px", background: "none",
              border: "none", cursor: "pointer", borderBottom: "1px solid #3a3a3c",
              color: "#fff", fontSize: 15, textAlign: "left"
            }}>
              <span style={{ fontSize: 18 }}>⎘</span>
              <span>Copy Arabic</span>
            </button>
            <button style={{
              display: "flex", alignItems: "center", gap: 12,
              width: "100%", padding: "13px 16px", background: "none",
              border: "none", cursor: "pointer",
              color: "#fff", fontSize: 15, textAlign: "left"
            }}>
              <span style={{ fontSize: 18 }}>↗</span>
              <span>Share Verse</span>
            </button>
          </div>
        )}
      </div>

      {/* footer */}
      <div style={{ padding: "0 20px 40px", display: "flex", alignItems: "center",
        justifyContent: "center", gap: 32 }}>
        <div style={{ color: "#8e8e93", fontSize: 22 }}>⏮</div>
        <div style={{ width: 64, height: 64, borderRadius: 32, background: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>▶</div>
        <div style={{ color: "#8e8e93", fontSize: 22 }}>⏭</div>
      </div>

      {/* toast */}
      {toast && (
        <div style={{
          position: "absolute", bottom: 110, left: "50%", transform: "translateX(-50%)",
          background: "#1c1c1e", color: "#fff", padding: "8px 18px", borderRadius: 20,
          fontSize: 14, boxShadow: "0 4px 16px rgba(0,0,0,0.5)"
        }}>{toast}</div>
      )}
    </div>
  );
}
