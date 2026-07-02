import { Component, Input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { GameEngineService } from '../core/services/game-engine.service';
import { LoadingButtonComponent } from './loading-button.component';

@Component({
  selector: 'app-leave-game-button',
  standalone: true,
  imports: [TranslateModule, LoadingButtonComponent],
  template: `
    @if (showLabel) {
      <app-loading-button variant="secondary" [extraClass]="labelClass" (pressed)="leave()">
        {{ 'START_FRESH' | translate }}
      </app-loading-button>
    } @else {
      <button
        type="button"
        class="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 transition hover:bg-white/15 active:scale-95"
        [attr.aria-label]="'START_FRESH' | translate"
        [title]="'START_FRESH' | translate"
        (click)="leave()"
      >
        <svg class="h-5 w-5 text-yellow-bright" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </button>
    }
  `,
})
export class LeaveGameButtonComponent {
  @Input() showLabel = false;
  @Input() labelClass = 'w-full';

  private readonly gameEngine = inject(GameEngineService);
  private readonly router = inject(Router);

  leave(): void {
    this.gameEngine.leaveGame();
    void this.router.navigate(['/']);
  }
}
