import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { api } from "../api/client";
import { setToken } from "../auth/token";

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const form = new URLSearchParams();
      form.append("username", username);
      form.append("password", password);

      const { data } = await api.post("/api/v2/auth/token", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      setToken(data.access_token);
      toast.success("Успешный вход");

      const next = params.get("next") || "/";
      navigate(next, { replace: true });
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Ошибка входа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleLogin}>
        <h1>NeoExcelSync V2</h1>
        <p>Вход в систему</p>

        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Логин"
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          type="password"
        />

        <button type="submit" disabled={loading}>
          {loading ? "Вход..." : "Войти"}
        </button>
      </form>
    </div>
  );
}