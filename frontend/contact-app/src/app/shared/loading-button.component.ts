import { NgClass } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { SpinnerComponent } from './spinner.component';

@Component({
  selector: 'app-loading-button',
  standalone: true,
  imports: [NgClass, SpinnerComponent, TranslateModule],
  host: { class: 'block' },
  template: `
    <button
      type="button"
      [ngClass]="classes"
      [disabled]="disabled || loading"
      (click)="onClick($event)"
    >
      <span class="inline-flex items-center justify-center gap-2">
        @if (loading) {
          <app-spinner [size]="spinnerSize" />
          @if (showLoadingLabel) {
            <span>{{ 'LOADING' | translate }}</span>
          }
        } @else {
          <ng-content />
        }
      </span>
    </button>
  `,
})
export class LoadingButtonComponent {
  @Input() loading = false;
  @Input() disabled = false;
  @Input() variant: 'primary' | 'secondary' | 'danger' = 'primary';
  @Input() extraClass = '';
  @Input() spinnerSize: 'sm' | 'md' | 'lg' = 'md';
  @Input() showLoadingLabel = false;

  @Output() pressed = new EventEmitter<Event>();

  get classes(): string {
    const variantClass =
      this.variant === 'secondary' ? 'btn-secondary' : this.variant === 'danger' ? 'btn-danger' : 'btn-primary';
    return [variantClass, this.extraClass].filter(Boolean).join(' ');
  }

  onClick(event: Event): void {
    if (!this.loading && !this.disabled) {
      this.pressed.emit(event);
    }
  }
}
