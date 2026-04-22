import { Injectable } from "@nestjs/common";
import axios from "axios";

@Injectable()
export class GlpiService {
  async buildSsoRedirect(userExternalId: string): Promise<{ url: string }> {
    const baseUrl = process.env.GLPI_BASE_URL ?? "http://localhost:8080";
    return { url: `${baseUrl}/front/ticket.php?external_user=${encodeURIComponent(userExternalId)}` };
  }

  async createTicket(payload: { title: string; content: string; requester: string }) {
    const glpiApiUrl = process.env.GLPI_API_URL;
    if (!glpiApiUrl) {
      return { simulated: true, id: `SIM-${Date.now()}`, ...payload };
    }
    const response = await axios.post(`${glpiApiUrl}/tickets`, payload);
    return response.data;
  }
}
