import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-board-heatmap-overlay',
  standalone: true,
  templateUrl: './board-heatmap-overlay.html',
  styleUrl: './board-heatmap-overlay.css',
})
export class BoardHeatmapOverlayComponent {
  @Input() visible = false;
  @Input() squareNames: string[] = [];

  @Input() allyVisible = false;
  @Input() enemyVisible = false;

  @Input() allyCounts = new Map<string, number>();
  @Input() enemyCounts = new Map<string, number>();

  getCellBackground(square: string): string {
    const allyCount = this.allyVisible ? (this.allyCounts.get(square) ?? 0) : 0;
    const enemyCount = this.enemyVisible ? (this.enemyCounts.get(square) ?? 0) : 0;

    const allyAlpha = this.toAlpha(allyCount);
    const enemyAlpha = this.toAlpha(enemyCount);

    const hasAlly = allyAlpha > 0;
    const hasEnemy = enemyAlpha > 0;

    if (hasAlly && hasEnemy) {
      return `linear-gradient(
        to bottom,
        rgba(220, 38, 38, ${enemyAlpha}) 0%,
        rgba(220, 38, 38, ${enemyAlpha}) 50%,
        rgba(22, 163, 74, ${allyAlpha}) 50%,
        rgba(22, 163, 74, ${allyAlpha}) 100%
      )`;
    }

    if (hasEnemy) {
      return `rgba(220, 38, 38, ${enemyAlpha})`;
    }

    if (hasAlly) {
      return `rgba(22, 163, 74, ${allyAlpha})`;
    }

    return 'transparent';
  }

  private toAlpha(count: number): number {
    if (count <= 0) return 0;
    return Math.min(count, 5) * 0.2;
  }
}
