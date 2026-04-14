import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";

import ProtectedRoute from "./components/routing/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ComparePage from "./pages/ComparePage";
import SplitsPage from "./pages/SplitsPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import DepartmentsPage from "./pages/DepartmentsPage";
import InstrumentsPage from "./pages/InstrumentsPage";
import UnityExchangePage from "./pages/UnityExchangePage";
import CryptoPage from "./pages/CryptoPage";
import ProblemsPage from "./pages/ProblemsPage";
import ReportsPage from "./pages/ReportsPage";

import "react-toastify/dist/ReactToastify.css";

export default function App() {
  return (
    <BrowserRouter>
      <>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/splits" element={<SplitsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/departments" element={<DepartmentsPage />} />
              <Route path="/instruments" element={<InstrumentsPage />} />
              <Route path="/unity-exchange" element={<UnityExchangePage />} />
              <Route path="/crypto" element={<CryptoPage />} />
              <Route path="/problems" element={<ProblemsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>

        <ToastContainer position="bottom-right" theme="light" />
      </>
    </BrowserRouter>
  );
}