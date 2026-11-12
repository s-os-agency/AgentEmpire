'use client';

import React, { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Terminal, Play, RotateCcw, CheckCircle, XCircle, Clock,
  AlertTriangle, Zap, Shield, TrendingUp, Brain,
  ChevronRight, Edit3, Check, X, Eye, Activity,
  Radio, Cpu, Lock, ArrowRight,
  ArrowLeftRight, ShoppingBag, Scale, DoorOpen, Bot, Hammer, Home, Archive, Map,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type ExecutionMode = 'demo' | 'dry-run' | 'live';
type RunStatus = 'idle' | 'running' | 'awaiting-approval' | 'completed' | 'rejected' | 'blocked' | 'previewed';
type RoomId = 'command' | 'revenue' | 'approval';
type EventStatus = 'running' | 'completed' | 'rejected' | 'pending' | 'awaiting';

interface TimelineEvent {
  id: string;
  ts: string;
  label: string;
  status: EventStatus;
  room?: RoomId;
  detail?: string;
}

interface PendingAction {
  id: string;
  type: string;
  summary: string;
  payload: Record<string, unknown>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SAMPLE_OBJECTIVES = [
  'Launch weekly revenue report → email stakeholders → log to Airtable',
  'Analyze top 3 Shopify products → create content brief → queue for publishing',
  'Review pending leads → score priority → assign follow-up tasks',
];

interface RoomDef {
  id: RoomId;
  label: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string;
  glow: string;
  border: string;
  bg: string;
  offsetY: number;
  minH: number;
}

const ROOMS: RoomDef[] = [
  {
    id: 'command', label: 'Command Room', description: 'Planning & Control',
    Icon: Brain, color: '#38bdf8',
    glow: 'rgba(56,189,248,0.14)', border: 'rgba(56,189,248,0.38)', bg: 'rgba(14,42,71,0.72)',
    offsetY: 8, minH: 176,
  },
  {
    id: 'revenue', label: 'Revenue Room', description: 'Execution & Business',
    Icon: TrendingUp, color: '#34d399',
    glow: 'rgba(52,211,153,0.14)', border: 'rgba(52,211,153,0.38)', bg: 'rgba(10,44,30,0.72)',
    offsetY: 0, minH: 196,
  },
  {
    id: 'approval', label: 'Approval Desk', description: 'Governed Decisions',
    Icon: Shield, color: '#fbbf24',
    glow: 'rgba(251,191,36,0.14)', border: 'rgba(251,191,36,0.38)', bg: 'rgba(44,34,8,0.72)',
    offsetY: 5, minH: 172,
  },
];

// ── City Districts (navigation surface) ───────────────────────────────────────

interface DistrictDef {
  id: string; label: string; description: string; href: string;
  Icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  color: string; glow: string; border: string;
}

const DISTRICTS: DistrictDef[] = [
  { id: 'exchange',  label: 'The Exchange',     description: 'Deals in motion',          href: '/opportunities', Icon: ArrowLeftRight, color: '#f59e0b', glow: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.38)' },
  { id: 'market',    label: 'The Marketplace',  description: 'Offers and assets',         href: '/offers',        Icon: ShoppingBag,    color: '#2dd4bf', glow: 'rgba(45,212,191,0.14)',  border: 'rgba(45,212,191,0.38)' },
  { id: 'tower',     label: 'Broadcast Tower',  description: 'Publish and amplify',       href: '/content',       Icon: Radio,          color: '#a78bfa', glow: 'rgba(167,139,250,0.14)', border: 'rgba(167,139,250,0.38)' },
  { id: 'chamber',   label: 'Council Chamber',  description: 'Strategic choices',         href: '/decisions',     Icon: Scale,          color: '#f472b6', glow: 'rgba(244,114,182,0.14)', border: 'rgba(244,114,182,0.38)' },
  { id: 'arrivals',  label: 'Arrivals Hall',    description: 'Visitors and inquiries',    href: '/leads',         Icon: DoorOpen,       color: '#60a5fa', glow: 'rgba(96,165,250,0.14)',  border: 'rgba(96,165,250,0.38)' },
  { id: 'agency',    label: 'The Agency',       description: 'Agents and citizens',       href: '/agents',        Icon: Bot,            color: '#34d399', glow: 'rgba(52,211,153,0.14)',  border: 'rgba(52,211,153,0.38)' },
  { id: 'yards',     label: 'Work Yards',       description: 'Active work orders',        href: '/tasks',         Icon: Hammer,         color: '#fb923c', glow: 'rgba(251,146,60,0.14)',  border: 'rgba(251,146,60,0.38)' },
  { id: 'quarters',  label: 'The Quarters',     description: 'Personal infrastructure',   href: '/lifestyle',     Icon: Home,           color: '#e879f9', glow: 'rgba(232,121,249,0.14)', border: 'rgba(232,121,249,0.38)' },
  { id: 'archive',   label: 'The Archive',      description: 'Records and configuration', href: '/settings',      Icon: Archive,        color: '#94a3b8', glow: 'rgba(148,163,184,0.14)', border: 'rgba(148,163,184,0.38)' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function stamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function uid() { return Math.random().toString(36).slice(2, 9); }
function delay(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

// ── StatusDot ──────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: EventStatus }) {
  const s: Record<EventStatus, React.CSSProperties> = {
    running:   { background: '#38bdf8', boxShadow: '0 0 6px #38bdf8' },
    completed: { background: '#34d399' },
    rejected:  { background: '#f87171' },
    pending:   { background: '#4b5a73' },
    awaiting:  { background: '#fbbf24', boxShadow: '0 0 6px #fbbf24' },
  };
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      flexShrink: 0, marginTop: 3, ...s[status],
    }} />
  );
}

function PulsingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 4, height: 4, borderRadius: '50%', background: '#38bdf8',
          display: 'inline-block',
          animation: `ace-dot 1.2s ${i * 0.22}s infinite`,
        }} />
      ))}
    </span>
  );
}

// ── CityMap ────────────────────────────────────────────────────────────────────

export function CityMap() {
  const [mode, setMode]             = useState<ExecutionMode>('demo');
  const [status, setStatus]         = useState<RunStatus>('idle');
  const [activeRoom, setActiveRoom] = useState<RoomId | null>(null);
  const [objective, setObjective]   = useState('');
  const [thought, setThought]       = useState('Standing by.');
  const [timeline, setTimeline]     = useState<TimelineEvent[]>([]);
  const [pending, setPending]       = useState<PendingAction | null>(null);
  const [editPayload, setEditPayload] = useState('');
  const [isEditing, setIsEditing]   = useState(false);
  const [apiResult, setApiResult]   = useState<Record<string, unknown> | null>(null);
  const tlRef = useRef<HTMLDivElement>(null);

  const addEvent = useCallback((label: string, s: EventStatus, room?: RoomId, detail?: string) => {
    const evt: TimelineEvent = { id: uid(), ts: stamp(), label, status: s, room, detail };
    setTimeline((prev: TimelineEvent[]) => [evt, ...prev]);
    return evt.id;
  }, []);

  const reset = useCallback(() => {
    setStatus('idle'); setActiveRoom(null); setThought('Standing by.');
    setTimeline([]); setPending(null); setIsEditing(false); setApiResult(null);
  }, []);

  const isLive = status === 'running' || status === 'awaiting-approval';

  const runObjective = useCallback(async () => {
    if (!objective.trim() || isLive) return;
    reset();
    setStatus('running'); setActiveRoom('command');
    addEvent('Run initiated — objective received', 'running', 'command');
    setThought('Reading objective...');

    if (mode === 'live') {
      setActiveRoom('revenue');
      setThought('Requesting execution...');
      try {
        const res = await fetch('/api/agents/run', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: 'general-operator', inputs: { objective: objective.trim(), mode } }),
        });
        const data = await res.json();
        setApiResult(data);
        if (!res.ok || data.ok !== true) throw new Error(data.error || 'Execution request failed.');
        const results = Array.isArray(data.executions) ? data.executions : [];
        const unresolved = results.filter((result: { status: string }) => result.status !== 'executed');
        const objectiveExecuted = results.some((result: { capability: string; status: string }) => result.capability === 'agent.execute' && result.status === 'executed');
        if (!objectiveExecuted || results.length === 0 || unresolved.length > 0) {
          addEvent('Objective remains incomplete', 'rejected', 'revenue',
            unresolved.map((result: { message?: string }) => result.message || 'Action not executed.').join(' ') || 'No objective execution receipt returned.');
          setThought('Execution is incomplete. Review the returned actions and required approvals.');
          setStatus('blocked');
        } else {
          addEvent('Execution results returned', 'completed', 'revenue', 'Review the stored run receipts for the requested outcome.');
          setThought('Execution results returned.');
          setStatus('completed');
        }
      } catch (error) {
        addEvent('Execution request failed', 'rejected', 'revenue', error instanceof Error ? error.message : 'Unknown execution error.');
        setThought('Execution failed. No completion is recorded.');
        setStatus('blocked');
      }
      setActiveRoom(null);
      return;
    }

    setActiveRoom('revenue');
    setThought('Preparing a local preview. No actions will be executed.');
    addEvent('Preview prepared — no execution request sent', 'completed', 'revenue');

    await delay(900);
    setThought('Preparing preview for review...');
    addEvent('Preview ready for review', 'awaiting', 'approval');
    setActiveRoom('approval');

    const actionPayload = {
      objective: objective.trim(), mode,
      subtasks: ['Analyze data', 'Prepare output', 'Deliver to stakeholders'],
      estimatedImpact: 'medium',
      reversible: true,
      requiresExternalCommit: false,
      timestamp: new Date().toISOString(),
    };
    const actionType = mode === 'dry-run' ? 'DRY_RUN_PREVIEW' : 'DEMO_ACTION';

    const actionId = uid();
    const action: PendingAction = {
      id: actionId,
      type: actionType,
      summary: objective.trim().slice(0, 100),
      payload: actionPayload,
    };
    setPending(action);
    setEditPayload(JSON.stringify(action.payload, null, 2));
    setStatus('awaiting-approval');
    setThought('Review the preview. No live action will be executed.');
  }, [objective, isLive, mode, reset, addEvent]);

  const handleApprove = useCallback(async () => {
    if (!pending) return;
    addEvent('Preview reviewed by operator', 'completed', 'approval', pending.summary);
    setThought('Preview reviewed. No live action was executed.');
    setStatus('previewed'); setActiveRoom(null); setPending(null);
  }, [pending, addEvent]);

  const handleReject = useCallback(async () => {
    if (!pending) return;
    addEvent('Preview dismissed by operator', 'rejected', 'approval', pending.summary);
    setThought('Preview dismissed. No live action was executed.');
    setStatus('rejected'); setActiveRoom(null); setPending(null);
  }, [pending, addEvent]);

  const handleEditSave = useCallback(() => {
    if (!pending) return;
    try {
      const parsed = JSON.parse(editPayload) as Record<string, unknown>;
      setPending((prev: PendingAction | null) => prev ? { ...prev, payload: parsed } : prev);
      addEvent('Payload edited by operator', 'awaiting', 'approval');
      setIsEditing(false);
    } catch {
      alert('Invalid JSON — please correct the payload before saving.');
    }
  }, [pending, editPayload, addEvent]);

  const canRun = objective.trim().length > 0 && !isLive;

  // ── Status bar config ──────────────────────────────────────────────────────
  const statusCfg: Record<Exclude<RunStatus, 'idle'>, { bg: string; border: string; color: string; text: string; Icon: React.ComponentType<{size?:number}> }> = {
    running:            { bg: 'rgba(56,189,248,0.07)',  border: 'rgba(56,189,248,0.22)',  color: '#38bdf8', text: 'Agent running…',                                  Icon: Zap },
    'awaiting-approval':{ bg: 'rgba(251,191,36,0.07)',  border: 'rgba(251,191,36,0.22)',  color: '#fbbf24', text: 'Preview ready for review — no live action',      Icon: AlertTriangle },
    blocked: { bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.22)', color: '#f87171', text: 'Execution incomplete — review the results', Icon: AlertTriangle },
    previewed: { bg: 'rgba(56,189,248,0.07)', border: 'rgba(56,189,248,0.22)', color: '#38bdf8', text: 'Preview reviewed — no live action executed', Icon: Eye },
    completed:          { bg: 'rgba(52,211,153,0.07)',  border: 'rgba(52,211,153,0.22)',  color: '#34d399', text: 'Execution results returned',                       Icon: CheckCircle },
    rejected:           { bg: 'rgba(248,113,113,0.07)', border: 'rgba(248,113,113,0.22)', color: '#f87171', text: 'Action rejected — logged to timeline',             Icon: XCircle },
  };

  return (
    <>
      <style>{`
        @keyframes ace-dot {
          0%,80%,100%{opacity:.2;transform:scaleY(.7)}
          40%{opacity:1;transform:scaleY(1)}
        }
        @keyframes ace-glow {
          0%,100%{opacity:.6} 50%{opacity:1}
        }
        .district-card { transition: all 0.22s cubic-bezier(0.4,0,0.2,1); }
        .district-card:hover { transform: translateY(-3px); filter: brightness(1.18); box-shadow: 0 6px 22px rgba(0,0,0,0.28); }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── City district map ──────────────────────────────────────────────── */}
        <div style={{
          borderRadius: 20, border: '1px solid #27324A',
          background: 'linear-gradient(160deg, #0d1829 0%, #0a0f1a 55%, #0c1620 100%)',
          padding: 20, position: 'relative', overflow: 'hidden',
        }}>
          {/* Floor grid */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 20, opacity: 0.10, pointerEvents: 'none',
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse 100% 100% at 50% 50%, black 20%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 100% 100% at 50% 50%, black 20%, transparent 100%)',
          }} />

          {/* Header */}
          <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Map size={13} style={{ color: '#EB5815' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#7E8AA3', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              City Districts
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4b5a73' }}>
              Navigate to any district
            </span>
          </div>

          {/* District grid */}
          <div style={{ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {DISTRICTS.map(d => {
              const { Icon } = d;
              return (
                <Link key={d.id} href={d.href} style={{ textDecoration: 'none', display: 'block' }}>
                  <div className="district-card" style={{
                    borderRadius: 14, border: '1px solid #27324A',
                    background: 'rgba(18,24,38,0.6)', padding: '13px 14px', cursor: 'pointer',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <Icon size={13} style={{ color: d.color }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: d.color, letterSpacing: '0.02em' }}>
                        {d.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 10, color: '#7E8AA3', lineHeight: 1.4, margin: 0 }}>{d.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── Governor's Office divider ──────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 1, background: '#1e2a40' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={10} style={{ color: '#fbbf24' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#7E8AA3', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Governor&apos;s Office
            </span>
          </div>
          <div style={{ flex: 1, height: 1, background: '#1e2a40' }} />
        </div>

        {/* ── Mode selector bar ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: '#7E8AA3', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
            Execution Mode
          </span>

          {(['demo', 'dry-run', 'live'] as ExecutionMode[]).map(m => {
            const on = mode === m;
            const ac = m === 'live' ? '#f87171' : m === 'dry-run' ? '#38bdf8' : '#EB5815';
            return (
              <button key={m} onClick={() => { if (!isLive) setMode(m); }} style={{
                borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 600,
                border: `1px solid ${on ? ac + '80' : '#27324A'}`,
                background: on ? ac + '18' : '#121826',
                color: on ? ac : '#7E8AA3',
                cursor: isLive ? 'not-allowed' : 'pointer',
                opacity: isLive && !on ? 0.5 : 1,
                transition: 'all 0.2s',
              }}>
                {m === 'demo' ? 'Demo Run' : m === 'dry-run' ? 'Dry Run' : 'Approval-Gated Live'}
              </button>
            );
          })}

          <div style={{ marginLeft: 'auto' }}>
            {mode === 'live' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#f87171', border: '1px solid rgba(248,113,113,0.32)', borderRadius: 8, padding: '5px 10px', background: 'rgba(248,113,113,0.08)' }}>
                <Lock size={10} /> Live — all consequential actions require approval
              </span>
            )}
            {mode === 'dry-run' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#38bdf8', border: '1px solid rgba(56,189,248,0.32)', borderRadius: 8, padding: '5px 10px', background: 'rgba(56,189,248,0.08)' }}>
                <Eye size={10} /> Dry Run — payloads previewed, not executed
              </span>
            )}
            {mode === 'demo' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#EB5815', border: '1px solid rgba(235,88,21,0.32)', borderRadius: 8, padding: '5px 10px', background: 'rgba(235,88,21,0.08)' }}>
                <Radio size={10} /> Demo — local state machine only
              </span>
            )}
          </div>
        </div>

        {/* ── Two-column layout ─────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 16 }}>

          {/* LEFT ─────────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Spatial world */}
            <div style={{
              position: 'relative', borderRadius: 20, border: '1px solid #27324A',
              overflow: 'visible',
              background: 'linear-gradient(160deg, #0d1829 0%, #0a0f1a 55%, #0c1620 100%)',
              minHeight: 340,
            }}>
              {/* Floor grid */}
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 20, opacity: 0.18, pointerEvents: 'none', overflow: 'hidden',
                backgroundImage: 'linear-gradient(rgba(56,189,248,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.22) 1px, transparent 1px)',
                backgroundSize: '44px 44px',
                maskImage: 'radial-gradient(ellipse 90% 80% at 50% 75%, black 20%, transparent 100%)',
                WebkitMaskImage: 'radial-gradient(ellipse 90% 80% at 50% 75%, black 20%, transparent 100%)',
              }} />
              {/* Depth glow */}
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 20, pointerEvents: 'none',
                background: 'radial-gradient(ellipse 70% 50% at 50% 95%, rgba(56,189,248,0.04) 0%, transparent 70%)',
              }} />

              {/* Rooms row */}
              <div style={{
                position: 'relative', zIndex: 10,
                padding: '52px 20px 12px', display: 'flex', gap: 14, alignItems: 'flex-end',
              }}>
                {ROOMS.map(room => {
                  const { Icon } = room;
                  const roomActive = activeRoom === room.id;
                  const awaitingHere = status === 'awaiting-approval' && room.id === 'approval';
                  const lit = roomActive || awaitingHere;
                  return (
                    <div key={room.id} style={{ flex: 1, position: 'relative' }}>
                      {/* Agent avatar */}
                      {roomActive && (
                        <div style={{
                          position: 'absolute', top: -58, left: '50%',
                          transform: 'translateX(-50%)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, zIndex: 20,
                        }}>
                          <div style={{
                            background: 'rgba(8,13,23,0.96)', border: `1px solid ${room.border}`,
                            borderRadius: 8, padding: '4px 9px',
                            fontSize: 10, color: room.color, maxWidth: 150,
                            textAlign: 'center', lineHeight: 1.35,
                          }}>
                            {thought}
                          </div>
                          <div style={{
                            width: 0, height: 0,
                            borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
                            borderTop: `5px solid ${room.border}`,
                          }} />
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', position: 'relative',
                            background: `radial-gradient(circle, ${room.glow.replace('0.14','0.5')}, rgba(10,15,26,0.9))`,
                            border: `2px solid ${room.color}`,
                            boxShadow: `0 0 18px ${room.color}50`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <Cpu size={14} style={{ color: room.color }} />
                            <div style={{
                              position: 'absolute', inset: -7, borderRadius: '50%',
                              border: `1px solid ${room.color}38`,
                              animation: 'ace-glow 2s infinite',
                            }} />
                          </div>
                        </div>
                      )}

                      {/* Room card */}
                      <div style={{
                        borderRadius: 14,
                        border: `1px solid ${lit ? room.border : '#27324A'}`,
                        background: lit ? room.bg : 'rgba(18,24,38,0.55)',
                        boxShadow: lit ? `0 0 28px ${room.glow}, inset 0 1px 0 ${room.border}` : 'none',
                        transform: `translateY(${room.offsetY}px)`,
                        minHeight: room.minH,
                        transition: 'all 0.5s cubic-bezier(0.4,0,0.2,1)',
                        padding: 14,
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                      }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Icon size={13} style={{ color: lit ? room.color : '#4b5a73' }} />
                            <span style={{ fontSize: 11, fontWeight: 700, color: lit ? room.color : '#4b5a73', letterSpacing: '0.02em' }}>
                              {room.label}
                            </span>
                          </div>
                          <p style={{ fontSize: 10, color: '#7E8AA3', lineHeight: 1.4 }}>{room.description}</p>
                        </div>
                        {/* State pill */}
                        <div style={{
                          marginTop: 12, borderRadius: 8, padding: '5px 8px',
                          textAlign: 'center', fontSize: 10, fontWeight: 600,
                          background: awaitingHere ? 'rgba(251,191,36,0.12)' : roomActive ? `${room.color}12` : 'rgba(255,255,255,0.03)',
                          color: awaitingHere ? '#fbbf24' : roomActive ? room.color : '#4b5a73',
                          border: `1px solid ${awaitingHere ? 'rgba(251,191,36,0.25)' : roomActive ? `${room.color}25` : 'rgba(255,255,255,0.04)'}`,
                          animation: lit ? 'ace-glow 2.5s infinite' : 'none',
                        }}>
                          {awaitingHere ? '⏸ Awaiting Approval' : roomActive ? '● Active' : 'idle'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Agent bar */}
              <div style={{
                position: 'relative', zIndex: 10,
                padding: '8px 20px 14px',
                display: 'flex', alignItems: 'center', gap: 7,
                borderTop: '1px solid rgba(39,50,74,0.6)',
              }}>
                <Activity size={11} style={{ color: '#7E8AA3' }} />
                <span style={{ fontSize: 11, color: '#7E8AA3' }}>General Operator</span>
                <ArrowRight size={10} style={{ color: '#27324A' }} />
                <span style={{ fontSize: 11, color: isLive ? '#38bdf8' : '#4b5a73' }}>{thought}</span>
                {isLive && <PulsingDots />}
              </div>
            </div>

            {/* Objective Console */}
            <div style={{ borderRadius: 20, border: '1px solid #27324A', background: '#0d1624', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                <Terminal size={13} style={{ color: '#EB5815' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#B8C2D6', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Objective Console
                </span>
              </div>

              <div style={{ borderRadius: 12, border: '1px solid #27324A', background: '#080d17', overflow: 'hidden' }}>
                <div style={{ padding: '6px 12px', borderBottom: '1px solid #1e2a40', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#7E8AA3', fontFamily: 'monospace' }}>operator@empire:~$</span>
                </div>
                <textarea
                  style={{
                    width: '100%', background: 'transparent', padding: '10px 12px',
                    fontSize: 13, color: '#F3F6FB', fontFamily: 'monospace',
                    resize: 'none', outline: 'none', border: 'none',
                    opacity: isLive ? 0.5 : 1, boxSizing: 'border-box',
                  }}
                  rows={3}
                  placeholder={SAMPLE_OBJECTIVES[0]}
                  value={objective}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setObjective(e.target.value)}
                  disabled={isLive}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button onClick={runObjective} disabled={!canRun} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  borderRadius: 12, padding: '9px 18px', fontSize: 13, fontWeight: 700,
                  background: canRun ? '#EB5815' : '#1a2338',
                  color: canRun ? '#fff' : '#4b5a73',
                  border: 'none', cursor: canRun ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
                }}>
                  <Play size={13} />
                  {status === 'running' ? 'Running…' : 'Run Objective'}
                </button>

                {(['completed', 'rejected', 'blocked', 'previewed'].includes(status)) && (
                  <button onClick={reset} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    borderRadius: 12, padding: '9px 16px', fontSize: 13, fontWeight: 500,
                    background: '#121826', color: '#B8C2D6',
                    border: '1px solid #27324A', cursor: 'pointer',
                  }}>
                    <RotateCcw size={12} /> Reset
                  </button>
                )}

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  {SAMPLE_OBJECTIVES.slice(1).map((s, i) => (
                    <button key={i} onClick={() => setObjective(s)} disabled={isLive} style={{
                      borderRadius: 8, padding: '6px 10px', fontSize: 10, color: '#7E8AA3',
                      border: '1px solid #27324A', background: '#0a0f1a',
                      cursor: isLive ? 'not-allowed' : 'pointer',
                    }}>
                      Sample {i + 2}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status strip */}
              {status !== 'idle' && (() => {
                const c = statusCfg[status as Exclude<RunStatus, 'idle'>];
                const { Icon: SIcon } = c;
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginTop: 10, borderRadius: 10, padding: '8px 12px', fontSize: 12,
                    background: c.bg, border: `1px solid ${c.border}`, color: c.color,
                  }}>
                    <SIcon size={12} />
                    {c.text}
                  </div>
                );
              })()}

              {/* API payload preview */}
              {(mode === 'dry-run' || mode === 'live') && apiResult && (
                <div style={{
                  marginTop: 10, borderRadius: 12, padding: 12,
                  background: '#080d17', border: '1px solid #1e2a40',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Eye size={10} style={{ color: '#38bdf8' }} />
                    <span style={{ fontSize: 10, color: '#38bdf8', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {mode === 'dry-run' ? 'Dry-Run API Response' : 'Live API Response (pre-approval)'}
                    </span>
                  </div>
                  <pre style={{
                    fontSize: 10, fontFamily: 'monospace', color: '#B8C2D6',
                    overflow: 'auto', maxHeight: 110, lineHeight: 1.55, margin: 0,
                  }}>
                    {JSON.stringify(apiResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT ─────────────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Approval panel */}
            <div style={{
              borderRadius: 20, padding: 20,
              background: pending ? 'rgba(30,22,4,0.82)' : '#0d1624',
              border: `1px solid ${pending ? 'rgba(251,191,36,0.45)' : '#27324A'}`,
              boxShadow: pending ? '0 0 32px rgba(251,191,36,0.07)' : 'none',
              transition: 'all 0.4s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 16 }}>
                <Shield size={13} style={{ color: pending ? '#fbbf24' : '#4b5a73' }} />
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: pending ? '#fbbf24' : '#4b5a73' }}>
                  Approval Desk
                </span>
                {pending && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                    borderRadius: 20, padding: '3px 8px',
                    background: 'rgba(251,191,36,0.18)', color: '#fbbf24',
                    border: '1px solid rgba(251,191,36,0.35)',
                    animation: 'ace-glow 1.6s infinite',
                  }}>
                    ACTION PENDING
                  </span>
                )}
              </div>

              {!pending ? (
                <div style={{ textAlign: 'center', padding: '28px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <Shield size={26} style={{ color: '#27324A' }} />
                  <p style={{ fontSize: 11, color: '#7E8AA3', lineHeight: 1.5, margin: 0 }}>
                    No pending actions.<br />Consequential actions appear here.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Type badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                      borderRadius: 4, padding: '3px 7px',
                      background: mode === 'live' ? 'rgba(239,68,68,0.14)' : 'rgba(251,191,36,0.12)',
                      color: mode === 'live' ? '#f87171' : '#fbbf24',
                      border: `1px solid ${mode === 'live' ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.28)'}`,
                    }}>
                      {pending.type}
                    </span>
                    {mode === 'live' && (
                      <span style={{ fontSize: 10, color: '#f87171', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Lock size={9} /> Real execution pending
                      </span>
                    )}
                  </div>

                  {/* Summary */}
                  <div style={{ borderRadius: 10, padding: '8px 10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(251,191,36,0.14)' }}>
                    <p style={{ fontSize: 11, color: '#B8C2D6', lineHeight: 1.45, margin: 0 }}>{pending.summary}</p>
                  </div>

                  {/* Payload */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 9, color: '#7E8AA3', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Payload</span>
                      {!isEditing ? (
                        <button onClick={() => { setEditPayload(JSON.stringify(pending.payload, null, 2)); setIsEditing(true); }} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#7E8AA3', background: 'none', border: 'none', cursor: 'pointer' }}>
                          <Edit3 size={9} /> Edit
                        </button>
                      ) : (
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={handleEditSave} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#34d399', background: 'none', border: 'none', cursor: 'pointer' }}>
                            <Check size={9} /> Save
                          </button>
                          <button onClick={() => setIsEditing(false)} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>
                            <X size={9} /> Cancel
                          </button>
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <textarea
                        value={editPayload}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditPayload(e.target.value)}
                        rows={7}
                        style={{
                          width: '100%', borderRadius: 10, padding: 8,
                          fontSize: 10, fontFamily: 'monospace', color: '#B8C2D6',
                          background: '#080d17', border: '1px solid rgba(251,191,36,0.28)',
                          outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <pre style={{
                        borderRadius: 10, padding: 8, margin: 0,
                        fontSize: 10, fontFamily: 'monospace', color: '#B8C2D6',
                        background: '#080d17', border: '1px solid rgba(255,255,255,0.05)',
                        overflow: 'auto', maxHeight: 110,
                      }}>
                        {JSON.stringify(pending.payload, null, 2)}
                      </pre>
                    )}
                  </div>

                  {/* Approve / Reject */}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
                    <button onClick={handleApprove} style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 700,
                      background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.38)', color: '#34d399',
                      cursor: 'pointer',
                    }}>
                      <CheckCircle size={13} /> Review preview
                    </button>
                    <button onClick={handleReject} style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 700,
                      background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.32)', color: '#f87171',
                      cursor: 'pointer',
                    }}>
                      <XCircle size={13} /> Dismiss preview
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Timeline */}
            <div style={{ borderRadius: 20, border: '1px solid #27324A', background: '#0d1624', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
                <Clock size={12} style={{ color: '#7E8AA3' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#B8C2D6', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Run Timeline
                </span>
                {timeline.length > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#7E8AA3' }}>{timeline.length} events</span>
                )}
              </div>

              <div ref={tlRef} style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                {timeline.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <p style={{ fontSize: 11, color: '#7E8AA3', margin: 0 }}>No events yet. Run an objective to start.</p>
                  </div>
                ) : (
                  timeline.map((evt: TimelineEvent, i: number) => {
                    const room = evt.room ? ROOMS.find(r => r.id === evt.room) : undefined;
                    const cur = i === 0;
                    return (
                      <div key={evt.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                        borderRadius: 10, padding: '8px 10px',
                        background: cur ? 'rgba(56,189,248,0.05)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${cur ? 'rgba(56,189,248,0.16)' : 'rgba(255,255,255,0.04)'}`,
                        transition: 'all 0.3s',
                      }}>
                        <StatusDot status={evt.status} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, color: '#B8C2D6', fontWeight: cur ? 600 : 400, lineHeight: 1.3 }}>
                              {evt.label}
                            </span>
                            {room && (
                              <span style={{
                                fontSize: 9, borderRadius: 4, padding: '1px 5px',
                                background: `${room.color}14`, color: room.color, fontWeight: 600,
                              }}>
                                {room.label}
                              </span>
                            )}
                          </div>
                          {evt.detail && (
                            <p style={{ fontSize: 10, color: '#7E8AA3', marginTop: 2, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {evt.detail}
                            </p>
                          )}
                          <span style={{ fontSize: 9, color: '#4b5a73', fontFamily: 'monospace' }}>{evt.ts}</span>
                        </div>
                        {cur && <ChevronRight size={11} style={{ color: '#7E8AA3', flexShrink: 0, marginTop: 2 }} />}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
