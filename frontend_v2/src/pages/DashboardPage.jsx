import React, { useEffect, useState } from "react";
import { api } from "../api/client";

export default function DashboardPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/api/v2/dashboard").then((res) => setData(res.data));
  }, []);

  return (
    <div className="page">
      <h1>Главная</h1>
      <pre className="card">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}