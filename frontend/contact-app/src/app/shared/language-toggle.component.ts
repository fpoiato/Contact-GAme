import { NgClass } from '@angular/common';
import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-language-toggle',
  standalone: true,
  imports: [NgClass],
  template: `
    <div class="flex gap-2">
      <button
        type="button"
        class="rounded-full px-3 py-1 text-sm font-semibold transition"
        [ngClass]="currentLang === 'en' ? 'bg-yellow-bright text-purple-900' : 'bg-white/20'"
        (click)="setLang('en')"
      >
        EN
      </button>
      <button
        type="button"
        class="rounded-full px-3 py-1 text-sm font-semibold transition"
        [ngClass]="currentLang === 'pt-BR' ? 'bg-yellow-bright text-purple-900' : 'bg-white/20'"
        (click)="setLang('pt-BR')"
      >
        PT
      </button>
    </div>
  `,
})
export class LanguageToggleComponent {
  currentLang = 'en';

  constructor(private translate: TranslateService) {
    const saved = localStorage.getItem('contact-lang') ?? 'en';
    this.setLang(saved);
  }

  setLang(lang: string): void {
    this.currentLang = lang;
    this.translate.use(lang);
    localStorage.setItem('contact-lang', lang);
  }
}
