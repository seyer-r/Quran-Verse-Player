import { useState } from "react";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function ReciterSheet() {
  const [speed, setSpeed] = useState(1);
  const [repeat, setRepeat] = useState(false);

  return (
    <div className="min-h-screen flex flex-col items-center justify-end"
      style={{ background: "#000", fontFamily: "system-ui, sans-serif" }}>

      {/* dimmed bg */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />

      {/* sheet */}
      <div style={{
        position: "relative", width: "100%", maxWidth: 390,
        background: "#1c1c1e", borderRadius: "18px 18px 0 0",
        padding: "0 0 36px 0", boxShadow: "0 -8px 40px rgba(0,0,0,0.6)"
      }}>
        {/* handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "#48484a" }} />
        </div>

        {/* reciter row */}
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ color: "#8e8e93", fontSize: 12, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Reciter</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12,
            background: "#2c2c2e", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 18,
              background: "#3a3a3c", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 18 }}>🎙</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 500 }}>Mishary Rashid Alafasy</div>
              <div style={{ color: "#8e8e93", fontSize: 12 }}>Arabic – ar.alafasy</div>
            </div>
            <div style={{ color: "#8e8e93", fontSize: 18 }}>›</div>
          </div>
        </div>

        {/* speed */}
        <div style={{ padding: "20px 20px 0" }}>
          <div style={{ color: "#8e8e93", fontSize: 12, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Speed</div>
          <div style={{ display: "flex", gap: 8 }}>
            {SPEEDS.map(s => (
              <button key={s} onClick={() => setSpeed(s)} style={{
                flex: 1, padding: "8px 0", borderRadius: 10,
                background: speed === s ? "#e8c078" : "#2c2c2e",
                color: speed === s ? "#000" : "#aaa",
                fontWeight: speed === s ? 700 : 400,
                fontSize: 13, border: "none", cursor: "pointer"
              }}>
                {s === 1 ? "1×" : `${s}×`}
              </button>
            ))}
          </div>
        </div>

        {/* divider */}
        <div style={{ margin: "20px 20px 0", height: 1, background: "#2c2c2e" }} />

        {/* repeat ayah toggle — THE NEW ROW */}
        <div style={{ padding: "16px 20px 0" }}>
          <div style={{ color: "#8e8e93", fontSize: 12, fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Memorisation</div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#2c2c2e", borderRadius: 12, padding: "13px 14px"
          }}>
            <div>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 500 }}>Repeat Ayah</div>
              <div style={{ color: "#8e8e93", fontSize: 12, marginTop: 2 }}>
                {repeat ? "Looping current ayah" : "Advance after each ayah"}
              </div>
            </div>
            {/* toggle */}
            <div onClick={() => setRepeat(r => !r)} style={{
              width: 51, height: 31, borderRadius: 16, cursor: "pointer",
              background: repeat ? "#e8c078" : "#48484a",
              position: "relative", transition: "background 0.2s",
              flexShrink: 0
            }}>
              <div style={{
                position: "absolute", top: 2,
                left: repeat ? 22 : 2,
                width: 27, height: 27, borderRadius: 14,
                background: "#fff", transition: "left 0.2s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.4)"
              }} />
            </div>
          </div>

          {repeat && (
            <div style={{
              marginTop: 8, padding: "10px 14px", borderRadius: 10,
              background: "rgba(232,192,120,0.1)",
              border: "1px solid rgba(232,192,120,0.25)",
              color: "#e8c078", fontSize: 13
            }}>
              ↺  This ayah will loop until you turn this off
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
