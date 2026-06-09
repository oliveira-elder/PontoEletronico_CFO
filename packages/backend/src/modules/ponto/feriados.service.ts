import { Injectable, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

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
    const dia = data.getDay();
    // Domingo (0) ou Sábado (6) são repouso semanal
    if (dia === 0 || dia === 6) return true;

    const ano = data.getFullYear();
    const feriados = await this.getFeriadosDoAno(ano);
    const fds = new Set(feriados.map((f) => f.date));

    // Verifica os próximos `vedacaoDias` dias (inclusive o próprio)
    for (let i = 0; i <= vedacaoDias; i++) {
      const d = new Date(data);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const diaSemana = d.getDay();
      if (fds.has(key) || diaSemana === 0 || diaSemana === 6) return true;
    }
    return false;
  }
}
