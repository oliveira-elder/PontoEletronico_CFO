import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccessibilityMenu } from "./AccessibilityMenu";

const DEFAULT_STORAGE_KEY = "accessibility-settings-v1";
const CUSTOM_STORAGE_KEY = "consumer-accessibility-settings";
const ACCESSIBILITY_CLASSES = [
  "intranet-a11y-grayscale",
  "intranet-a11y-high-contrast",
  "intranet-a11y-negative-contrast",
  "intranet-a11y-light-background",
  "intranet-a11y-underline-links",
  "intranet-a11y-readable-font"
];

const VISUAL_PREFERENCES = [
  ["Escala de cinza", "intranet-a11y-grayscale"],
  ["Alto Contraste", "intranet-a11y-high-contrast"],
  ["Contraste Negativo", "intranet-a11y-negative-contrast"],
  ["Fundo Claro", "intranet-a11y-light-background"],
  ["Links Sublinhados", "intranet-a11y-underline-links"],
  ["Fonte Legível", "intranet-a11y-readable-font"]
] as const;

function resetDocumentPreferences() {
  window.localStorage.clear();
  document.documentElement.style.removeProperty("--intranet-a11y-font-scale");
  document.documentElement.classList.remove(...ACCESSIBILITY_CLASSES);
}

function openAccessibilityPanel() {
  const trigger = screen.getByRole("button", { name: "Abrir opções de acessibilidade" });
  fireEvent.click(trigger);
  return trigger;
}

function clickActionRepeatedly(label: string, times: number) {
  const action = screen.getByRole("button", { name: label });

  for (let index = 0; index < times; index += 1) {
    fireEvent.click(action);
  }
}

describe("AccessibilityMenu", () => {
  beforeEach(resetDocumentPreferences);
  afterEach(cleanup);

  it("should open the accessibility panel with its accessible relationship", () => {
    render(<AccessibilityMenu />);

    const trigger = openAccessibilityPanel();

    expect(trigger).toHaveAttribute("aria-controls", "intranet-a11y-panel");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("region", { name: "Acessibilidade" })).toBeInTheDocument();
  });

  it.each(VISUAL_PREFERENCES)("should apply %s to the document root", (label, className) => {
    render(<AccessibilityMenu />);

    openAccessibilityPanel();
    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(document.documentElement).toHaveClass(className);
  });

  it("should keep only the most recently selected contrast mode active", () => {
    render(<AccessibilityMenu />);

    openAccessibilityPanel();
    fireEvent.click(screen.getByRole("button", { name: "Alto Contraste" }));
    fireEvent.click(screen.getByRole("button", { name: "Contraste Negativo" }));

    expect(document.documentElement).not.toHaveClass("intranet-a11y-high-contrast");
    expect(document.documentElement).toHaveClass("intranet-a11y-negative-contrast");
  });

  it.each([
    ["Aumentar Texto", 8, "150%", "1.5"],
    ["Diminuir Texto", 6, "70%", "0.7"]
  ])(
    "should limit %s to the supported font scale",
    (label, clicks, expectedLabel, expectedScale) => {
      render(<AccessibilityMenu />);

      openAccessibilityPanel();
      clickActionRepeatedly(label, clicks);

      expect(screen.getByRole("status")).toHaveTextContent(expectedLabel);
      expect(document.documentElement.style.getPropertyValue("--intranet-a11y-font-scale")).toBe(
        expectedScale
      );
    }
  );

  it("should persist settings with a custom storage key and restore them on the next mount", () => {
    const storedSettings = {
      fontScale: 2,
      grayscale: true,
      contrastMode: "high",
      underlineLinks: true,
      readableFont: true
    };
    window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(storedSettings));

    render(<AccessibilityMenu storageKey={CUSTOM_STORAGE_KEY} />);

    expect(document.documentElement).toHaveClass(
      "intranet-a11y-grayscale",
      "intranet-a11y-high-contrast",
      "intranet-a11y-underline-links",
      "intranet-a11y-readable-font"
    );
    expect(document.documentElement.style.getPropertyValue("--intranet-a11y-font-scale")).toBe(
      "1.2"
    );
  });

  it("should save interactions under the supplied storage key", () => {
    render(<AccessibilityMenu storageKey={CUSTOM_STORAGE_KEY} />);

    openAccessibilityPanel();
    fireEvent.click(screen.getByRole("button", { name: "Escala de cinza" }));

    expect(JSON.parse(window.localStorage.getItem(CUSTOM_STORAGE_KEY) ?? "{}")).toMatchObject({
      grayscale: true
    });
    expect(window.localStorage.getItem(DEFAULT_STORAGE_KEY)).toBeNull();
  });

  it("should reset every preference to its default state", () => {
    render(<AccessibilityMenu />);

    openAccessibilityPanel();
    fireEvent.click(screen.getByRole("button", { name: "Escala de cinza" }));
    fireEvent.click(screen.getByRole("button", { name: "Alto Contraste" }));
    fireEvent.click(screen.getByRole("button", { name: "Aumentar Texto" }));
    fireEvent.click(screen.getByRole("button", { name: "Reiniciar" }));

    expect(JSON.parse(window.localStorage.getItem(DEFAULT_STORAGE_KEY) ?? "{}")).toEqual({
      fontScale: 0,
      grayscale: false,
      contrastMode: "default",
      underlineLinks: false,
      readableFont: false
    });
    expect(document.documentElement.classList.contains("intranet-a11y-grayscale")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--intranet-a11y-font-scale")).toBe("1");
  });

  it("should close with Escape and return focus to the trigger", () => {
    render(<AccessibilityMenu />);

    const trigger = openAccessibilityPanel();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("region", { name: "Acessibilidade" })).not.toBeInTheDocument();
  });
});
