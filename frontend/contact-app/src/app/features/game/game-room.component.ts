import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { GameState, isValidSecretWord, SECRET_WORD_MAX, SECRET_WORD_MIN } from '../../core/models/ws-types';
import { GameEngineService } from '../../core/services/game-engine.service';
import { RoomService } from '../../core/services/room.service';
import { LanguageToggleComponent } from '../../shared/language-toggle.component';

@Component({
  selector: 'app-game-room',
  standalone: true,
  imports: [FormsModule, TranslateModule, LanguageToggleComponent],
  templateUrl: './game-room.component.html',
})
export class GameRoomComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
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
  blockSubmitted = false;

  private prevPhase: string | null = null;
  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.gameEngine.init();
    this.roomCode = this.route.snapshot.paramMap.get('roomCode') ?? '';

    this.subs.push(
      this.gameEngine.state$.subscribe((s) => {
        this.state = s;
        if (s?.phase === 'CONTACT_COUNTDOWN' && this.prevPhase !== 'CONTACT_COUNTDOWN') {
          this.guessSubmitted = false;
          this.blockSubmitted = false;
          this.contactGuessInput = '';
          this.blockWord = '';
        }
        this.prevPhase = s?.phase ?? null;
      }),
      this.gameEngine.overlay$.subscribe((o) => (this.overlay = o)),
      this.gameEngine.clueInputOpen$.subscribe((o) => (this.clueInputOpen = o)),
      this.gameEngine.clueSeconds$.subscribe((s) => {
        this.clueSeconds = s;
        if (s === 0) this.clueInputOpen = false;
      }),
      this.gameEngine.contactCount$.subscribe((c) => (this.contactCount = c)),
      this.roomService.room$.subscribe((r) => {
        if (r?.isHost && !this.state) {
          this.gameEngine.requestHostStateRecovery();
        }
      })
    );
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
    if (!this.secretWordValid) return;
    this.gameEngine.setSecretWord(this.secretWordInput);
    this.secretWordInput = '';
  }

  openClue(): void {
    this.gameEngine.openClueInput();
  }

  submitClue(): void {
    this.gameEngine.submitClue(this.clueText);
    this.clueText = '';
  }

  contact(clueId: string): void {
    this.gameEngine.initiateContact(clueId);
  }

  submitContactGuess(): void {
    if (!this.contactGuessInput.trim()) return;
    this.gameEngine.submitContactGuess(this.contactGuessInput);
    this.guessSubmitted = true;
    this.contactGuessInput = '';
  }

  submitBlock(): void {
    if (!this.blockWord.trim()) return;
    this.gameEngine.submitBlockGuess(this.blockWord);
    this.blockSubmitted = true;
    this.blockWord = '';
  }

  overlayMessage(): string {
    switch (this.overlay) {
      case 'BLOCKED':
        return 'BLOCKED';
      case 'SUCCESS':
        return 'SUCCESS_REVEAL';
      default:
        return '';
    }
  }
}
