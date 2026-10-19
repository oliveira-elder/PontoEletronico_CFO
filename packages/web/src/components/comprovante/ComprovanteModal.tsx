import React, { useRef, useState } from "react";
import { VisualizadorPdfProtegido } from "../assinatura/VisualizadorPdfProtegido";
import { api } from "../../hooks/useApi";
import { useAuth } from "../../auth/AuthContext";

interface Props {
  nsr: number;
  rotulo?: string;
  onClose: () => void;
}

/**
 * Comprovante de Registro de Ponto na tela com os mesmos mecanismos de segurança do Espelho:
 * páginas desenhadas como imagem (sem texto selecionável), marca d'água de quem visualiza,
 * bloqueio de menu/seleção/impressão pela página e desfoque ao perder o foco. O PDF assinado
 * (com QR selado, fundo de segurança e proteções) só sai pelo botão "Baixar PDF".
 */
export function ComprovanteModal({ nsr, rotulo, onClose }: Props) {
  const { token } = useAuth();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState("");
  const nome = `Comprovante-NSR-${String(nsr).padStart(9, "0")}.pdf`;

  async function baixar() {
    setBaixando(true);
    setErro("");
    try {
      const b = await api.blob(`/ponto/comprovantes/${nsr}/pdf`, tokenRef.current() ?? undefined);
      const url = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBaixando(false);
    }
  }

  return (
    <VisualizadorPdfProtegido
      caminho={`/ponto/comprovantes/${nsr}/pdf`}
      titulo={`Comprovante${rotulo ? ` · ${rotulo}` : ""}`}
      larguraMax={430}
      onClose={onClose}
      acoes={
        <>
          {erro && <span style={{ fontSize: 12, color: "#991B1B" }}>⚠ {erro}</span>}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={baixando}
            onClick={() => void baixar()}
          >
            {baixando ? "Gerando…" : "Baixar PDF"}
          </button>
        </>
      }
    />
  );
}
