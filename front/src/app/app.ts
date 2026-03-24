import { Component, signal } from '@angular/core';
import { Shogiban } from './shogiban/shogiban';

@Component({
  selector: 'app-root',
  imports: [Shogiban],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = 'ShogiBase';
}
