import React, { useState } from "react";

const API_BASE = "http://localhost:8001";

export default function App() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [result, setResult] = useState("");

  const checkHealth = async () => {
    const res = await fetch(`${API_BASE}/api/v2/health`);
    const data = await res.json();
    setResult(JSON.stringify(data, null, 2));
  };

  const login = async () => {
    const form = new URLSearchParams();
    form.append("username", username);
    form.append("password", password);

    const res = await fetch(`${API_BASE}/api/v2/auth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });

    const data = await res.json();
    setResult(JSON.stringify(data, null, 2));
  };

  return (
    <div style={{ fontFamily: "Arial", padding: 24 }}>
      <h1>NeoExcelSync V2</h1>
      <p>Test environment</p>

      <div style={{ marginBottom: 20 }}>
        <button onClick={checkHealth}>Check health</button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          style={{ display: "block", marginBottom: 10, padding: 8 }}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          type="password"
          style={{ display: "block", marginBottom: 10, padding: 8 }}
        />
        <button onClick={login}>Login</button>
      </div>

      <pre
        style={{
          background: "#f4f4f4",
          padding: 16,
          borderRadius: 8,
          overflow: "auto",
        }}
      >
        {result}
      </pre>
    </div>
  );
}