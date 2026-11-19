// Types for genie.js, for the public app (TypeScript).
export type Rect = { x: number; y: number; width: number; height: number };
export type Origin = Element | DOMRect | Rect | { x: number; y: number };
export type Edge = 'bottom' | 'top' | 'left' | 'right' | 'none';

export interface GenieOptions {
  openMs: number; closeMs: number; smallOpenMs: number; smallCloseMs: number;
  slideEnd: number; translateStart: number;
  slicePx: number; minSlices: number; maxSlices: number; seamPx: number;
  fadeIn: number; backdrop: number;
}
export const GENIE: GenieOptions;

export interface GenieRun {
  finished: Promise<'open' | 'close'>;
  reverse(): void;
  cancel(): void;
  readonly progress: number;
  readonly direction: 'open' | 'close';
}

export function genie(
  panel: HTMLElement,
  trigger: Origin | null,
  options?: Partial<GenieOptions> & {
    direction?: 'open' | 'close'; backdropEl?: HTMLElement | null; small?: boolean;
    durationMs?: number; reduced?: boolean; onFrame?: (f: number) => void;
  },
): GenieRun;

export function genieFrame(panel: HTMLElement, trigger: Origin, progress: number, opts?: GenieOptions): () => void;
export function funnelEdge(panel: Rect, trigger: Rect): Edge;
export function genieRows(f: number, panel: Rect, trigger: Rect, edge: Exclude<Edge, 'none'>, n: number, opts?: GenieOptions): { a: number; c0: number; c1: number }[];
export function genieOutline(f: number, panel: Rect, trigger: Rect, opts?: GenieOptions, n?: number): [number, number][] | null;
export function quadMatrix(w: number, h: number, quad: [number, number][]): number[] | null;
export function applyMatrix(m: number[], x: number, y: number): [number, number];
export const easeInOutSine: (t: number) => number;
export const smoothstep: (h: number) => number;
