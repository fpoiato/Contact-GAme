import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { GameState } from '../../core/models/ws-types';
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
  hasVoted = false;

  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.gameEngine.init();
    this.roomCode = this.route.snapshot.paramMap.get('roomCode') ?? '';

    this.subs.push(
      this.gameEngine.state$.subscribe((s) => {
        this.state = s;
        if (s?.phase === 'MATCH_VOTE') {
          this.hasVoted = !!s.votes?.[this.gameEngine.myId ?? ''];
        }
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

  get displayPrefix(): string {
    return this.gameEngine.getDisplayPrefix();
  }

  setWord(): void {
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

  contact(): void {
    this.gameEngine.initiateContact();
  }

  block(): void {
    if (!this.blockWord.trim()) return;
    this.gameEngine.blockContact(this.blockWord);
    this.blockWord = '';
  }

  vote(matched: boolean): void {
    this.gameEngine.castVote(matched);
    this.hasVoted = true;
  }

  canBlock(): boolean {
    return !!this.state?.canBlock && this.state.phase === 'CONTACT_COUNTDOWN' && this.isClueGiver;
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
