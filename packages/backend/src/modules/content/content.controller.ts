import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";

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
export class ContentController {
  private contents: PublicContent[] = [];
  private banners: Banner[] = [];
  private nextId = 1;

  @Post("items")
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
  createBanner(@Body() payload: Omit<Banner, "id">) {
    const banner: Banner = { id: String(this.nextId++), ...payload };
    this.banners.push(banner);
    return banner;
  }
}
