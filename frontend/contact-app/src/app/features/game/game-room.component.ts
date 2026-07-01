import { NgClass } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { GameState, isValidSecretWord, SECRET_WORD_MAX, SECRET_WORD_MIN } from '../../core/models/ws-types';
import { GameEngineService } from '../../core/services/game-engine.service';
import { RoomService } from '../../core/services/room.service';
import { LanguageToggleComponent } from '../../shared/language-toggle.component';
import { LoadingButtonComponent } from '../../shared/loading-button.component';
import { SpinnerComponent } from '../../shared/spinner.component';

@Component({
  selector: 'app-game-room',
  standalone: true,
  imports: [NgClass, FormsModule, TranslateModule, RouterLink, LanguageToggleComponent, LoadingButtonComponent, SpinnerComponent],
  templateUrl: './game-room.component.html',
})
export class GameRoomComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gameEngine = inject(GameEngineService);
  private readonly roomService = inject(RoomService);

  roomCode = '';
  state: GameState | null = null;
  overlay: string | null = null;
  clueInputOpen = false;
  clueSeconds: number | null = null;
  contactCount: number | null = null;
  secretWordInput = '';
  clueText = '';
  blockWord = '';
  contactGuessInput = '';
  guessSubmitted = false;
  guessWordError = false;
  blockSubmitted = false;
  settingWord = false;
  submittingClue = false;
  contactingClueId: string | null = null;
  submittingGuess = false;
  submittingBlock = false;

  loadError = false;
  scoresOpen = false;
  private sessionReady = false;

  private prevPhase: string | null = null;
  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.gameEngine.init();
    this.roomCode = this.route.snapshot.paramMap.get('roomCode') ?? '';
    void this.initSession();

    this.subs.push(
      this.gameEngine.state$.subscribe((s) => {
        this.state = s;
        if (s) this.loadError = false;
        if (s?.phase === 'CONTACT_COUNTDOWN' && this.prevPhase !== 'CONTACT_COUNTDOWN') {
          this.guessSubmitted = false;
          this.blockSubmitted = false;
          this.contactGuessInput = '';
          this.blockWord = '';
          this.guessWordError = false;
          this.submittingGuess = false;
          this.submittingBlock = false;
        }
        if (this.settingWord && s?.phase !== 'WORD_SETUP') {
          this.settingWord = false;
        }
        if (this.contactingClueId && s?.phase === 'CONTACT_COUNTDOWN') {
          this.contactingClueId = null;
        }
        if (s?.phase === 'ROUND_COMPLETE' && this.prevPhase !== 'ROUND_COMPLETE') {
          this.router.navigate(['/game', this.roomCode, 'scoreboard']);
        }
        this.prevPhase = s?.phase ?? null;
      }),
      this.gameEngine.overlay$.subscribe((o) => (this.overlay = o)),
      this.gameEngine.clueInputOpen$.subscribe((o) => {
        this.clueInputOpen = o;
        if (!o) this.submittingClue = false;
      }),
      this.gameEngine.clueSeconds$.subscribe((s) => {
        this.clueSeconds = s;
        if (s === 0) this.clueInputOpen = false;
      }),
      this.gameEngine.contactCount$.subscribe((c) => (this.contactCount = c)),
      this.gameEngine.stateRecoveryFailed$.subscribe((failed) => {
        if (failed) this.loadError = true;
      }),
    );
  }

  private async initSession(): Promise<void> {
    const restored = await this.roomService.tryRestoreSession(this.roomCode);
    if (!restored) {
      void this.router.navigate(['/'], { queryParams: { room: this.roomCode } });
      return;
    }
    this.sessionReady = true;
    this.ensureGameStateLoaded();
  }

  private ensureGameStateLoaded(): void {
    if (!this.sessionReady || this.state) return;
    if (this.roomService.room?.isHost) {
      this.gameEngine.requestHostStateRecovery();
    } else {
      this.gameEngine.requestGameState();
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  get isClueGiver(): boolean {
    return this.gameEngine.isClueGiver();
  }

  get isGuesser(): boolean {
    return this.gameEngine.isGuesser();
  }

  get isContactParticipant(): boolean {
    return this.gameEngine.isContactParticipant();
  }

  get myId(): string | null {
    return this.gameEngine.myId;
  }

  get displayPrefix(): string {
    return this.gameEngine.getDisplayPrefix();
  }

  readonly secretWordMin = SECRET_WORD_MIN;
  readonly secretWordMax = SECRET_WORD_MAX;

  get secretWordValid(): boolean {
    return isValidSecretWord(this.secretWordInput.trim());
  }

  get showSecretWordError(): boolean {
    return this.secretWordInput.trim().length > 0 && !this.secretWordValid;
  }

  setWord(): void {
    if (!this.secretWordValid || this.settingWord) return;
    this.settingWord = true;
    this.gameEngine.setSecretWord(this.secretWordInput);
    this.secretWordInput = '';
    this.clearLoadingAfter(() => (this.settingWord = false));
  }

  openClue(): void {
    this.gameEngine.openClueInput();
  }

  submitClue(): void {
    if (!this.clueText.trim() || this.submittingClue) return;
    this.submittingClue = true;
    this.gameEngine.submitClue(this.clueText);
    this.clueText = '';
    this.clearLoadingAfter(() => (this.submittingClue = false));
  }

  contact(clueId: string): void {
    if (this.contactingClueId) return;
    this.contactingClueId = clueId;
    this.gameEngine.initiateContact(clueId);
    this.clearLoadingAfter(() => (this.contactingClueId = null));
  }

  submitContactGuess(): void {
    if (!this.contactGuessInput.trim() || this.submittingGuess) return;
    if (this.gameEngine.isUsedMatchWord(this.contactGuessInput)) {
      this.guessWordError = true;
      return;
    }
    this.submittingGuess = true;
    const accepted = this.gameEngine.submitContactGuess(this.contactGuessInput);
    if (!accepted) {
      this.guessWordError = true;
      this.submittingGuess = false;
      return;
    }
    this.guessSubmitted = true;
    this.guessWordError = false;
    this.contactGuessInput = '';
    this.clearLoadingAfter(() => (this.submittingGuess = false));
  }

  submitBlock(): void {
    if (!this.blockWord.trim() || this.submittingBlock) return;
    this.submittingBlock = true;
    this.gameEngine.submitBlockGuess(this.blockWord);
    this.blockSubmitted = true;
    this.blockWord = '';
    this.clearLoadingAfter(() => (this.submittingBlock = false));
  }

  isContacting(clueId: string): boolean {
    return this.contactingClueId === clueId;
  }

  private clearLoadingAfter(clear: () => void, ms = 5000): void {
    setTimeout(clear, ms);
  }

  overlayMessage(): string {
    switch (this.overlay) {
      case 'BLOCKED':
        return 'BLOCKED';
      case 'WORD_GUESSED':
        return 'WORD_GUESSED';
      case 'SUCCESS':
        return 'SUCCESS_REVEAL';
      default:
        return '';
    }
  }

  get usedMatchWords(): string[] {
    return this.gameEngine.getUsedMatchWords();
  }

  get contactWordAlreadyUsed(): boolean {
    return (
      this.contactGuessInput.trim().length > 0 &&
      this.gameEngine.isUsedMatchWord(this.contactGuessInput)
    );
  }

  getScore(playerId: string): number {
    return this.state?.scores?.[playerId] ?? 0;
  }

  get myScore(): number {
    return this.myId ? this.getScore(this.myId) : 0;
  }

  get rankedPlayers() {
    if (!this.state?.players) return [];
    return [...this.state.players].sort((a, b) => {
      const diff = this.getScore(b.connectionId) - this.getScore(a.connectionId);
      return diff !== 0 ? diff : a.joinOrder - b.joinOrder;
    });
  }

  toggleScores(): void {
    this.scoresOpen = !this.scoresOpen;
  }

  closeScores(): void {
    this.scoresOpen = false;
  }
}
