import React from "react";

const FeatureItem = ({ icon: Icon, title, desc }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
    <div style={{ background: "rgba(255,255,255,0.1)", padding: "10px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon size={24} color="#60a5fa" />
    </div>
    <div>
      <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{title}</h4>
      <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>{desc}</p>
    </div>
  </div>
);

export default FeatureItem;
