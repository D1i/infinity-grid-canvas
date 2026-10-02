/**
 * Flowchart model for the demo's "automation" editor. Visual only: nodes
 * and labeled edges, no execution semantics.
 */

export type NodeKind = "start" | "action" | "condition" | "data" | "notify" | "end";

export interface FlowNode {
  id: string;
  kind: NodeKind;
  title: string;
  subtitle?: string;
  /** Center position in world units. */
  x: number;
  y: number;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export const NODE_W = 184;
export const NODE_H = 64;
export const COND_W = 160;
export const COND_H = 84;
export const PILL_W = 132;
export const PILL_H = 44;

export function nodeSize(kind: NodeKind): { w: number; h: number } {
  switch (kind) {
    case "start":
    case "end":
      return { w: PILL_W, h: PILL_H };
    case "condition":
      return { w: COND_W, h: COND_H };
    default:
      return { w: NODE_W, h: NODE_H };
  }
}

let n = 0;
export function flowId(prefix: string): string {
  n = (n + 1) % 0xfffff;
  return `${prefix}${n.toString(36)}`;
}
