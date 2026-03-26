import { Component, EventEmitter, Input, Output } from '@angular/core';

export type BoardArrow = {
  id: string;
  orig: string;
  dest: string;
  color?: string;
  strokeWidth?: number;
  opacity?: number;
};

type Point = {
  x: number;
  y: number;
};

type PreparedArrow = {
  id: string;
  orig: string;
  dest: string;
  origPoint: Point;
  destPoint: Point;
  color: string;
  strokeWidth: number;
  opacity: number;
  groupKey: string;
};

type ArrowView = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  visualStrokeWidth: number;
  hitStrokeWidth: number;
  opacity: number;
  isHovered: boolean;
};

const BOARD_FILES = ['9', '8', '7', '6', '5', '4', '3', '2', '1'] as const;
const BOARD_RANKS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] as const;

@Component({
  selector: 'app-board-arrows-overlay',
  standalone: true,
  templateUrl: './board-arrows-overlay.html',
  styleUrl: './board-arrows-overlay.css',
})
export class BoardArrowsOverlayComponent {
  @Input() visible = false;
  @Input() arrows: BoardArrow[] = [];
  @Input() hoveredArrowId: string | null = null;

  @Output() arrowHover = new EventEmitter<string | null>();
  @Output() arrowClick = new EventEmitter<string>();

  private readonly laneGap = 0.16;
  private readonly defaultStartInset = 0.08;
  private readonly defaultEndInset = 0.24;

  get viewArrows(): ArrowView[] {
    const prepared = this.arrows
      .map((arrow) => this.prepareArrow(arrow))
      .filter((arrow): arrow is PreparedArrow => arrow !== null);

    const groups = new Map<string, PreparedArrow[]>();

    for (const arrow of prepared) {
      const existing = groups.get(arrow.groupKey) ?? [];
      existing.push(arrow);
      groups.set(arrow.groupKey, existing);
    }

    const result: ArrowView[] = [];

    for (const group of groups.values()) {
      const groupNormal = this.getGroupNormal(group[0]);

      group.forEach((arrow, index) => {
        const offset = this.getCenteredOffset(index, group.length, this.laneGap);
        result.push(this.toViewArrow(arrow, groupNormal, offset));
      });
    }

    return result;
  }

  onArrowMouseEnter(arrowId: string): void {
    this.arrowHover.emit(arrowId);
  }

  onArrowMouseLeave(): void {
    this.arrowHover.emit(null);
  }

  onArrowClickInternal(event: MouseEvent, arrowId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.arrowClick.emit(arrowId);
  }

  private prepareArrow(arrow: BoardArrow): PreparedArrow | null {
    const origPoint = this.squareToCenter(arrow.orig);
    const destPoint = this.squareToCenter(arrow.dest);

    if (!origPoint || !destPoint) return null;

    const dx = destPoint.x - origPoint.x;
    const dy = destPoint.y - origPoint.y;
    const len = Math.hypot(dx, dy);

    if (len === 0) return null;

    return {
      id: arrow.id,
      orig: arrow.orig,
      dest: arrow.dest,
      origPoint,
      destPoint,
      color: arrow.color ?? '#ec4899',
      strokeWidth: arrow.strokeWidth ?? 0.06,
      opacity: arrow.opacity ?? 0.95,
      groupKey: this.getUndirectedGroupKey(arrow.orig, arrow.dest),
    };
  }

  private toViewArrow(arrow: PreparedArrow, groupNormal: Point, offset: number): ArrowView {
    const dx = arrow.destPoint.x - arrow.origPoint.x;
    const dy = arrow.destPoint.y - arrow.origPoint.y;
    const len = Math.hypot(dx, dy) || 1;

    const ux = dx / len;
    const uy = dy / len;

    const isHovered = this.hoveredArrowId === arrow.id;
    const visualStrokeWidth = isHovered ? arrow.strokeWidth * 1.8 : arrow.strokeWidth;
    const hitStrokeWidth = Math.max(visualStrokeWidth * 4, 0.28);

    return {
      id: arrow.id,
      x1: arrow.origPoint.x + groupNormal.x * offset + ux * this.defaultStartInset,
      y1: arrow.origPoint.y + groupNormal.y * offset + uy * this.defaultStartInset,
      x2: arrow.destPoint.x + groupNormal.x * offset - ux * this.defaultEndInset,
      y2: arrow.destPoint.y + groupNormal.y * offset - uy * this.defaultEndInset,
      color: arrow.color,
      visualStrokeWidth,
      hitStrokeWidth,
      opacity: arrow.opacity,
      isHovered,
    };
  }

  private getCenteredOffset(index: number, count: number, gap: number): number {
    return (index - (count - 1) / 2) * gap;
  }

  private getUndirectedGroupKey(orig: string, dest: string): string {
    return [orig, dest].sort().join('|');
  }

  private getGroupNormal(arrow: PreparedArrow): Point {
    const { from, to } = this.getCanonicalSegment(arrow.origPoint, arrow.destPoint);

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;

    return {
      x: -dy / len,
      y: dx / len,
    };
  }

  private getCanonicalSegment(a: Point, b: Point): { from: Point; to: Point } {
    if (a.x < b.x) return { from: a, to: b };
    if (a.x > b.x) return { from: b, to: a };
    if (a.y <= b.y) return { from: a, to: b };
    return { from: b, to: a };
  }

  private squareToCenter(square: string): Point | null {
    if (square.length !== 2) return null;

    const file = square[0];
    const rank = square[1];

    const fileIndex = BOARD_FILES.indexOf(file as (typeof BOARD_FILES)[number]);
    const rankIndex = BOARD_RANKS.indexOf(rank as (typeof BOARD_RANKS)[number]);

    if (fileIndex === -1 || rankIndex === -1) return null;

    return {
      x: fileIndex + 0.5,
      y: rankIndex + 0.5,
    };
  }
}
