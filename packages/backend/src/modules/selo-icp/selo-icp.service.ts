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
/** Política de assinatura AD-RB v2.3 (ICP-Brasil/ITI) — hash SHA-256 do PA_AD_RB_v2_3.der, conforme a LPA. */
const ICP_POLITICA_AD_RB = {
  oid: "2.16.76.1.7.1.1.2.3",
  uri: "http://politicas.icpbrasil.gov.br/PA_AD_RB_v2_3.der",
  sha256: "e98bc76b0149e632cd639de76682ee72d97f927c255c28b04a3dbcfec632285f"
} as const;

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

  /**
   * Assinatura CAdES DESTACADA (.p7s, DER) do AFD/AEJ (Portaria MTP 671/2021, art. 88 §2º), com
   * o e-CNPJ A1 (SHA-256, política AD-RB v2.3 da ICP-Brasil). Sem certificado: null.
   */
  assinarCades(conteudo: Buffer): { p7s: Buffer; titular: string | null } | null {
    const caminho = this.caminho;
    if (!caminho || !existsSync(caminho)) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const forge = require("node-forge") as typeof import("node-forge");
    const der = readFileSync(caminho).toString("binary");
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), this.senha());
    const chaves =
      p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
        forge.pki.oids.pkcs8ShroudedKeyBag
      ] ?? [];
    const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    const key = chaves[0]?.key;
    const cert = certs[0]?.cert;
    if (!key || !cert) throw new Error("Certificado A1 sem chave privada ou certificado.");
    /* Chave e certificado do titular: o certificado cuja chave pública é a da chave privada. */
    const certTitular =
      certs.find(
        (c) =>
          c.cert?.publicKey &&
          (c.cert.publicKey as import("node-forge").pki.rsa.PublicKey).n.compareTo(
            (key as import("node-forge").pki.rsa.PrivateKey).n
          ) === 0
      )?.cert ?? cert;
    const p7s = this.montarCadesAdRb(
      forge,
      conteudo,
      key as import("node-forge").pki.rsa.PrivateKey,
      certTitular,
      certs.map((c) => c.cert).filter((c): c is import("node-forge").pki.Certificate => !!c)
    );
    return { p7s, titular: certTitular.subject.getField("CN")?.value ?? null };
  }

  /**
   * CAdES destacado com a política AD-RB v2.3 da ICP-Brasil (DOC-ICP-15.03, OID
   * 2.16.76.1.7.1.1.2.3, hash SHA-256 conferido na LPA do ITI): atributos assinados
   * contentType, messageDigest, signingTime, signingCertificateV2 e signaturePolicyId.
   */
  private montarCadesAdRb(
    forge: typeof import("node-forge"),
    conteudo: Buffer,
    key: import("node-forge").pki.rsa.PrivateKey,
    cert: import("node-forge").pki.Certificate,
    cadeia: import("node-forge").pki.Certificate[]
  ): Buffer {
    const { asn1, pki, md, util } = forge;
    const U = asn1.Class.UNIVERSAL;
    const T = asn1.Type;
    const seq = (v: unknown[]) => asn1.create(U, T.SEQUENCE, true, v as never);
    const set = (v: unknown[]) => asn1.create(U, T.SET, true, v as never);
    const oid = (o: string) => asn1.create(U, T.OID, false, asn1.oidToDer(o).getBytes());
    const octets = (b: string) => asn1.create(U, T.OCTETSTRING, false, b);
    const nulo = () => asn1.create(U, T.NULL, false, "");
    const algSha256 = () => seq([oid(pki.oids.sha256), nulo()]);
    const attr = (tipo: string, valor: unknown) => seq([oid(tipo), set([valor])]);

    const OID_SIGNING_CERT_V2 = "1.2.840.113549.1.9.16.2.47";
    const OID_SIG_POLICY_ID = "1.2.840.113549.1.9.16.2.15";
    const OID_SPQ_URI = "1.2.840.113549.1.9.16.5.1";
    const OID_SHA256_RSA = "1.2.840.113549.1.1.11";

    const certAsn1 = pki.certificateToAsn1(cert);
    const certDer = asn1.toDer(certAsn1).getBytes();
    const tbs = (certAsn1.value as Array<{ value: unknown[] }>)[0].value as Array<{
      tagClass: number;
    }>;
    const base = tbs[0].tagClass === asn1.Class.CONTEXT_SPECIFIC ? 1 : 0;
    const serialAsn1 = tbs[base];
    const issuerAsn1 = tbs[base + 2];

    const hashCert = md.sha256.create().update(certDer).digest().getBytes();
    const issuerSerial = seq([
      seq([asn1.create(asn1.Class.CONTEXT_SPECIFIC, 4, true, [issuerAsn1] as never)]),
      serialAsn1
    ]);
    const signingCertV2 = seq([seq([seq([octets(hashCert), issuerSerial])])]);

    const politica = seq([
      oid(ICP_POLITICA_AD_RB.oid),
      seq([algSha256(), octets(util.hexToBytes(ICP_POLITICA_AD_RB.sha256))]),
      seq([seq([oid(OID_SPQ_URI), asn1.create(U, T.IA5STRING, false, ICP_POLITICA_AD_RB.uri)])])
    ]);

    const digestConteudo = md.sha256
      .create()
      .update(conteudo.toString("binary"))
      .digest()
      .getBytes();
    const atributos = [
      attr(pki.oids.contentType, oid(pki.oids.data)),
      attr(pki.oids.messageDigest, octets(digestConteudo)),
      attr(pki.oids.signingTime, asn1.create(U, T.UTCTIME, false, asn1.dateToUtcTime(new Date()))),
      attr(OID_SIGNING_CERT_V2, signingCertV2),
      attr(OID_SIG_POLICY_ID, politica)
    ];
    /* SET OF em DER: elementos ordenados pelo valor codificado. */
    const ordenados = atributos
      .map((a) => asn1.toDer(a).getBytes())
      .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    const setDer = asn1.toDer(set(atributos)).getBytes();
    const prefixo = setDer.slice(0, setDer.length - ordenados.join("").length);
    const aSerAssinado = prefixo + ordenados.join("");
    const assinatura = key.sign(md.sha256.create().update(aSerAssinado));

    const atributosAsn1 = asn1.fromDer(aSerAssinado);
    /* [0] IMPLICIT: mesma codificação do SET, com a etiqueta trocada. */
    const atributosImplicitos = asn1.create(
      asn1.Class.CONTEXT_SPECIFIC,
      0,
      true,
      atributosAsn1.value as never
    );
    const signerInfo = seq([
      asn1.create(U, T.INTEGER, false, String.fromCharCode(1)),
      seq([issuerAsn1, serialAsn1]),
      algSha256(),
      atributosImplicitos,
      seq([oid(OID_SHA256_RSA), nulo()]),
      octets(assinatura)
    ]);
    const signedData = seq([
      asn1.create(U, T.INTEGER, false, String.fromCharCode(1)),
      set([algSha256()]),
      seq([oid(pki.oids.data)]),
      asn1.create(
        asn1.Class.CONTEXT_SPECIFIC,
        0,
        true,
        cadeia.map((c) => pki.certificateToAsn1(c)) as never
      ),
      set([signerInfo])
    ]);
    const contentInfo = seq([
      oid(pki.oids.signedData),
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData] as never)
    ]);
    return Buffer.from(asn1.toDer(contentInfo).getBytes(), "binary");
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
