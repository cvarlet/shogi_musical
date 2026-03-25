import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

export type MoveNode = {
  id: string;
  parentId: string | null;
  childrenIds: string[];

  side: 'sente' | 'gote' | null;
  kind: 'root' | 'move' | 'drop';
  label: string;
  sfenAfter: string;

  from?: string;
  to?: string;
  role?: string;
  promotion?: boolean;
};

export type HistoryMoveView = {
  nodeId: string;
  label: string;
  ply: number;
  side: 'sente' | 'gote';
  variations: HistoryBranchView[];
};

export type HistoryBranchView = {
  startNodeId: string;
  moves: HistoryMoveView[];
};

export type HistoryTreeView = {
  mainline: HistoryBranchView | null;
  rootVariations: HistoryBranchView[];
};

@Component({
  selector: 'app-move-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './move-history.html',
  styleUrl: './move-history.css',
})
export class MoveHistoryComponent {
  @Input() tree: HistoryTreeView | null = null;
  @Input() selectedNodeId = 'root';

  @Output() selectNode = new EventEmitter<string>();

  onSelectNode(nodeId: string): void {
    this.selectNode.emit(nodeId);
  }

  isSelected(nodeId: string): boolean {
    return nodeId === this.selectedNodeId;
  }

  shouldShowMoveNumber(indexInBranch: number, side: 'sente' | 'gote'): boolean {
    return side === 'sente' || indexInBranch === 0;
  }

  formatMoveNumber(ply: number, side: 'sente' | 'gote'): string {
    const moveNumber = Math.ceil(ply / 2);
    return side === 'sente' ? `${moveNumber}.` : `${moveNumber}...`;
  }
}
