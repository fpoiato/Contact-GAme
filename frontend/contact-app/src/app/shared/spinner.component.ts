import { NgClass } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-spinner',
  standalone: true,
  imports: [NgClass],
  template: `
    <span
      class="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      [ngClass]="sizeClass"
      role="status"
      aria-hidden="true"
    ></span>
  `,
})
export class SpinnerComponent {
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  get sizeClass(): string {
    switch (this.size) {
      case 'sm':
        return 'h-4 w-4';
      case 'lg':
        return 'h-7 w-7';
      default:
        return 'h-5 w-5';
    }
  }
}
