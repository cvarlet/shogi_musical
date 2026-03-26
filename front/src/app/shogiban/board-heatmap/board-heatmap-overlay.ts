import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { getHeatmapColor } from '../defenders/defender-heatmap';

@Component({
  selector: 'app-board-heatmap-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './board-heatmap-overlay.html',
  styleUrl: './board-heatmap-overlay.css',
})
export class BoardHeatmapOverlayComponent {
  @Input() visible = false;
  @Input() squareNames: readonly string[] = [];
  @Input() allyVisible = false;
  @Input() enemyVisible = false;
  @Input() allyCounts: ReadonlyMap<string, number> = new Map<string, number>();
  @Input() enemyCounts: ReadonlyMap<string, number> = new Map<string, number>();

  trackBySquare(_index: number, squareName: string): string {
    return squareName;
  }

  getSquareBackground(squareName: string): string {
    const allyCount = this.allyVisible ? (this.allyCounts.get(squareName) ?? 0) : 0;
    const enemyCount = this.enemyVisible ? (this.enemyCounts.get(squareName) ?? 0) : 0;

    const allyColor = getHeatmapColor(allyCount, 'ally');
    const enemyColor = getHeatmapColor(enemyCount, 'enemy');

    if (allyCount > 0 && enemyCount > 0) {
      return `linear-gradient(to bottom, ${enemyColor} 0%, ${enemyColor} 50%, ${allyColor} 50%, ${allyColor} 100%)`;
    }

    if (enemyCount > 0) {
      return enemyColor;
    }

    if (allyCount > 0) {
      return allyColor;
    }

    return 'transparent';
  }
}
