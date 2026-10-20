import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";

type ContentStatus = "DRAFT" | "APPROVED" | "PUBLISHED";

interface PublicContent {
  id: string;
  areaCode: string;
  title: string;
  body: string;
  status: ContentStatus;
}

interface Banner {
  id: string;
  areaCode: string;
  title: string;
  imageUrl: string;
  active: boolean;
}

@Controller("content")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ContentController {
  private contents: PublicContent[] = [];
  private banners: Banner[] = [];
  private nextId = 1;

  @Post("items")
  @Roles("ponto-admin", "PONTO_ADMIN")
  create(@Body() payload: Omit<PublicContent, "id" | "status">) {
    const item: PublicContent = {
      id: String(this.nextId++),
      status: "DRAFT",
      ...payload
    };
    this.contents.push(item);
    return item;
  }

  @Patch("items/:id/status")
  @Roles("ponto-admin", "PONTO_ADMIN")
  changeStatus(@Param("id") id: string, @Body() body: { status: ContentStatus }) {
    const item = this.contents.find((entry) => entry.id === id);
    if (!item) return { error: "not_found" };
    item.status = body.status;
    return item;
  }

  @Get("public/index")
  getPublicIndex() {
    return {
      content: this.contents.filter((entry) => entry.status === "PUBLISHED"),
      banners: this.banners.filter((entry) => entry.active)
    };
  }

  @Post("banners")
  @Roles("ponto-admin", "PONTO_ADMIN")
  createBanner(@Body() payload: Omit<Banner, "id">) {
    const banner: Banner = { id: String(this.nextId++), ...payload };
    this.banners.push(banner);
    return banner;
  }
}
