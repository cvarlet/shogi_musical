import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type MoveHistoryEntry = {
  ply: number;
  side: 'sente' | 'gote';
  kind: 'move' | 'drop';
  label: string;
  sfenAfter: string;

  from?: string;
  to: string;
  role?: string;
  promotion?: boolean;
};

type MoveHistoryRow = {
  moveNumber: number;
  sente?: MoveHistoryEntry;
  gote?: MoveHistoryEntry;
};

@Component({
  selector: 'app-move-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './move-history.html',
  styleUrl: './move-history.css',
})
export class MoveHistoryComponent {
  @Input() history: MoveHistoryEntry[] = [];
  @Input() currentPly = 0;

  @Output() selectPly = new EventEmitter<number>();

  get rows(): MoveHistoryRow[] {
    const rows: MoveHistoryRow[] = [];

    for (const entry of this.history) {
      const rowIndex = Math.floor((entry.ply - 1) / 2);

      if (!rows[rowIndex]) {
        rows[rowIndex] = {
          moveNumber: rowIndex + 1,
        };
      }

      if (entry.side === 'sente') {
        rows[rowIndex].sente = entry;
      } else {
        rows[rowIndex].gote = entry;
      }
    }

    return rows;
  }

  onSelectPly(ply: number): void {
    this.selectPly.emit(ply);
  }

  trackByMoveNumber(_: number, row: MoveHistoryRow): number {
    return row.moveNumber;
  }
}
