import { Body, Controller, Post } from "@nestjs/common";
import { ChatService } from "./chat.service";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post("ask")
  ask(@Body() payload: { message: string; areaCode?: string }) {
    return this.chatService.answer(payload.message, payload.areaCode);
  }
}
