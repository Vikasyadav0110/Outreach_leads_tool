"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import ScoreBadge from "./ScoreBadge";
import { LEAD_STATUSES, statusMeta } from "./status";
import { fmtDate } from "./format";

// Kanban board for a campaign's leads — drag a card across engagement stages.
// Persistence is the existing engagement mutation (onMark); the parent owns the
// optimistic member state, so a drag just re-buckets a card by changing its
// engagement. Columns are the LEAD_STATUSES stages.

const STALL_DAYS = 5;
const DAY_MS = 86400000;

function isStalled(lastTouchAt, engagement) {
  // Only meaningful once a lead has been worked and isn't terminal.
  if (!lastTouchAt || !engagement || engagement === "new") return false;
  if (engagement === "won" || engagement === "lost") return false;
  const d = new Date(lastTouchAt);
  if (isNaN(d)) return false;
  return Date.now() - d.getTime() > STALL_DAYS * DAY_MS;
}

function Card({ member, onOpenLead, saving, overlay = false }) {
  const stalled = isStalled(member.lastTouchAt, member.engagement);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: String(member.id),
    data: { engagement: member.engagement || "new" },
    disabled: overlay || saving,
  });

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      className={`group rounded-lg border border-line bg-white p-2.5 shadow-sm ${
        overlay ? "rotate-2 shadow-pop" : "cursor-grab active:cursor-grabbing"
      } ${isDragging ? "opacity-40" : ""} ${saving ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenLead?.(member); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 text-left text-sm font-medium text-ink hover:text-accent hover:underline"
        >
          <span className="line-clamp-2 break-words">{member.name}</span>
        </button>
        <ScoreBadge score={member.score} />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
        {member.city && <span className="truncate">{member.city}</span>}
        {stalled && (
          <span className="ml-auto shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 font-medium text-warning" title={`No touch since ${fmtDate(member.lastTouchAt)}`}>
            ⚠ stalled
          </span>
        )}
      </div>
    </div>
  );
}

function Column({ stage, members, onOpenLead, savingLeadId }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <div className="flex w-60 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className={`h-2 w-2 rounded-full ${stage.dot}`} aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-wide text-ink">{stage.label}</span>
        <span className="ml-auto rounded-full bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-muted tabular-nums">
          {members.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-1 flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors ${
          isOver ? "border-accent bg-accent/5" : "border-line bg-[#fafaf8]"
        }`}
      >
        {members.length === 0 ? (
          <p className="px-1 py-2 text-center text-[11px] text-muted/70">Drop here</p>
        ) : (
          members.map((m) => (
            <Card key={m.id} member={m} onOpenLead={onOpenLead} saving={savingLeadId === m.id} />
          ))
        )}
      </div>
    </div>
  );
}

export default function PipelineBoard({ members = [], savingLeadId, onMark, onOpenLead }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Bucket members by engagement (default 'new').
  const byStage = {};
  for (const s of LEAD_STATUSES) byStage[s.key] = [];
  for (const m of members) {
    const k = m.engagement && byStage[m.engagement] ? m.engagement : "new";
    byStage[k].push(m);
  }

  const activeMember = activeId ? members.find((m) => String(m.id) === activeId) : null;

  function onDragEnd(e) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const target = over.id; // column key
    const current = active.data.current?.engagement || "new";
    if (target === current) return;
    onMark?.(Number(active.id), target);
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
    >
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3">
          {LEAD_STATUSES.map((stage) => (
            <Column
              key={stage.key}
              stage={stage}
              members={byStage[stage.key]}
              onOpenLead={onOpenLead}
              savingLeadId={savingLeadId}
            />
          ))}
        </div>
      </div>
      <DragOverlay>
        {activeMember ? <Card member={activeMember} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
