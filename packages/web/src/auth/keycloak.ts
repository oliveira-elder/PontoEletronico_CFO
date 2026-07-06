import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? "https://sso.cfo.org.br",
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? "cfo",
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? "pontoeletronico-dev"
});

export default keycloak;
