import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, RefObject } from "react";
import {
  Accessibility,
  Check,
  Circle,
  Contrast,
  Eye,
  Link,
  RotateCcw,
  Sun,
  Type,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useIsMobile } from "../../hooks/useIsMobile";

const DEFAULT_STORAGE_KEY = "accessibility-settings-v1";
const MIN_FONT_SCALE = -3;
const MAX_FONT_SCALE = 5;
const PANEL_ID = "intranet-a11y-panel";

type ContrastMode = "default" | "high" | "negative" | "light";
type TogglePreference = "grayscale" | "underlineLinks" | "readableFont";

interface AccessibilitySettings {
  fontScale: number;
  grayscale: boolean;
  contrastMode: ContrastMode;
  underlineLinks: boolean;
  readableFont: boolean;
}

interface PanelActionProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
}

interface TextSizeControlsProps {
  fontScale: number;
  onChange: (amount: number) => void;
}

interface VisualPreferenceListProps {
  settings: AccessibilitySettings;
  onTogglePreference: (preference: TogglePreference) => void;
  onToggleContrastMode: (mode: Exclude<ContrastMode, "default">) => void;
}

interface AccessibilityPanelProps extends VisualPreferenceListProps {
  onClose: () => void;
  onChangeFontScale: (amount: number) => void;
  onReset: () => void;
  modal?: boolean;
}

interface VisualOption {
  label: string;
  icon: LucideIcon;
  preference?: TogglePreference;
  mode?: Exclude<ContrastMode, "default">;
}

export interface AccessibilityMenuProps {
  /** Key used to persist preferences in localStorage. Keep this value stable after mounting. */
  storageKey?: string;
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  fontScale: 0,
  grayscale: false,
  contrastMode: "default",
  underlineLinks: false,
  readableFont: false
};

const VISUAL_OPTIONS: readonly VisualOption[] = [
  { label: "Escala de cinza", icon: Circle, preference: "grayscale" },
  { label: "Alto Contraste", icon: Contrast, mode: "high" },
  { label: "Contraste Negativo", icon: Eye, mode: "negative" },
  { label: "Fundo Claro", icon: Sun, mode: "light" },
  { label: "Links Sublinhados", icon: Link, preference: "underlineLinks" },
  { label: "Fonte Legível", icon: Type, preference: "readableFont" }
];

function clampFontScale(value: number): number {
  return Math.min(Math.max(value, MIN_FONT_SCALE), MAX_FONT_SCALE);
}

function isContrastMode(value: unknown): value is ContrastMode {
  return value === "default" || value === "high" || value === "negative" || value === "light";
}

function readStoredSettings(storageKey: string): AccessibilitySettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };

  try {
    const storedSettings = window.localStorage.getItem(storageKey);
    if (!storedSettings) return { ...DEFAULT_SETTINGS };

    const parsedSettings = JSON.parse(storedSettings) as Partial<AccessibilitySettings>;
    const fontScale = Number(parsedSettings.fontScale);
    return {
      fontScale: Number.isFinite(fontScale) ? clampFontScale(fontScale) : 0,
      grayscale: parsedSettings.grayscale === true,
      contrastMode: isContrastMode(parsedSettings.contrastMode)
        ? parsedSettings.contrastMode
        : "default",
      underlineLinks: parsedSettings.underlineLinks === true,
      readableFont: parsedSettings.readableFont === true
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function applySettings(settings: AccessibilitySettings) {
  const root = document.documentElement;
  const scale = 1 + settings.fontScale * 0.1;

  root.style.setProperty("--intranet-a11y-font-scale", String(scale));
  root.classList.toggle("intranet-a11y-grayscale", settings.grayscale);
  root.classList.toggle("intranet-a11y-high-contrast", settings.contrastMode === "high");
  root.classList.toggle("intranet-a11y-negative-contrast", settings.contrastMode === "negative");
  root.classList.toggle("intranet-a11y-light-background", settings.contrastMode === "light");
  root.classList.toggle("intranet-a11y-underline-links", settings.underlineLinks);
  root.classList.toggle("intranet-a11y-readable-font", settings.readableFont);
}

function saveSettings(storageKey: string, settings: AccessibilitySettings) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    return;
  }
}

function useAccessibilitySettings(storageKey: string) {
  const [settings, setSettings] = useState(() => readStoredSettings(storageKey));

  useEffect(() => {
    applySettings(settings);
    saveSettings(storageKey, settings);
  }, [settings, storageKey]);

  const changeFontScale = (amount: number) => {
    setSettings((current) => ({
      ...current,
      fontScale: clampFontScale(current.fontScale + amount)
    }));
  };
  const togglePreference = (preference: TogglePreference) => {
    setSettings((current) => ({ ...current, [preference]: !current[preference] }));
  };
  const toggleContrastMode = (mode: Exclude<ContrastMode, "default">) => {
    setSettings((current) => ({
      ...current,
      contrastMode: current.contrastMode === mode ? "default" : mode
    }));
  };

  return {
    settings,
    changeFontScale,
    togglePreference,
    toggleContrastMode,
    resetSettings: () => setSettings({ ...DEFAULT_SETTINGS })
  };
}

function PanelAction({ label, icon: Icon, onClick, active }: PanelActionProps) {
  const className = active
    ? "intranet-a11y-action intranet-a11y-action--active"
    : "intranet-a11y-action";

  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={className}>
      <Icon size={17} aria-hidden="true" />
      <span>{label}</span>
      {active ? <Check size={16} aria-hidden="true" /> : null}
    </button>
  );
}

function TextSizeControls({ fontScale, onChange }: TextSizeControlsProps) {
  const scaleLabel = `${100 + fontScale * 10}%`;

  return (
    <section aria-label="Tamanho do texto" className="intranet-a11y-text-size-controls">
      <div className="intranet-a11y-section-label">
        <span>Tamanho do texto</span>
        <output role="status" aria-live="polite">
          {scaleLabel}
        </output>
      </div>
      <PanelAction label="Aumentar Texto" icon={ZoomIn} onClick={() => onChange(1)} />
      <PanelAction label="Diminuir Texto" icon={ZoomOut} onClick={() => onChange(-1)} />
    </section>
  );
}

function isVisualOptionActive(settings: AccessibilitySettings, option: VisualOption): boolean {
  if (option.preference) return settings[option.preference];
  return settings.contrastMode === option.mode;
}

function VisualPreferenceList({
  settings,
  onTogglePreference,
  onToggleContrastMode
}: VisualPreferenceListProps) {
  return (
    <section aria-label="Preferências visuais" className="intranet-a11y-preferences">
      {VISUAL_OPTIONS.map((option) => (
        <PanelAction
          key={option.label}
          label={option.label}
          icon={option.icon}
          active={isVisualOptionActive(settings, option)}
          onClick={() => {
            if (option.preference) return onTogglePreference(option.preference);
            if (option.mode) return onToggleContrastMode(option.mode);
          }}
        />
      ))}
    </section>
  );
}

function AccessibilityPanel({
  settings,
  onClose,
  onChangeFontScale,
  onTogglePreference,
  onToggleContrastMode,
  onReset,
  modal
}: AccessibilityPanelProps) {
  return (
    <aside
      id={PANEL_ID}
      role="region"
      aria-label="Acessibilidade"
      aria-modal={modal ? true : undefined}
      className="intranet-a11y-panel"
    >
      <div className="intranet-a11y-sheet-handle" aria-hidden="true" />
      <AccessibilityPanelHeader onClose={onClose} />
      <TextSizeControls fontScale={settings.fontScale} onChange={onChangeFontScale} />
      <VisualPreferenceList
        settings={settings}
        onTogglePreference={onTogglePreference}
        onToggleContrastMode={onToggleContrastMode}
      />
      <PanelAction label="Reiniciar" icon={RotateCcw} onClick={onReset} />
    </aside>
  );
}

function AccessibilityPanelHeader({ onClose }: { onClose: () => void }) {
  return (
    <header className="intranet-a11y-panel-header">
      <div className="intranet-a11y-panel-title">
        <Accessibility size={21} aria-hidden="true" />
        <h2>Acessibilidade</h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="intranet-a11y-close"
        aria-label="Fechar acessibilidade"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </header>
  );
}

function useAccessibilityPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closePanel = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closePanel, isOpen]);

  return { closePanel, isOpen, openPanel: () => setIsOpen(true), triggerRef };
}

const DRAG_THRESHOLD_PX = 6;
const TOP_GAP_PX = 8;
const BOTTOM_GAP_PX = 12;

function readCssPx(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const n = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(n) ? n : fallback;
}

function clampIconTop(top: number, buttonSize: number): number {
  const topbar = readCssPx("--topbar-h", 132);
  const minTop = topbar + TOP_GAP_PX;
  const maxTop = Math.max(minTop, window.innerHeight - buttonSize - BOTTOM_GAP_PX);
  return Math.min(Math.max(top, minTop), maxTop);
}

function readStoredIconTop(storageKey: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${storageKey}:iconTop`);
    if (raw == null) return null;
    const top = Number(raw);
    return Number.isFinite(top) ? top : null;
  } catch {
    return null;
  }
}

function saveIconTop(storageKey: string, top: number) {
  try {
    window.localStorage.setItem(`${storageKey}:iconTop`, String(top));
  } catch {
    return;
  }
}

function useVerticalIconPosition(storageKey: string, menuRef: RefObject<HTMLDivElement>) {
  const [top, setTop] = useState<number | null>(() => readStoredIconTop(storageKey));
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({
    active: false,
    moved: false,
    suppressClick: false,
    pointerId: -1,
    startY: 0,
    startTop: 0
  });

  const measureButtonSize = useCallback(() => {
    return menuRef.current?.querySelector("button")?.getBoundingClientRect().height ?? 56;
  }, [menuRef]);

  const applyTop = useCallback(
    (nextTop: number) => {
      const clamped = clampIconTop(nextTop, measureButtonSize());
      setTop(clamped);
      return clamped;
    },
    [measureButtonSize]
  );

  useEffect(() => {
    const clampNow = () => {
      setTop((current) => (current == null ? current : clampIconTop(current, measureButtonSize())));
    };
    clampNow();
    window.addEventListener("resize", clampNow);
    return () => window.removeEventListener("resize", clampNow);
  }, [measureButtonSize]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const el = menuRef.current;
    if (!el) return;
    dragRef.current = {
      active: true,
      moved: false,
      suppressClick: false,
      pointerId: event.pointerId,
      startY: event.clientY,
      startTop: el.getBoundingClientRect().top
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    const delta = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(delta) < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    setDragging(true);
    applyTop(drag.startTop + delta);
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    drag.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      const el = menuRef.current;
      if (el) saveIconTop(storageKey, applyTop(el.getBoundingClientRect().top));
      drag.suppressClick = true;
    }
    setDragging(false);
  };

  return {
    top,
    dragging,
    consumeSuppressedClick: () => {
      if (!dragRef.current.suppressClick) return false;
      dragRef.current.suppressClick = false;
      return true;
    },
    onPointerDown,
    onPointerMove,
    onPointerUp
  };
}

export function AccessibilityMenu({ storageKey = DEFAULT_STORAGE_KEY }: AccessibilityMenuProps) {
  const panel = useAccessibilityPanel();
  const settings = useAccessibilitySettings(storageKey);
  const menuRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile(768);
  const position = useVerticalIconPosition(storageKey, menuRef);
  const useCustomTop = !isMobile && position.top != null;

  useEffect(() => {
    if (!isMobile || !panel.isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, panel.isOpen]);

  const onTriggerClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!isMobile && position.consumeSuppressedClick()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (panel.isOpen) panel.closePanel();
    else panel.openPanel();
  };

  const viewportH = typeof window === "undefined" ? 0 : window.innerHeight;
  const buttonTop =
    position.top ??
    (typeof window === "undefined"
      ? Number.POSITIVE_INFINITY
      : menuRef.current?.getBoundingClientRect().top);
  const openDownward = !isMobile && (buttonTop ?? Number.POSITIVE_INFINITY) < viewportH / 2;

  const className = [
    "intranet-a11y-menu",
    panel.isOpen ? "intranet-a11y-menu--open" : "",
    !isMobile && position.dragging ? "intranet-a11y-menu--dragging" : "",
    useCustomTop ? "intranet-a11y-menu--custom-y" : "",
    panel.isOpen && openDownward ? "intranet-a11y-menu--panel-below" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`intranet-a11y-root${panel.isOpen ? " intranet-a11y-root--open" : ""}`}>
      {isMobile && panel.isOpen ? (
        <div className="intranet-a11y-backdrop" onClick={panel.closePanel} aria-hidden="true" />
      ) : null}
      <div
        ref={menuRef}
        className={className}
        style={useCustomTop ? { top: position.top as number, bottom: "auto" } : undefined}
      >
        <button
          ref={panel.triggerRef}
          type="button"
          onClick={onTriggerClick}
          onPointerDown={isMobile ? undefined : position.onPointerDown}
          onPointerMove={isMobile ? undefined : position.onPointerMove}
          onPointerUp={isMobile ? undefined : position.onPointerUp}
          onPointerCancel={isMobile ? undefined : position.onPointerUp}
          aria-label={
            panel.isOpen ? "Fechar opções de acessibilidade" : "Abrir opções de acessibilidade"
          }
          aria-controls={PANEL_ID}
          aria-expanded={panel.isOpen}
          title={isMobile ? "Opções de acessibilidade" : "Arraste na vertical para reposicionar"}
          className="intranet-a11y-trigger"
        >
          <Accessibility size={22} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {panel.isOpen ? (
          <AccessibilityPanel
            settings={settings.settings}
            onClose={panel.closePanel}
            onChangeFontScale={settings.changeFontScale}
            onTogglePreference={settings.togglePreference}
            onToggleContrastMode={settings.toggleContrastMode}
            onReset={settings.resetSettings}
            modal={isMobile}
          />
        ) : null}
      </div>
    </div>
  );
}
