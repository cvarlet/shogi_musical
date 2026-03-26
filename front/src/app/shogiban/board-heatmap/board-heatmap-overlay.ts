import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { getHeatmapColor, HeatmapTone } from '../defenders/defender-heatmap';

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
  @Input() counts: ReadonlyMap<string, number> = new Map<string, number>();
  @Input() tone: HeatmapTone = 'ally';

  trackBySquare(_index: number, squareName: string): string {
    return squareName;
  }

  getSquareColor(squareName: string): string {
    return getHeatmapColor(this.counts.get(squareName) ?? 0, this.tone);
  }
}
