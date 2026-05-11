import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Topbar } from "./Topbar";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";
import { useIsMobile } from "../../hooks/useIsMobile";

export function AppLayout() {
  const isMobile = useIsMobile(768);
  const [expanded, setExp] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* Topbar é fixed — este espaçador ocupa a altura dela para o conteúdo não ficar por baixo */}
      <Topbar />
      <div style={{ height: "var(--topbar-h)", flexShrink: 0 }} />

      <div style={{ display: "flex", flex: 1 }}>
        {!isMobile && <Sidebar onExpandChange={setExp} />}

        <main
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: "calc(100vh - var(--topbar-h))",
            marginLeft: isMobile
              ? 0
              : expanded
                ? "var(--sidebar-expanded)"
                : "var(--sidebar-collapsed)",
            transition: "margin-left 220ms cubic-bezier(0.16, 1, 0.3, 1)",
            padding: isMobile
              ? "16px 16px calc(80px + env(safe-area-inset-bottom, 0px)) 16px"
              : "var(--space-6)",
            background: "var(--cream-50)",
            overflowX: "hidden",
            boxSizing: "border-box"
          }}
        >
          <Outlet />
        </main>
      </div>

      {isMobile && <BottomNav />}
    </div>
  );
}
