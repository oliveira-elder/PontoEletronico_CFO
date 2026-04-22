import { createBrowserRouter } from "react-router-dom";

const IndexPublicPage = () => (
  <main style={{ fontFamily: "Arial, sans-serif", padding: 24 }}>
    <h1>Intranet CFO - Pagina Index (Teste)</h1>
    <p>Ambiente de validacao inicial da pagina publica.</p>
    <section style={{ marginTop: 24 }}>
      <h2>Banners simulados</h2>
      <ul>
        <li>RH: Campanha de saude ocupacional</li>
        <li>TI: Janela de manutencao no sabado</li>
      </ul>
    </section>
    <section style={{ marginTop: 24 }}>
      <h2>Rotas de teste</h2>
      <ul>
        <li>
          <a href="/app">/app</a>
        </li>
        <li>
          <a href="/chat">/chat</a>
        </li>
      </ul>
    </section>
  </main>
);

const PrivateHubPage = () => <div style={{ padding: 24 }}>Hub privado de modulos por area</div>;
const ChatPage = () => <div style={{ padding: 24 }}>Atendimento via chat contextual</div>;

export const router = createBrowserRouter([
  { path: "/", element: <IndexPublicPage /> },
  { path: "/app", element: <PrivateHubPage /> },
  { path: "/chat", element: <ChatPage /> }
]);
