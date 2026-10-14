import { Injectable, Logger } from "@nestjs/common";
import { readFileSync, existsSync } from "fs";
import { PDFDocument } from "pdf-lib";

export interface ResultadoSelo {
  pdf: Buffer;
  selado: boolean;
  /** Número de série do certificado usado (quando selado). */
  serial?: string;
  /** Motivo de não ter selado (certificado ausente, dependência não instalada, erro). */
  motivo?: string;
}

export interface StatusSeloIcp {
  configurado: boolean;
  dependenciaInstalada: boolean;
  caminhoCertificado: string | null;
  validadeAte: string | null;
  titular: string | null;
  motivo: string | null;
}

/** Carrega um módulo opcional sem quebrar o build quando a dependência não está instalada. */
function carregarOpcional<T = unknown>(nome: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(nome) as T;
  } catch {
    return null;
  }
}

/**
 * Selo institucional ICP-Brasil (e-CNPJ A1) — assina o PDF final em nome do CFO (PAdES).
 *
 * Pré-pronto: sem certificado configurado devolve o PDF intacto. Para ativar:
 *   1. instalar as dependências: `npm i @signpdf/signpdf @signpdf/signer-p12 @signpdf/placeholder-pdf-lib node-forge`;
 *   2. disponibilizar o arquivo .pfx/.p12 FORA do repositório (volume/secret do Docker);
 *   3. definir ICP_A1_PFX_PATH e ICP_A1_PFX_PASSPHRASE (ou ICP_A1_PFX_PASSPHRASE_FILE).
 */
@Injectable()
export class SeloIcpService {
  private readonly logger = new Logger(SeloIcpService.name);

  private get caminho(): string | null {
    return process.env.ICP_A1_PFX_PATH?.trim() || null;
  }

  private senha(): string {
    const arq = process.env.ICP_A1_PFX_PASSPHRASE_FILE?.trim();
    if (arq && existsSync(arq)) return readFileSync(arq, "utf8").trim();
    return process.env.ICP_A1_PFX_PASSPHRASE ?? "";
  }

  private dependencias() {
    const signpdf = carregarOpcional<{ default?: { sign: (b: Buffer, s: unknown) => Buffer } }>(
      "@signpdf/signpdf"
    );
    const signer = carregarOpcional<{ P12Signer: new (p12: Buffer, o?: object) => unknown }>(
      "@signpdf/signer-p12"
    );
    const placeholder = carregarOpcional<{
      pdflibAddPlaceholder: (o: object) => void;
    }>("@signpdf/placeholder-pdf-lib");
    return { signpdf, signer, placeholder };
  }

  /** Estado do selo para a tela de Configurações e para a página de declaração. */
  status(): StatusSeloIcp {
    const caminho = this.caminho;
    const d = this.dependencias();
    const dependenciaInstalada = !!(d.signpdf && d.signer && d.placeholder);
    if (!caminho) {
      return {
        configurado: false,
        dependenciaInstalada,
        caminhoCertificado: null,
        validadeAte: null,
        titular: null,
        motivo: "Certificado e-CNPJ A1 não configurado (ICP_A1_PFX_PATH)."
      };
    }
    if (!existsSync(caminho)) {
      return {
        configurado: false,
        dependenciaInstalada,
        caminhoCertificado: caminho,
        validadeAte: null,
        titular: null,
        motivo: "Arquivo do certificado não encontrado no caminho configurado."
      };
    }
    const info = this.lerInfoCertificado(caminho);
    return {
      configurado: dependenciaInstalada,
      dependenciaInstalada,
      caminhoCertificado: caminho,
      validadeAte: info?.validadeAte ?? null,
      titular: info?.titular ?? null,
      motivo: dependenciaInstalada
        ? null
        : "Dependências de assinatura não instaladas (@signpdf/*, node-forge)."
    };
  }

  /** Validade e titular do A1 (usa node-forge quando instalado). */
  lerInfoCertificado(caminho: string): { validadeAte: string; titular: string } | null {
    const forge = carregarOpcional<{
      pkcs12: {
        pkcs12FromAsn1: (
          a: unknown,
          pw: string
        ) => {
          getBags: (o: object) => Record<
            string,
            Array<{
              cert?: {
                validity: { notAfter: Date };
                subject: { getField: (n: string) => { value: string } | null };
              };
            }>
          >;
        };
      };
      asn1: { fromDer: (s: string) => unknown };
      util: { createBuffer: (b: string) => { getBytes: () => string } };
    }>("node-forge");
    if (!forge) return null;
    try {
      const der = readFileSync(caminho).toString("binary");
      const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), this.senha());
      const bags = p12.getBags({ bagType: "1.2.840.113549.1.12.10.1.3" });
      const cert = Object.values(bags).flat()[0]?.cert;
      if (!cert) return null;
      return {
        validadeAte: cert.validity.notAfter.toISOString(),
        titular: cert.subject.getField("CN")?.value ?? ""
      };
    } catch (e) {
      this.logger.warn(`Não foi possível ler o certificado A1: ${(e as Error).message}`);
      return null;
    }
  }

  /** Assina o PDF (PAdES) com o e-CNPJ A1; sem certificado/dependência devolve o PDF intacto. */
  async selarPdf(
    pdf: Buffer,
    ctx: { razaoSocial: string; motivo?: string; local?: string }
  ): Promise<ResultadoSelo> {
    const st = this.status();
    if (!st.configurado || !this.caminho) {
      return { pdf, selado: false, motivo: st.motivo ?? "Selo não configurado." };
    }
    const d = this.dependencias();
    try {
      const pdfDoc = await PDFDocument.load(pdf, { ignoreEncryption: true });
      d.placeholder!.pdflibAddPlaceholder({
        pdfDoc,
        reason: ctx.motivo ?? "Selo institucional — integridade e origem do documento",
        contactInfo: "ponto@cfo.org.br",
        name: ctx.razaoSocial,
        location: ctx.local ?? "Brasília/DF"
      });
      const comPlaceholder = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
      const signer = new d.signer!.P12Signer(readFileSync(this.caminho), {
        passphrase: this.senha()
      });
      const sign =
        d.signpdf!.default?.sign ??
        (d.signpdf as unknown as { sign: (b: Buffer, s: unknown) => Buffer }).sign;
      const assinado = await Promise.resolve(sign(comPlaceholder, signer));
      this.logger.log(`PDF selado com e-CNPJ A1 (${st.titular ?? "titular não lido"})`);
      return { pdf: Buffer.from(assinado), selado: true, serial: st.titular ?? undefined };
    } catch (e) {
      this.logger.error(`Falha ao selar PDF: ${(e as Error).message}`);
      return { pdf, selado: false, motivo: `Falha ao selar: ${(e as Error).message}` };
    }
  }
}
