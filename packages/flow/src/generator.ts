import { flowId, nodeSize, type FlowEdge, type FlowGraph, type FlowNode, type NodeKind } from "./model";

/**
 * Builds a plausible-looking automation for a form field: a layered graph
 * from a trigger to one or more end states. Deterministic for a given seed.
 */

const ACTIONS = [
  ["Validate value", "regex · required"],
  ["Normalize input", "trim · case"],
  ["Lookup record", "by key"],
  ["Create task", "assignee: owner"],
  ["Update record", "set stage"],
  ["Compute total", "sum · round"],
  ["Enqueue job", "retry ×3"],
  ["Call webhook", "POST · JSON"],
  ["Assign owner", "round-robin"],
  ["Schedule follow-up", "+2 days"],
  ["Archive item", "soft delete"],
  ["Recalculate score", "weights v2"]
];
const CONDITIONS = ["Is empty?", "Value changed?", "Amount > 10k?", "Status = Won?", "Owner set?", "Duplicate?", "Weekend?", "Approved?"];
const DATA = [
  ["Read contact", "CRM · contacts"],
  ["Read deal", "CRM · deals"],
  ["Fetch rates", "API · fx"],
  ["Load template", "storage"]
];
const NOTIFY = [
  ["Notify owner", "email"],
  ["Post to channel", "chat"],
  ["Send SMS", "gateway"],
  ["Push to mobile", "app"]
];
const ENDS = ["Done", "Rejected", "Skipped", "Escalated"];
const YES = ["yes", "true", "match"];
const NO = ["no", "false", "else"];
const LINK = ["", "", "on success", "next", "then", "after save"];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateOptions {
  seed?: number;
  /** Name of the field the automation is attached to. */
  subject?: string;
  layers?: number;
}

export function generateFlow(opts: GenerateOptions = {}): FlowGraph {
  const rnd = mulberry32(opts.seed ?? Math.floor(Math.random() * 1e9));
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  // Titles are drawn without replacement so one scheme never repeats a step.
  const bag = <T>(arr: readonly T[]) => {
    const pool = [...arr];
    return (): T => {
      if (!pool.length) pool.push(...arr);
      return pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    };
  };
  const nextAction = bag(ACTIONS);
  const nextCondition = bag(CONDITIONS);
  const nextData = bag(DATA);
  const nextNotify = bag(NOTIFY);
  const nextEnd = bag(ENDS);
  const layers = opts.layers ?? 3 + Math.floor(rnd() * 2); // 3..4 middle layers
  const subject = opts.subject ?? "field";

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const add = (kind: NodeKind, title: string, subtitle?: string): FlowNode => {
    const node: FlowNode = { id: flowId("n"), kind, title, subtitle, x: 0, y: 0 };
    nodes.push(node);
    return node;
  };
  const link = (from: FlowNode, to: FlowNode, label?: string) => {
    edges.push({ id: flowId("e"), from: from.id, to: to.id, label });
  };

  const start = add("start", "On change", subject);
  let frontier: { node: FlowNode; label?: string }[] = [{ node: start }];
  const rows: FlowNode[][] = [[start]];

  for (let l = 0; l < layers; l++) {
    const row: FlowNode[] = [];
    const sources: FlowNode[] = [];
    const next: { node: FlowNode; label?: string }[] = [];
    for (const f of frontier) {
      // Two branches that reach the same layer sometimes merge into one node,
      // but never the two outcomes of the same condition.
      if (row.length && sources[row.length - 1] !== f.node && rnd() < 0.18) {
        const target = row[row.length - 1];
        link(f.node, target, f.label);
        continue;
      }
      const r = rnd();
      let node: FlowNode;
      const canBranch = l < layers - 1 && next.length < 4;
      if (canBranch && r < (l === 0 ? 0.8 : 0.42)) {
        node = add("condition", nextCondition());
        next.push({ node, label: pick(YES) }, { node, label: pick(NO) });
      } else if (r < 0.58) {
        const d = nextData();
        node = add("data", d[0], d[1]);
        next.push({ node, label: pick(LINK) });
      } else if (r < 0.72) {
        const nn = nextNotify();
        node = add("notify", nn[0], nn[1]);
        next.push({ node, label: pick(LINK) });
      } else {
        const a = nextAction();
        node = add("action", a[0], a[1]);
        next.push({ node, label: pick(LINK) });
      }
      link(f.node, node, f.label);
      row.push(node);
      sources.push(f.node);
      if (row.length >= 5) break;
    }
    rows.push(row);
    frontier = next.slice(0, 5);
  }

  // Terminal layer.
  const ends: FlowNode[] = [];
  const endSources = new Map<string, FlowNode>();
  for (const f of frontier) {
    let end = ends.find((e) => endSources.get(e.id) !== f.node && rnd() < 0.35);
    if (!end) {
      end = add("end", nextEnd());
      ends.push(end);
      endSources.set(end.id, f.node);
    }
    link(f.node, end, f.label);
  }
  rows.push(ends);

  layout(rows);
  return { nodes, edges };
}

/** Simple layered layout: rows top to bottom, each row centered on x = 0. */
export function layout(rows: FlowNode[][]): void {
  const GAP_X = 48;
  const GAP_Y = 76;
  let y = 0;
  for (const row of rows) {
    const widths = row.map((n) => nodeSize(n.kind).w);
    const total = widths.reduce((a, b) => a + b, 0) + GAP_X * (row.length - 1);
    let x = -total / 2;
    const h = Math.max(...row.map((n) => nodeSize(n.kind).h));
    row.forEach((n, i) => {
      n.x = x + widths[i] / 2;
      n.y = y + h / 2;
      x += widths[i] + GAP_X;
    });
    y += h + GAP_Y;
  }
}
