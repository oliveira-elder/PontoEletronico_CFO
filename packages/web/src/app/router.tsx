import { createBrowserRouter } from "react-router-dom";

const IndexPublicPage = () => <div>Index publico com banners de RH/TI</div>;
const PrivateHubPage = () => <div>Hub privado de modulos por area</div>;
const ChatPage = () => <div>Atendimento via chat contextual</div>;

export const router = createBrowserRouter([
  { path: "/", element: <IndexPublicPage /> },
  { path: "/app", element: <PrivateHubPage /> },
  { path: "/chat", element: <ChatPage /> }
]);
