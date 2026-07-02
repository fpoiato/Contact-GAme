import { NgClass } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { GameState, ActiveClue, isValidSecretWord, Player, SECRET_WORD_MAX, SECRET_WORD_MIN } from '../../core/models/ws-types';
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
  private readonly cdr = inject(ChangeDetectorRef);

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
  submittingAbandon = false;

  loadError = false;
  scoresOpen = false;
  historyOpen = false;
  showFullSecretWord = false;
  reconnectGrace: number | null = null;
  pending: Player[] = [];
  approvingIds = new Set<string>();
  rejectingIds = new Set<string>();
  private sessionReady = false;

  private prevPhase: string | null = null;
  private subs: Subscription[] = [];
  private clueDisplayTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.gameEngine.init();
    this.roomCode = this.route.snapshot.paramMap.get('roomCode') ?? '';
    void this.initSession();
    this.subs.push(this.roomService.listenForLobbyUpdates().subscribe());

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
          this.submittingAbandon = false;
        }
        if (s?.phase !== this.prevPhase) {
          this.showFullSecretWord = false;
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
        if (s?.phase === 'LOBBY' && this.prevPhase && this.prevPhase !== 'LOBBY') {
          this.router.navigate(['/lobby', this.roomCode]);
        }
        this.prevPhase = s?.phase ?? null;
        this.syncClueDisplayTimer(s);
      }),
      this.gameEngine.reconnectGrace$.subscribe((g) => (this.reconnectGrace = g)),
      this.gameEngine.overlay$.subscribe((o) => (this.overlay = o)),
      this.gameEngine.clueInputOpen$.subscribe((o) => {
        this.clueInputOpen = o;
        if (!o) {
          this.submittingClue = false;
          this.clueText = '';
        }
      }),
      this.gameEngine.clueSeconds$.subscribe((s) => {
        this.clueSeconds = s;
        if (s === 0) this.clueInputOpen = false;
      }),
      this.gameEngine.contactCount$.subscribe((c) => (this.contactCount = c)),
      this.gameEngine.stateRecoveryFailed$.subscribe((failed) => {
        if (failed) this.loadError = true;
      }),
      this.roomService.pending$.subscribe((p) => {
        this.pending = p;
        const pendingIds = new Set(p.map((x) => x.connectionId));
        this.approvingIds = new Set([...this.approvingIds].filter((id) => pendingIds.has(id)));
        this.rejectingIds = new Set([...this.rejectingIds].filter((id) => pendingIds.has(id)));
      }),
      this.roomService.room$.subscribe((r) => {
        if (r && !this.isHost && !this.roomService.isAwaitingApproval() && !this.state) {
          this.ensureGameStateLoaded();
        }
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
    this.stopClueDisplayTimer();
    this.subs.forEach((s) => s.unsubscribe());
  }

  get isSpectating(): boolean {
    return this.gameEngine.isSpectating();
  }

  get isHost(): boolean {
    return this.roomService.room?.isHost ?? false;
  }

  approve(id: string): void {
    this.approvingIds.add(id);
    this.roomService.approvePlayer(id);
    this.clearActionLoading(id, 'approve');
  }

  reject(id: string): void {
    this.rejectingIds.add(id);
    this.roomService.rejectPlayer(id);
    this.clearActionLoading(id, 'reject');
  }

  isApproving(id: string): boolean {
    return this.approvingIds.has(id);
  }

  isRejecting(id: string): boolean {
    return this.rejectingIds.has(id);
  }

  get isClueGiver(): boolean {
    return this.gameEngine.isClueGiver();
  }

  get isGuesser(): boolean {
    return this.gameEngine.isGuesser();
  }

  get isContactInitiator(): boolean {
    return this.gameEngine.isContactInitiator();
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

  get displayedWord(): string {
    if (this.showFullSecretWord && this.clueGiverSecretWord) {
      return this.clueGiverSecretWord;
    }
    return this.displayPrefix || '?';
  }

  get clueGiverSecretWord(): string {
    return this.gameEngine.getClueGiverSecretWord();
  }

  get canPeekSecretWord(): boolean {
    return (
      this.isClueGiver &&
      !!this.clueGiverSecretWord &&
      this.state?.phase !== 'WORD_SETUP' &&
      this.state?.phase !== 'LOBBY'
    );
  }

  revealSecretWord(): void {
    this.showFullSecretWord = true;
  }

  hideSecretWord(): void {
    this.showFullSecretWord = false;
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

  cancelClue(): void {
    if (this.submittingClue) return;
    this.gameEngine.closeClueInput();
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

  abandonContact(): void {
    if (this.submittingAbandon) return;
    this.submittingAbandon = true;
    this.gameEngine.abandonContact();
    this.clearLoadingAfter(() => (this.submittingAbandon = false));
  }

  clueSecondsRemaining(clue: ActiveClue): number {
    return this.gameEngine.getClueSecondsRemaining(clue);
  }

  get expiredClues(): ActiveClue[] {
    return this.state?.expiredClues ?? [];
  }

  toggleHistory(): void {
    this.historyOpen = !this.historyOpen;
  }

  closeHistory(): void {
    this.historyOpen = false;
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

  get secretWordFormOpen(): boolean {
    return !!this.state && this.state.phase === 'WORD_SETUP' && this.isClueGiver;
  }

  get contactGuessFormOpen(): boolean {
    return (
      !!this.state &&
      this.state.phase === 'CONTACT_COUNTDOWN' &&
      this.isContactParticipant &&
      !this.guessSubmitted
    );
  }

  get contactClue(): ActiveClue | null {
    const clueId = this.state?.contactClueId;
    if (!clueId || !this.state) return null;
    return (
      this.state.activeClues?.find((c) => c.id === clueId) ??
      this.state.expiredClues?.find((c) => c.id === clueId) ??
      null
    );
  }

  get blockFormOpen(): boolean {
    return (
      !!this.state &&
      this.state.phase === 'CONTACT_COUNTDOWN' &&
      this.isClueGiver &&
      !this.blockSubmitted
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

  private syncClueDisplayTimer(state: GameState | null): void {
    const shouldRun =
      !!state &&
      (state.phase === 'CLUE_PHASE' || state.phase === 'CONTACT_COUNTDOWN') &&
      ((state.activeClues?.length ?? 0) > 0 || (state.expiredClues?.length ?? 0) > 0);

    if (!shouldRun) {
      this.stopClueDisplayTimer();
      return;
    }

    if (this.clueDisplayTimer) return;

    this.clueDisplayTimer = setInterval(() => this.cdr.markForCheck(), 1000);
  }

  private stopClueDisplayTimer(): void {
    if (this.clueDisplayTimer) {
      clearInterval(this.clueDisplayTimer);
      this.clueDisplayTimer = null;
    }
  }

  private clearActionLoading(id: string, action: 'approve' | 'reject'): void {
    setTimeout(() => {
      if (action === 'approve') this.approvingIds.delete(id);
      else this.rejectingIds.delete(id);
    }, 5000);
  }
}
