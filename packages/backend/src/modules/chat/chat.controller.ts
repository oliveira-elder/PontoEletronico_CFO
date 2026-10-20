import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

import { ChatService } from "./chat.service";

@Controller("chat")
@UseGuards(AuthGuard("jwt"))
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post("ask")
  ask(@Body() payload: { message: string; areaCode?: string }) {
    return this.chatService.answer(payload.message, payload.areaCode);
  }
}
