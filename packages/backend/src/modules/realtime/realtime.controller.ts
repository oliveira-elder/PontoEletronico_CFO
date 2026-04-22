import { Controller, Get } from "@nestjs/common";

@Controller("realtime")
export class RealtimeController {
  @Get("capabilities")
  capabilities() {
    return {
      videoConferenceEnabled: false,
      signalingProvider: "not-configured",
      message: "Estrutura pronta para WebRTC, recurso desabilitado no MVP."
    };
  }
}
