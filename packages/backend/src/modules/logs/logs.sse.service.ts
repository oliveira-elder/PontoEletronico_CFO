import { Injectable } from "@nestjs/common";
import { Subject, Observable } from "rxjs";

export interface LogSseEvent {
  id: string;
  category: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  username: string | null;
  ipAddress: string | null;
  createdAt: string;
}

@Injectable()
export class LogsSseService {
  private readonly subject = new Subject<MessageEvent>();

  get events$(): Observable<MessageEvent> {
    return this.subject.asObservable();
  }

  emit(log: LogSseEvent): void {
    const event = new MessageEvent("log", { data: JSON.stringify(log) });
    this.subject.next(event);
  }
}
