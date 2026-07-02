import { Component } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

const LANGS = ['en', 'pt-BR', 'es'] as const;
const LANG_LABELS: Record<(typeof LANGS)[number], string> = {
  en: 'EN',
  'pt-BR': 'PT',
  es: 'ES',
};

@Component({
  selector: 'app-language-toggle',
  standalone: true,
  imports: [TranslateModule],
  template: `
    <button
      type="button"
      class="rounded-full bg-yellow-bright px-3 py-1 text-sm font-semibold text-purple-900 transition active:scale-95"
      [attr.aria-label]="'LANGUAGE' | translate"
      [title]="'LANGUAGE' | translate"
      (click)="cycleLang()"
    >
      {{ currentLabel }}
    </button>
  `,
})
export class LanguageToggleComponent {
  currentLang: (typeof LANGS)[number] = 'en';

  constructor(private translate: TranslateService) {
    const saved = localStorage.getItem('contact-lang') ?? 'en';
    const lang = LANGS.includes(saved as (typeof LANGS)[number])
      ? (saved as (typeof LANGS)[number])
      : 'en';
    this.setLang(lang);
  }

  get currentLabel(): string {
    return LANG_LABELS[this.currentLang];
  }

  cycleLang(): void {
    const idx = LANGS.indexOf(this.currentLang);
    this.setLang(LANGS[(idx + 1) % LANGS.length]);
  }

  private setLang(lang: (typeof LANGS)[number]): void {
    this.currentLang = lang;
    this.translate.use(lang);
    localStorage.setItem('contact-lang', lang);
  }
}
