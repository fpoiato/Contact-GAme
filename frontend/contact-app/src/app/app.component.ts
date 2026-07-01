import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { APP_VERSION } from './core/constants/version';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="flex min-h-full flex-col">
      <main class="flex-1">
        <router-outlet />
      </main>
      <footer class="shrink-0 px-4 pb-2 text-right text-[10px] tracking-wide text-white/25 select-none">
        v{{ version }}
      </footer>
    </div>
  `,
})
export class AppComponent {
  readonly version = APP_VERSION;
}
