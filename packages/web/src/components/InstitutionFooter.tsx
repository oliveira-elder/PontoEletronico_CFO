import React from "react";
import { useInstituicaoBranding } from "../hooks/useInstituicaoBranding";
import { formatEnderecoInstitucional, formatRodapeLinha1 } from "../utils/instituicao";

type Props = {
  style?: React.CSSProperties;
};

/** Rodapé institucional alimentado por Configurações → Instituição. */
export function InstitutionFooter({ style }: Props) {
  const { branding } = useInstituicaoBranding();
  const endereco = formatEnderecoInstitucional(branding);

  return (
    <p
      style={{
        fontSize: 11,
        color: "var(--ink-500)",
        textAlign: "center",
        marginTop: 20,
        lineHeight: 1.6,
        ...style
      }}
    >
      {formatRodapeLinha1(branding)}
      {endereco ? (
        <>
          <br />
          {endereco}
        </>
      ) : null}
    </p>
  );
}
