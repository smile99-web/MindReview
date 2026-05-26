'use client';

import { FormulaView } from './FormulaView';
import { TimelineView } from './TimelineView';
import { ForceDiagram } from './ForceDiagram';
import { ReactionView } from './ReactionView';
import { CausalChainView } from './CausalChainView';

type RepresentationData = Record<string, unknown>;
type FormulaData = Parameters<typeof FormulaView>[0]['data'];
type TimelineData = Parameters<typeof TimelineView>[0]['data'];
type ForceData = Parameters<typeof ForceDiagram>[0]['data'];
type ReactionData = Parameters<typeof ReactionView>[0]['data'];
type CausalData = Parameters<typeof CausalChainView>[0]['data'];

interface RepresentationViewProps {
  node: {
    title: string;
    summary?: string;
    subject?: { name: string };
    representationType?: string | null;
    representationData?: RepresentationData | null;
  };
  className?: string;
}

export function RepresentationView({ node, className = '' }: RepresentationViewProps) {
  const subject = node.subject?.name || '';
  const type = node.representationType || '';
  const data = node.representationData || {};

  if (subject === '鏁板' && (type === 'formula' || type === 'step')) {
    return <FormulaView data={data as FormulaData} title={node.title} />;
  }

  if (subject === '鐗╃悊') {
    if (type === 'force') {
      return <ForceDiagram data={data as ForceData} title={node.title} />;
    }
    if (type === 'formula' || type === 'concept') {
      return <FormulaView data={data as FormulaData} title={node.title} />;
    }
  }

  if (subject === '鍖栧' && (type === 'reaction' || type === 'experiment')) {
    return <ReactionView data={data as ReactionData} title={node.title} />;
  }

  if (subject === '鍘嗗彶') {
    if (type === 'timeline') {
      return <TimelineView data={data as TimelineData} title={node.title} />;
    }
    if (type === 'causal') {
      return <CausalChainView data={data as CausalData} title={node.title} />;
    }
  }

  if (subject === '閬撴硶' && (type === 'causal' || type === 'viewpoint')) {
    return <CausalChainView data={data as CausalData} title={node.title} />;
  }

  if (data.formula || data.steps) {
    return <FormulaView data={data as FormulaData} title={node.title} />;
  }
  if (data.events) {
    return <TimelineView data={data as TimelineData} title={node.title} />;
  }
  if (data.reactants || data.equation) {
    return <ReactionView data={data as ReactionData} title={node.title} />;
  }
  if (data.nodes && data.edges) {
    return <CausalChainView data={data as CausalData} title={node.title} />;
  }

  return (
    <div className={`rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center ${className}`}>
      <p className="text-sm text-slate-400">No visualization data yet</p>
      <p className="text-xs text-slate-300 mt-1">Generate an image to create visual content</p>
    </div>
  );
}
