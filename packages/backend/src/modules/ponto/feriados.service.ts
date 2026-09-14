import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { dataBrasiliaISO, somarDiasCivil } from "../../utils/horario-brasilia";

export interface Feriado {
  date: string; // "YYYY-MM-DD"
  name: string;
  type: string;
}

@Injectable()
export class FeriadosService {
  private readonly logger = new Logger(FeriadosService.name);
  private readonly cache = new Map<number, { data: Feriado[]; fetchedAt: number }>();
  private readonly TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

  constructor(private readonly http: HttpService) {}

  async getFeriadosDoAno(ano: number): Promise<Feriado[]> {
    const cached = this.cache.get(ano);
    if (cached && Date.now() - cached.fetchedAt < this.TTL_MS) {
      return cached.data;
    }
    try {
      const response = await firstValueFrom(
        this.http.get<Feriado[]>(`https://brasilapi.com.br/api/feriados/v1/${ano}`, {
          timeout: 8000
        })
      );
      const data = (response as { data: Feriado[] }).data ?? [];
      this.cache.set(ano, { data, fetchedAt: Date.now() });
      return data;
    } catch (err) {
      this.logger.warn(`Não foi possível buscar feriados de ${ano}: ${String(err)}`);
      return this.cache.get(ano)?.data ?? [];
    }
  }

  async isDataVedadaFerias(data: Date, vedacaoDias = 2): Promise<boolean> {
    const startIso = dataBrasiliaISO(data);
    const [y0, m0, d0] = startIso.split("-").map(Number);
    const dia = new Date(y0, m0 - 1, d0).getDay();
    if (dia === 0 || dia === 6) return true;

    const ano = y0;
    const feriados = await this.getFeriadosDoAno(ano);
    const fds = new Set(feriados.map((f) => f.date));

    for (let i = 0; i <= vedacaoDias; i++) {
      const key = somarDiasCivil(startIso, i);
      const [y, m, d] = key.split("-").map(Number);
      const diaSemana = new Date(y, m - 1, d).getDay();
      if (fds.has(key) || diaSemana === 0 || diaSemana === 6) return true;
    }
    return false;
  }
}
