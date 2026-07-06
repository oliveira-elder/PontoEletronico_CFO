import Keycloak from "keycloak-js";

/** URL do SSO no browser: sempre proxy /auth no mesmo host (evita cookie em sso.cfo.org.br). */
function resolveKeycloakUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth`;
  }
  const fromEnv = import.meta.env.VITE_KEYCLOAK_URL as string | undefined;
  if (fromEnv?.trim()) return fromEnv.replace(/\/$/, "");
  return "http://192.168.100.112:8080";
}

const keycloak = new Keycloak({
  url: resolveKeycloakUrl(),
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? "cfo",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? "pontoeletronico-dev"
});

export default keycloak;
