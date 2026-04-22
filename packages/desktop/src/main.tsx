import { createRoot } from "react-dom/client";

function DesktopApp() {
  return <div>Intranet Desktop - hub corporativo</div>;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<DesktopApp />);
}
