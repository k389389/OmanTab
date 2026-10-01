import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getGetTitleHoldersQueryKey,
  useCreateTitleHolder,
  useGetTitleHolders,
} from '@workspace/api-client-react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleHelp,
  Info,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import titleAwardImage from '@assets/244C7EF4-0C3B-4FFB-913C-A449C722DC34_1790592374261.png';

type PlayerId = 'you' | 'top' | 'right' | 'left';
type Winner = PlayerId | null;
type Difficulty = 'weak' | 'normal' | 'strong' | 'expert';
type Coord = readonly [number, number];
type PieceState = Record<PlayerId, number[]>;
type CpuMove = {
  pieceIndex: number;
  value: number;
};
type CpuPlan = CpuMove[];
type LastRoll = {
  value: number;
  owner: PlayerId;
  isTab: boolean;
  total: number;
};
type RankingEntry = {
  player: PlayerId;
  goals: number;
  rank: number;
};
type SoundName = 'roll' | 'move' | 'capture' | 'goal' | 'tab' | 'extra' | 'select' | 'reset' | 'ui' | 'win';
type Celebration = 'capture' | 'goal';
type ExpertTitleStep = 'waiting' | 'image' | 'prompt' | 'input' | 'saved';

const players: PlayerId[] = ['you', 'top', 'right', 'left'];
const cpuPlayers: PlayerId[] = ['top', 'right', 'left'];
const turnOrder: PlayerId[] = ['you', 'top', 'right', 'left'];

const playerMeta: Record<
  PlayerId,
  {
    name: string;
    shortName: string;
    color: string;
    shape: string;
    startLabel: string;
  }
> = {
  you: {
    name: 'あなた',
    shortName: 'あなた',
    color: 'yellow',
    shape: 'crescent',
    startLabel: '下のマディナ',
  },
  top: {
    name: '上のCPU',
    shortName: '上',
    color: 'green',
    shape: 'diamond',
    startLabel: '上のマディナ',
  },
  right: {
    name: '右のCPU',
    shortName: '右',
    color: 'orange',
    shape: 'triangle',
    startLabel: '右のマディナ',
  },
  left: {
    name: '左のCPU',
    shortName: '左',
    color: 'cyan',
    shape: 'circle',
    startLabel: '左のマディナ',
  },
};

// 写真の盤面を、外周（反時計回り）→内周（時計回り）の順で定義。
const outerTrack: Coord[] = [
  [0, 2],
  [0, 1],
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 0],
  [4, 1],
  [4, 2],
  [4, 3],
  [4, 4],
  [3, 4],
  [2, 4],
  [1, 4],
  [0, 4],
  [0, 3],
];

const innerTrack: Coord[] = [
  [1, 2],
  [1, 3],
  [2, 3],
  [3, 3],
  [3, 2],
  [3, 1],
  [2, 1],
  [1, 1],
];

const startOffset: Record<PlayerId, number> = {
  you: 8,
  top: 0,
  right: 12,
  left: 4,
};

const innerEntry: Record<PlayerId, number> = {
  you: 5,
  top: 1,
  right: 3,
  left: 7,
};

const initialPieces: PieceState = {
  you: [0, 0, 0, 0],
  top: [0, 0, 0, 0],
  right: [0, 0, 0, 0],
  left: [0, 0, 0, 0],
};

function routeFor(player: PlayerId): Coord[] {
  const outer = Array.from(
    { length: outerTrack.length },
    (_, index) => outerTrack[(startOffset[player] + index) % outerTrack.length],
  );
  const inner = Array.from(
    { length: innerTrack.length },
    (_, index) => innerTrack[(innerEntry[player] + index) % innerTrack.length],
  );
  return [...outer, ...inner];
}

function coordKey(coord: Coord) {
  return `${coord[0]}-${coord[1]}`;
}

function getPieceCoord(player: PlayerId, progress: number): Coord | null {
  if (progress >= 24) return null;
  return routeFor(player)[progress];
}

function isMadinaCoord(coord: Coord) {
  return players.some((player) => coordKey(routeFor(player)[0]) === coordKey(coord));
}

function getDirection(row: number, column: number) {
  const directions: Record<string, 'left' | 'down' | 'right' | 'up'> = {
    '0-0': 'down',
    '0-1': 'left',
    '0-2': 'left',
    '0-3': 'left',
    '0-4': 'left',
    '1-0': 'down',
    '1-1': 'right',
    '1-2': 'right',
    '1-3': 'down',
    '1-4': 'up',
    '2-0': 'down',
    '2-1': 'up',
    '2-3': 'down',
    '2-4': 'up',
    '3-0': 'down',
    '3-1': 'up',
    '3-2': 'up',
    '3-3': 'left',
    '3-4': 'up',
    '4-0': 'right',
    '4-1': 'up',
    '4-2': 'right',
    '4-3': 'right',
    '4-4': 'up',
  };
  const direction = directions[`${row}-${column}`] ?? 'up';
  const icons = {
    left: <ArrowLeft size={13} strokeWidth={2.5} />,
    down: <ArrowDown size={13} strokeWidth={2.5} />,
    right: <ArrowRight size={13} strokeWidth={2.5} />,
    up: <ArrowUp size={13} strokeWidth={2.5} />,
  };
  return icons[direction];
}

function rollStickCount() {
  const outcome = Math.floor(Math.random() * 16);
  if (outcome === 0) return 0;
  if (outcome <= 4) return 1;
  if (outcome <= 10) return 2;
  if (outcome <= 14) return 3;
  return 4;
}

function freshSticks(value: number) {
  const sticks = [false, false, false, false];
  for (let index = 0; index < value; index += 1) sticks[index] = true;
  for (let index = sticks.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [sticks[index], sticks[swapIndex]] = [sticks[swapIndex], sticks[index]];
  }
  return sticks;
}

function copyPieceState(state: PieceState): PieceState {
  return {
    you: [...state.you],
    top: [...state.top],
    right: [...state.right],
    left: [...state.left],
  };
}

function countCapturesForState(player: PlayerId, target: Coord, state: PieceState) {
  if (isMadinaCoord(target)) return 0;
  return players
    .filter((other) => other !== player)
    .reduce((total, other) => {
      return total + state[other].filter(
        (progress) => progress < 24
          && getPieceCoord(other, progress) !== null
          && coordKey(getPieceCoord(other, progress) as Coord) === coordKey(target),
      ).length;
    }, 0);
}

function applyMoveToState(
  player: PlayerId,
  pieceIndex: number,
  value: number,
  state: PieceState,
) {
  const nextState = copyPieceState(state);
  const targetProgress = Math.min(24, state[player][pieceIndex] + value);
  const targetCoord = getPieceCoord(player, targetProgress);
  nextState[player][pieceIndex] = targetProgress;
  const captures = targetCoord ? countCapturesForState(player, targetCoord, state) : 0;

  if (targetCoord && !isMadinaCoord(targetCoord)) {
    players
      .filter((other) => other !== player)
      .forEach((other) => {
        nextState[other] = nextState[other].map((progress) => {
          const otherCoord = getPieceCoord(other, progress);
          return progress < 24
            && otherCoord
            && coordKey(otherCoord) === coordKey(targetCoord)
            ? 0
            : progress;
        });
      });
  }

  return {
    state: nextState,
    targetProgress,
    targetCoord,
    captures,
    reachedGoal: targetProgress === 24,
    landedOnMadina: Boolean(targetCoord && isMadinaCoord(targetCoord)),
  };
}

function getExpertMoveAmounts(
  player: PlayerId,
  pieceIndex: number,
  remaining: number,
  state: PieceState,
) {
  const maxMove = Math.min(remaining, 24 - state[player][pieceIndex]);
  const amounts = new Set<number>();

  // Small rolls are searched exhaustively. For large totals, keep tactical
  // breakpoints and several split points so repeated Tabs cannot freeze search.
  if (maxMove <= 10) {
    for (let amount = 1; amount <= maxMove; amount += 1) amounts.add(amount);
  } else {
    [1, 2, 3, 4, 5, 6, 8, maxMove - 1, maxMove].forEach((amount) => {
      if (amount > 0 && amount <= maxMove) amounts.add(amount);
    });
    for (let amount = 1; amount <= maxMove; amount += 1) {
      const targetProgress = state[player][pieceIndex] + amount;
      const targetCoord = getPieceCoord(player, targetProgress);
      if (
        targetProgress === 24
        || (targetCoord && (
          isMadinaCoord(targetCoord)
          || countCapturesForState(player, targetCoord, state) > 0
        ))
      ) {
        amounts.add(amount);
      }
    }
  }

  if (remaining <= maxMove) amounts.add(remaining);
  return [...amounts].sort((a, b) => a - b);
}

function enumerateExpertPlans(player: PlayerId, total: number, initialState: PieceState) {
  const plans: CpuPlan[] = [];
  const maxPlans = 12000;
  const visit = (
    state: PieceState,
    remaining: number,
    movedIndices: number[],
    plan: CpuPlan,
  ) => {
    if (plans.length >= maxPlans) return;
    const available = state[player]
      .map((progress, index) => (
        progress < 24 && !movedIndices.includes(index) ? index : -1
      ))
      .filter((index) => index >= 0);

    if (remaining <= 0 || available.length === 0) {
      plans.push(plan);
      return;
    }

    available.forEach((pieceIndex) => {
      const amounts = available.length === 1
        ? [Math.min(remaining, 24 - state[player][pieceIndex])]
        : getExpertMoveAmounts(player, pieceIndex, remaining, state);
      amounts.forEach((value) => {
        if (plans.length >= maxPlans) return;
        const result = applyMoveToState(player, pieceIndex, value, state);
        visit(
          result.state,
          remaining - value,
          [...movedIndices, pieceIndex],
          [...plan, { pieceIndex, value }],
        );
      });
    });
  };

  visit(initialState, total, [], []);
  return plans;
}

function calculateThreatScore(player: PlayerId, state: PieceState) {
  const possibleRolls = [1, 2, 3, 4, 8, 9, 10, 11, 12];
  return players
    .filter((other) => other !== player)
    .reduce((total, opponent) => {
      return total + state[player].reduce((pieceThreat, progress) => {
        if (progress >= 24) return pieceThreat;
        const threatened = possibleRolls.some((roll) => {
          const opponentPieces = state[opponent];
          return opponentPieces.some((opponentProgress) => {
            if (opponentProgress >= 24) return false;
            const moveValue = Math.min(roll, 24 - opponentProgress);
            const target = getPieceCoord(opponent, opponentProgress + moveValue);
            return target !== null
              && countCapturesForState(opponent, target, state) > 0
              && getPieceCoord(player, progress)
              && coordKey(getPieceCoord(player, progress) as Coord) === coordKey(target);
          });
        });
        return pieceThreat + (threatened ? 1 : 0);
      }, 0);
    }, 0);
}

function evaluateExpertPlan(
  player: PlayerId,
  initialState: PieceState,
  plan: CpuPlan,
) {
  let state = initialState;
  let captures = 0;
  let goals = 0;
  let madinaLandings = 0;

  plan.forEach(({ pieceIndex, value }) => {
    const result = applyMoveToState(player, pieceIndex, value, state);
    state = result.state;
    captures += result.captures;
    goals += result.reachedGoal ? 1 : 0;
    madinaLandings += result.landedOnMadina ? 1 : 0;
  });

  const activePieces = state[player].filter((progress) => progress < 24);
  const initialActivePieces = initialState[player].filter((progress) => progress < 24);
  const progressTotal = state[player].reduce((total, progress) => total + progress, 0);
  const opponentProgress = players
    .filter((other) => other !== player)
    .reduce(
      (total, other) => total + state[other].reduce((sum, progress) => sum + progress, 0),
      0,
    );
  const spread = activePieces.length > 1
    ? Math.max(...activePieces) - Math.min(...activePieces)
    : 0;
  const initialSpread = initialActivePieces.length > 1
    ? Math.max(...initialActivePieces) - Math.min(...initialActivePieces)
    : 0;
  const balanceGain = initialSpread - spread;
  const threatScore = calculateThreatScore(player, state);
  const opponentGoalThreat = players
    .filter((other) => other !== player)
    .reduce((total, other) => total + state[other].filter(
      (progress) => progress < 24 && [1, 2, 3, 4, 8, 9, 10, 11, 12]
        .some((roll) => progress + roll >= 24),
    ).length, 0);

  return (
    goals * 100000
    + captures * 22000
    + progressTotal * 140
    + balanceGain * 180
    + madinaLandings * 320
    - threatScore * 1800
    - opponentGoalThreat * 650
    - opponentProgress * 18
    + plan.length * 8
  );
}

function stackOffset(index: number, count: number): Coord {
  if (count === 2) return index === 0 ? [-11, 0] : [11, 0];
  if (count === 3) {
    const offsets: Coord[] = [[-10, -8], [10, -8], [0, 11]];
    return offsets[index] ?? [0, 0];
  }
  if (count >= 4) {
    const offsets: Coord[] = [[-10, -10], [10, -10], [-10, 10], [10, 10]];
    return offsets[index] ?? [0, 0];
  }
  return [0, 0];
}

function countOnBoard(pieceList: number[]) {
  return pieceList.filter((progress) => progress < 24).length;
}

function createRanking(state: PieceState): RankingEntry[] {
  return [...players]
    .sort((a, b) => {
      const goalDifference = b === a
        ? 0
        : state[b].filter((progress) => progress === 24).length
          - state[a].filter((progress) => progress === 24).length;
      return goalDifference || players.indexOf(a) - players.indexOf(b);
    })
    .map((player, index) => ({
      player,
      goals: state[player].filter((progress) => progress === 24).length,
      rank: index + 1,
    }));
}

function App() {
  const [pieces, setPieces] = useState<PieceState>(initialPieces);
  const [turn, setTurn] = useState<PlayerId>('you');
  const [rolled, setRolled] = useState<number | null>(null);
  const [lastRoll, setLastRoll] = useState<LastRoll | null>(null);
  const [sticks, setSticks] = useState([false, false, false, false]);
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  const [movedPieceIndices, setMovedPieceIndices] = useState<number[]>([]);
  const [awaitingTabRoll, setAwaitingTabRoll] = useState(false);
  const [extraTurnPending, setExtraTurnPending] = useState(false);
  const [history, setHistory] = useState<string[]>(['盤面の準備ができました。棒を振ってください。']);
  const [winner, setWinner] = useState<Winner>(null);
  const [ranking, setRanking] = useState<RankingEntry[] | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [difficultyLocked, setDifficultyLocked] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [tabEffect, setTabEffect] = useState(false);
  const [celebration, setCelebration] = useState<{ type: Celebration; id: number } | null>(null);
  const [expertVictory, setExpertVictory] = useState(false);
  const [expertTitleStep, setExpertTitleStep] = useState<ExpertTitleStep>('prompt');
  const [titleName, setTitleName] = useState('');
  const [titleSaveError, setTitleSaveError] = useState<string | null>(null);
  const [titleHoldersOpen, setTitleHoldersOpen] = useState(false);
  const cpuThinking = useRef(false);
  const audioContext = useRef<AudioContext | null>(null);
  const celebrationId = useRef(0);
  const titleHoldersQuery = useGetTitleHolders({
    query: {
      enabled: titleHoldersOpen,
      queryKey: getGetTitleHoldersQueryKey(),
    },
  });
  const createTitleHolderMutation = useCreateTitleHolder();

  const routeIndex = useMemo(() => {
    const map = new Map<string, number>();
    outerTrack.forEach((coord, index) => map.set(coordKey(coord), index));
    innerTrack.forEach((coord, index) => map.set(coordKey(coord), index + 16));
    return map;
  }, []);

  const playerRouteLabels = useMemo(() => {
    const map = new Map<string, string>();
    routeFor('you').forEach((coord, index) => {
      map.set(coordKey(coord), index === 0 ? 'M' : String(index).padStart(2, '0'));
    });
    return map;
  }, []);

  const selectedMoveLimit = selectedPiece !== null && rolled !== null
    ? Math.min(rolled, 24 - pieces.you[selectedPiece])
    : 0;

  const unmovedPieceIndices = pieces.you
    .map((progress, index) => progress < 24 && !movedPieceIndices.includes(index) ? index : -1)
    .filter((index) => index >= 0);
  const mustUseAllRemaining = selectedPiece !== null
    && unmovedPieceIndices.length === 1
    && unmovedPieceIndices[0] === selectedPiece;

  const selectedDestinations = selectedPiece !== null && rolled !== null
    ? (mustUseAllRemaining
      ? [selectedMoveLimit]
      : Array.from({ length: selectedMoveLimit }, (_, index) => index + 1)
    ).map((amount) => ({
      amount,
      coord: getPieceCoord('you', pieces.you[selectedPiece] + amount) ?? [2, 2] as Coord,
    }))
    : [];

  const addHistory = (entry: string) => {
    setHistory((current) => [entry, ...current].slice(0, 8));
  };

  const playSound = (name: SoundName) => {
    if (!soundEnabled || typeof window === 'undefined') return;
    const AudioContextConstructor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = audioContext.current ?? new AudioContextConstructor();
    audioContext.current = context;
    if (context.state === 'suspended') void context.resume();

    const patterns: Record<SoundName, Array<[number, number, number, OscillatorType]>> = {
      roll: [[180, 0, .07, 'triangle'], [240, .08, .07, 'triangle'], [320, .16, .09, 'triangle']],
      move: [[300, 0, .1, 'sine']],
      capture: [[150, 0, .12, 'square'], [100, .12, .18, 'square']],
      goal: [[440, 0, .13, 'sine'], [554, .14, .13, 'sine'], [659, .28, .24, 'sine']],
      tab: [[220, 0, .12, 'sawtooth'], [330, .13, .12, 'sawtooth'], [520, .26, .32, 'sine']],
      extra: [[392, 0, .11, 'sine'], [523, .12, .2, 'sine']],
      select: [[520, 0, .06, 'sine']],
      reset: [[260, 0, .08, 'triangle'], [180, .1, .12, 'triangle']],
      ui: [[620, 0, .05, 'sine']],
      win: [[392, 0, .12, 'sine'], [523, .13, .12, 'sine'], [659, .26, .14, 'sine'], [784, .41, .32, 'sine']],
    };

    patterns[name].forEach(([frequency, delay, duration, oscillatorType]) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + delay;
      oscillator.type = oscillatorType;
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
    });
  };

  const triggerTabEffect = () => {
    setTabEffect(true);
    window.setTimeout(() => setTabEffect(false), 1400);
    playSound('tab');
  };

  const triggerCelebration = (type: Celebration) => {
    celebrationId.current += 1;
    const id = celebrationId.current;
    setCelebration({ type, id });
    window.setTimeout(() => {
      setCelebration((current) => (current?.id === id ? null : current));
    }, 1500);
  };

  const nextTurn = (current: PlayerId) => {
    const index = turnOrder.indexOf(current);
    return turnOrder[(index + 1) % turnOrder.length];
  };

  const getLegalMoves = (player: PlayerId, _value: number, state: PieceState) =>
    state[player]
      .map((progress, index) => (progress < 24 ? index : -1))
      .filter((index) => index >= 0);

  const countCaptures = (player: PlayerId, target: Coord, state: PieceState) => {
    if (isMadinaCoord(target)) return 0;
    return players
      .filter((other) => other !== player)
      .reduce((total, other) => {
        return total + state[other].filter(
          (progress) => progress < 24 && getPieceCoord(other, progress) !== null
            && coordKey(getPieceCoord(other, progress) as Coord) === coordKey(target),
        ).length;
      }, 0);
  };

  const performMove = (player: PlayerId, pieceIndex: number, value: number) => {
    const current = pieces;
    const movingFrom = current[player][pieceIndex];
    const targetProgress = movingFrom + value;
    const targetCoord = getPieceCoord(player, targetProgress);
    const nextPieces: PieceState = {
      you: [...current.you],
      top: [...current.top],
      right: [...current.right],
      left: [...current.left],
    };
    nextPieces[player][pieceIndex] = targetProgress;
    const capturedByPlayer: string[] = [];
    const targetIsMadina = targetCoord ? isMadinaCoord(targetCoord) : false;

    if (targetCoord && !targetIsMadina) {
      players
        .filter((other) => other !== player)
        .forEach((other) => {
          nextPieces[other] = nextPieces[other].map((progress) => {
            if (
              progress < 24
              && getPieceCoord(other, progress)
              && coordKey(getPieceCoord(other, progress) as Coord) === coordKey(targetCoord)
            ) {
              capturedByPlayer.push(playerMeta[other].shortName);
              return 0;
            }
            return progress;
          });
        });
    }

    setPieces(nextPieces);
    if (player === 'you') {
      setMovedPieceIndices((current) => (
        current.includes(pieceIndex) ? current : [...current, pieceIndex]
      ));
    }
    setSelectedPiece(null);

    const playerName = playerMeta[player].name;
    if (targetProgress === 24) {
      addHistory(`${playerName}の駒がゴールしました。`);
    } else if (capturedByPlayer.length > 0) {
      addHistory(`${playerName}が${capturedByPlayer.join('・')}の駒をマディナへ戻しました。`);
    } else {
      addHistory(`${playerName}が${value}マス進みました。`);
    }

    // マディナは安全地帯。同じマディナに駒が重なっても、
    // カット扱いにも連続手番のきっかけにもならない。
    const grantsExtraTurn = !targetIsMadina && (
      targetProgress === 24 || capturedByPlayer.length > 0
    );
    if (targetProgress === 24) {
      playSound('goal');
      triggerCelebration('goal');
    } else if (capturedByPlayer.length > 0) {
      playSound('capture');
      triggerCelebration('capture');
    } else {
      playSound('move');
    }
    const remainingPoints = player === 'you' && rolled !== null
      ? Math.max(0, rolled - value)
      : 0;
    const movedByPlayer = player === 'you'
      ? [...movedPieceIndices, pieceIndex]
      : [];
    const hasUnmovedPieces = player === 'you'
      ? nextPieces.you.some((progress, index) => progress < 24 && !movedByPlayer.includes(index))
      : true;

    if (nextPieces[player].every((progress) => progress === 24)) {
      setRanking(createRanking(nextPieces));
      setWinner(player);
      setExpertVictory(player === 'you' && difficulty === 'expert');
      setExpertTitleStep('waiting');
      setTitleName('');
      setTitleSaveError(null);
      setTurn(player);
      setRolled(null);
      setAwaitingTabRoll(false);
      setExtraTurnPending(false);
      setMovedPieceIndices([]);
      playSound('win');
      addHistory(`${playerName}が4つの駒をすべてゴールさせました。`);
    } else if (remainingPoints > 0 && hasUnmovedPieces) {
      setRolled(remainingPoints);
      setTurn(player);
      if (grantsExtraTurn) setExtraTurnPending(true);
      addHistory(`残り${remainingPoints}マスを別の駒にも分けて使えます。`);
    } else if (grantsExtraTurn || extraTurnPending) {
      setRolled(null);
      setAwaitingTabRoll(false);
      setExtraTurnPending(false);
      setMovedPieceIndices([]);
      setTurn(player);
      window.setTimeout(() => playSound('extra'), 220);
      addHistory(`${playerName}の連続手番です。もう一度棒を振れます。`);
    } else {
      setRolled(null);
      setAwaitingTabRoll(false);
      setMovedPieceIndices([]);
      setTurn(nextTurn(player));
      if (remainingPoints > 0) {
        addHistory(`残り${remainingPoints}マスを使える駒がないため、手番を終了します。`);
      }
    }
  };

  const performCpuPlan = (player: PlayerId, plan: CpuPlan) => {
    let nextPieces = pieces;
    let captureCount = 0;
    let goalCount = 0;

    plan.forEach(({ pieceIndex, value }) => {
      const result = applyMoveToState(player, pieceIndex, value, nextPieces);
      nextPieces = result.state;
      captureCount += result.captures;
      goalCount += result.reachedGoal ? 1 : 0;
      addHistory(`${playerMeta[player].name}が${value}マス進みました。`);
    });

    setPieces(nextPieces);
    setSelectedPiece(null);
    if (captureCount > 0) {
      addHistory(`${playerMeta[player].name}が相手の駒を${captureCount}個カットしました。`);
      triggerCelebration('capture');
    } else if (goalCount > 0) {
      triggerCelebration('goal');
    }
    if (goalCount > 0) {
      addHistory(`${playerMeta[player].name}の駒が${goalCount}個ゴールしました。`);
    }

    const playerName = playerMeta[player].name;
    const grantsExtraTurn = captureCount > 0 || goalCount > 0;
    if (nextPieces[player].every((progress) => progress === 24)) {
      setRanking(createRanking(nextPieces));
      setWinner(player);
      setExpertVictory(false);
      setExpertTitleStep('prompt');
      setTitleName('');
      setTitleSaveError(null);
      setTurn(player);
      setRolled(null);
      setAwaitingTabRoll(false);
      setExtraTurnPending(false);
      setMovedPieceIndices([]);
      playSound('win');
      addHistory(`${playerName}が4つの駒をすべてゴールさせました。`);
    } else {
      setRolled(null);
      setAwaitingTabRoll(false);
      setExtraTurnPending(false);
      setMovedPieceIndices([]);
      if (grantsExtraTurn) {
        setTurn(player);
        window.setTimeout(() => {
          playSound(goalCount > 0 ? 'goal' : 'capture');
          playSound('extra');
        }, 220);
        addHistory(`${playerName}の連続手番です。もう一度棒を振れます。`);
      } else {
        setTurn(nextTurn(player));
      }
    }
  };

  const handleRoll = () => {
    if (turn !== 'you' || winner || (rolled !== null && !awaitingTabRoll)) return;
    setDifficultyLocked(true);
    const faceValue = rollStickCount();
    const isTab = faceValue === 0;
    const previousTotal = awaitingTabRoll ? rolled ?? 0 : 0;
    const total = previousTotal + (isTab ? 8 : faceValue);

    setRolled(total);
    setLastRoll({ value: faceValue, owner: 'you', isTab, total });
    setSticks(freshSticks(faceValue));
    setSelectedPiece(null);

    if (isTab) {
      triggerTabEffect();
      setAwaitingTabRoll(true);
      addHistory(`ターブが出ました。8として加算し、もう一度棒を振ります。現在の合計は${total}です。`);
    } else {
      playSound('roll');
      if (!awaitingTabRoll) setMovedPieceIndices([]);
      setAwaitingTabRoll(false);
      addHistory(`${awaitingTabRoll ? `ターブを含めて合計${total}` : `${faceValue}`}マスです。駒ごとに分けて使えます。`);
    }
  };

  const handleCellClick = (row: number, column: number) => {
    if (turn !== 'you' || rolled === null || awaitingTabRoll || winner) return;
    const clicked = [row, column] as Coord;

    const selectedDestination = selectedDestinations.find(
      (destination) => coordKey(destination.coord) === coordKey(clicked),
    );
    if (selectedPiece !== null && selectedDestination) {
      performMove('you', selectedPiece, selectedDestination.amount);
      return;
    }

    const candidate = pieces.you.findIndex(
      (progress, index) => progress < 24
        && !movedPieceIndices.includes(index)
        && getPieceCoord('you', progress)
        && coordKey(getPieceCoord('you', progress) as Coord) === coordKey(clicked)
    );
    if (candidate >= 0) {
      setSelectedPiece(candidate);
    }
  };

  const resetGame = () => {
    cpuThinking.current = false;
    setPieces({
      you: [...initialPieces.you],
      top: [...initialPieces.top],
      right: [...initialPieces.right],
      left: [...initialPieces.left],
    });
    setTurn('you');
    setRolled(null);
    setLastRoll(null);
    setSticks([false, false, false, false]);
    setSelectedPiece(null);
    setMovedPieceIndices([]);
    setAwaitingTabRoll(false);
    setExtraTurnPending(false);
    setTabEffect(false);
    setCelebration(null);
    setWinner(null);
    setRanking(null);
    setDifficultyLocked(false);
    setExpertVictory(false);
    setExpertTitleStep('prompt');
    setTitleName('');
    setTitleSaveError(null);
    setHistory(['盤面の準備ができました。棒を振ってください。']);
    playSound('reset');
  };

  const handleSaveTitle = () => {
    const trimmedName = titleName.trim();
    if (!trimmedName) {
      setTitleSaveError('名前を入力してください。');
      return;
    }

    setTitleSaveError(null);
    createTitleHolderMutation.mutate(
      { data: { name: trimmedName } },
      {
        onSuccess: () => {
          setExpertTitleStep('saved');
          setTitleName(trimmedName);
          void titleHoldersQuery.refetch();
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : '';
          setTitleSaveError(
            message
              ? `保存できませんでした。${message}`
              : '保存できませんでした。もう一度お試しください。',
          );
        },
      },
    );
  };

  useEffect(() => {
    if (!winner || !ranking || !expertVictory) return;
    if (expertTitleStep !== 'waiting' && expertTitleStep !== 'image') return;

    const timer = window.setTimeout(() => {
      setExpertTitleStep(expertTitleStep === 'waiting' ? 'image' : 'prompt');
    }, expertTitleStep === 'waiting' ? 2000 : 5000);

    return () => window.clearTimeout(timer);
  }, [winner, ranking, expertVictory, expertTitleStep]);

  const openTitleHolders = () => {
    setTitleHoldersOpen(true);
    playSound('ui');
  };

  useEffect(() => {
    if (!cpuPlayers.includes(turn) || winner || cpuThinking.current) return;
    cpuThinking.current = true;
    const timer = window.setTimeout(() => {
      let faceValue = rollStickCount();
      let total = faceValue === 0 ? 8 : faceValue;
      let tabCount = faceValue === 0 ? 1 : 0;
      while (faceValue === 0) {
        faceValue = rollStickCount();
        if (faceValue === 0) {
          total += 8;
          tabCount += 1;
        } else {
          total += faceValue;
        }
      }

      const legalMoves = getLegalMoves(turn, total, pieces);
      setSticks(freshSticks(faceValue));
      setLastRoll({ value: faceValue, owner: turn, isTab: tabCount > 0, total });
      if (tabCount > 0) {
        triggerTabEffect();
        addHistory(`${playerMeta[turn].name}にターブ。8として加算し、合計${total}マスで進みます。`);
      } else {
        playSound('roll');
        addHistory(`${playerMeta[turn].name}に${total}が出ました。`);
      }

      if (legalMoves.length === 0) {
        addHistory(`${playerMeta[turn].name}は進める駒がなく、手番をパスしました。`);
        setRolled(null);
        setTurn(nextTurn(turn));
        cpuThinking.current = false;
        return;
      }

      if (difficulty === 'expert') {
        const plans = enumerateExpertPlans(turn, total, pieces);
        const selectedPlan = plans
          .map((plan) => ({ plan, score: evaluateExpertPlan(turn, pieces, plan) }))
          .reduce((best, candidate) => (
            candidate.score > best.score ? candidate : best
          )).plan;
        performCpuPlan(turn, selectedPlan);
      } else {
        const ranked = legalMoves.map((pieceIndex) => {
          const moveValue = Math.min(total, 24 - pieces[turn][pieceIndex]);
          const targetProgress = pieces[turn][pieceIndex] + moveValue;
          const targetCoord = getPieceCoord(turn, targetProgress) ?? [2, 2] as Coord;
          const captures = countCaptures(turn, targetCoord, pieces);
          const targetIsMadina = isMadinaCoord(targetCoord);
          const currentActive = pieces[turn].filter((progress) => progress < 24);
          const nextActive = pieces[turn]
            .map((progress, index) => (index === pieceIndex ? targetProgress : progress))
            .filter((progress) => progress < 24);
          const currentSpread = currentActive.length > 0
            ? Math.max(...currentActive) - Math.min(...currentActive)
            : 0;
          const nextSpread = nextActive.length > 0
            ? Math.max(...nextActive) - Math.min(...nextActive)
            : 0;
          const balanceGain = currentSpread - nextSpread;
          const otherPieceHasProgress = pieces[turn].some(
            (progress, index) => index !== pieceIndex && progress > 0 && progress < 24,
          );
          const strongScore = (targetProgress === 24 ? 2000 : 0)
            + captures * 500
            + (targetIsMadina ? 70 : 0)
            + balanceGain * 30
            + (pieces[turn][pieceIndex] === 0 && otherPieceHasProgress ? 20 : 0)
            + targetProgress * 3;
          return { pieceIndex, moveValue, targetProgress, captures, strongScore };
        }).sort((a, b) => {
          if (difficulty === 'strong' && a.strongScore !== b.strongScore) {
            return b.strongScore - a.strongScore;
          }
          return b.targetProgress - a.targetProgress;
        });

        const selectedMove = difficulty === 'weak'
          ? ranked[Math.floor(Math.random() * ranked.length)]
          : ranked[0];
        performMove(turn, selectedMove.pieceIndex, selectedMove.moveValue);
      }
      cpuThinking.current = false;
    }, difficulty === 'expert' ? 1350 : difficulty === 'strong' ? 650 : difficulty === 'weak' ? 1150 : 950);
    return () => {
      window.clearTimeout(timer);
      cpuThinking.current = false;
    };
  }, [turn, winner, difficulty, pieces]);

  const instruction = winner
    ? `${playerMeta[winner].name}の勝利です。新しい対局を始められます。`
    : turn !== 'you'
      ? `${playerMeta[turn].name}が考えています…`
      : awaitingTabRoll
        ? `ターブです。もう一度棒を振って、合計${rolled}にします。`
      : rolled === null
        ? '棒を振って、あなたの手番を始めてください。'
        : selectedPiece === null
          ? '動かす駒をタップしてください。'
          : mustUseAllRemaining
            ? `残り${selectedMoveLimit}マスすべて進む移動先をタップしてください。`
            : `黄色く光っている移動先をタップしてください（1〜${selectedMoveLimit}マス）。`;

  return (
    <main className="tab-app">
      <header className="tab-topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><Sparkles size={24} /></div>
          <div>
            <div className="eyebrow">オマーン館 ・ 大阪・関西万博 2025</div>
            <div className="brand-name">ターブ / 盤上ゲーム</div>
          </div>
        </div>
        <div className="top-actions">
          <button className="quiet-button" onClick={resetGame} data-testid="button-new-game-top">新しい対局</button>
          <button
            className="icon-button"
            onClick={() => setSoundEnabled((current) => !current)}
            aria-label={soundEnabled ? '効果音をオフにする' : '効果音をオンにする'}
            aria-pressed={soundEnabled}
            data-testid="button-toggle-sound"
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            className="icon-button"
            onClick={() => {
              setRulesOpen((current) => !current);
              playSound('ui');
            }}
            aria-label="ルールを表示"
            aria-expanded={rulesOpen}
            data-testid="button-toggle-rules"
          >
            <CircleHelp size={18} />
          </button>
        </div>
      </header>

      <div className="game-wrap">
        <section className="intro-row">
          <div>
            <h1 className="intro-title">駒を <em>ゴール</em> へ。</h1>
          </div>
          <p className="intro-copy">
            4人で対戦し、あなた以外の3人はCPUです。マディナから外周を反時計回り、内周を時計回りに進み、4つの駒を最初にゴールさせましょう。
          </p>
        </section>

        <section className="game-layout" aria-label="ターブの対戦盤">
          <aside className="side-column left-column">
            <section className="panel status-panel">
              <div className="panel-label"><span>対局状況</span><Info size={13} /></div>
              <h2 className="panel-heading">{winner ? `${playerMeta[winner].name}の勝利` : '4人対戦'}</h2>
              <div className="turn-indicator" data-testid="status-turn">
                <span className={`turn-dot ${turn !== 'you' ? `tone-${playerMeta[turn].color}` : 'you'}`} />
                <span>{winner ? `${playerMeta[winner].name}が勝ちました` : `${playerMeta[turn].name}の手番`}</span>
              </div>
              <div className="players-list" data-testid="list-players">
                {players.map((player) => (
                  <div className={`player-row ${turn === player ? 'active' : ''}`} key={player} data-testid={`row-player-${player}`}>
                    <span className={`mini-piece tone-${playerMeta[player].color} shape-${playerMeta[player].shape}`} aria-hidden="true" />
                    <span className="player-row-name">{playerMeta[player].name}</span>
                    <strong data-testid={`text-remaining-${player}`}>{countOnBoard(pieces[player])}</strong>
                  </div>
                ))}
              </div>
              <div className="status-caption">盤上に残っている駒 / 全4個</div>
            </section>

            <section className="panel action-panel">
              <button
                className="primary-button"
                onClick={handleRoll}
                disabled={turn !== 'you' || Boolean(winner) || (rolled !== null && !awaitingTabRoll)}
                data-testid="button-roll"
              >
                {awaitingTabRoll ? 'もう一度振る' : '棒を振る'} <ArrowRight size={16} />
              </button>
              {turn === 'you' && rolled !== null && !awaitingTabRoll && !winner && (
                <div className="move-controls" data-testid="move-controls">
                  <div className="move-controls-label">残り <strong>{rolled}</strong> マスを分けて使う</div>
                  <div className="piece-options" aria-label="動かす駒を選択">
                    {pieces.you.map((progress, index) => (
                      <button
                        key={`piece-option-${index}`}
                        className={`piece-option ${selectedPiece === index ? 'active' : ''}`}
                        disabled={progress >= 24 || movedPieceIndices.includes(index)}
                        onClick={() => {
                          setSelectedPiece(index);
                          playSound('select');
                        }}
                        data-testid={`button-piece-option-${index}`}
                      >
                        <span>駒{index + 1}</span>
                        <small>{progress === 0 ? 'マディナ' : progress === 24 ? 'ゴール' : `${progress}マス`}</small>
                      </button>
                    ))}
                  </div>
                  <div className="move-controls-note">駒をタップしたあと、盤面で進めたいマスをタップしてください。</div>
                </div>
              )}
              <div className="difficulty-wrap">
                <label className="difficulty-label" htmlFor="difficulty">CPUの強さ</label>
                <select id="difficulty" className="difficulty-select" value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)} disabled={difficultyLocked} data-testid="select-difficulty">
                  <option value="weak">弱い</option>
                  <option value="normal">普通</option>
                  <option value="strong">強い</option>
                   <option value="expert">達人</option>
                </select>
              </div>
              {winner && (
                <div className="winner-banner" data-testid="status-winner">
                  {playerMeta[winner].name}の勝利
                  <small>4つの駒をすべてゴール</small>
                </div>
              )}
            </section>
          </aside>

          <section className="board-column">
            <div className="board-header">
              <span className="board-meta">4人対戦 ・ 4個の駒 ・ 中央がゴール</span>
              <span className="board-instruction" data-testid="text-instruction">{instruction}</span>
            </div>
            <div className="board-frame" data-testid="board-game">
              <div className="board-grid">
                {Array.from({ length: 25 }, (_, cell) => {
                  const row = Math.floor(cell / 5);
                  const column = cell % 5;
                  const key = `${row}-${column}`;
                  const pathIndex = routeIndex.get(key);
                   const perspectiveLabel = playerRouteLabels.get(key);
                  const isCenter = row === 2 && column === 2;
                  const homePlayer = players.find(
                    (player) => coordKey(routeFor(player)[0]) === key,
                  );
                   const cellLabel = homePlayer === 'you' ? 'M' : perspectiveLabel ?? '';
                  const target = selectedDestinations.some(
                    (destination) => coordKey(destination.coord) === key,
                  );
                  const piecesAtCell = players.flatMap((player) =>
                    pieces[player].map((progress, pieceIndex) => ({
                      player,
                      pieceIndex,
                      progress,
                      coord: getPieceCoord(player, progress),
                    })).filter((piece) => piece.coord && coordKey(piece.coord) === key),
                  );

                  if (isCenter) {
                    return (
                      <button
                        className={`center-start ${target ? 'destination' : ''}`}
                        key="center-goal"
                        onClick={() => handleCellClick(row, column)}
                        aria-label="中央のゴール"
                        data-testid="cell-center-goal"
                      >
                        <div className="center-copy">ゴール<small>4個をここへ</small></div>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={`route-cell-${key}`}
                      className={`board-cell ${pathIndex !== undefined && pathIndex >= 16 ? 'inner-route' : ''} ${homePlayer ? `home-zone ${homePlayer}` : ''} ${target ? 'destination' : ''}`}
                      onClick={() => handleCellClick(row, column)}
                       aria-label={`${homePlayer ? `${playerMeta[homePlayer].name}のマディナ` : `あなた視点のマス ${perspectiveLabel ?? ''}`}${target ? '、移動先' : ''}`}
                      data-testid={`cell-route-${key}`}
                    >
                       <span className="route-number">{cellLabel}</span>
                      <span className="route-arrow" aria-hidden="true">{getDirection(row, column)}</span>
                      {homePlayer && <span className="home-label">マディナ</span>}
                       {piecesAtCell.map((piece, pieceStackIndex) => {
                         const [offsetX, offsetY] = stackOffset(pieceStackIndex, piecesAtCell.length);
                         return (
                        <span
                          key={`${piece.player}-${piece.pieceIndex}`}
                          className={`board-piece tone-${playerMeta[piece.player].color} shape-${playerMeta[piece.player].shape} ${piece.player === 'you' && selectedPiece === piece.pieceIndex ? 'selected' : ''}`}
                           style={{ left: `calc(50% + ${offsetX}px)`, top: `calc(50% + ${offsetY}px)` }}
                          title={`${playerMeta[piece.player].name}の駒`}
                          aria-label={`${playerMeta[piece.player].name}の駒${piece.pieceIndex + 1}`}
                          data-testid={`piece-${piece.player}-${piece.pieceIndex}`}
                        />
                         );
                       })}
                    </button>
                  );
                })}
              </div>
               {celebration && (
                 <div
                   className={`board-event board-event-${celebration.type}`}
                   key={celebration.id}
                   role="status"
                   aria-live="assertive"
                 >
                   {celebration.type === 'goal' ? <Trophy size={24} /> : <Zap size={24} />}
                   <strong>{celebration.type === 'goal' ? 'ゴール！' : 'カット！'}</strong>
                   <span>{celebration.type === 'goal' ? '駒が中央に到着' : '相手の駒をマディナへ'}</span>
                 </div>
               )}
                {winner && ranking && (
                  <div className="winner-overlay" data-testid="winner-overlay" role="dialog" aria-label="結果発表">
                    <div className="winner-overlay-content">
                      <Trophy className="winner-trophy" size={30} />
                      <span className="winner-kicker">FINAL RESULT</span>
                      <h2>結果発表</h2>
                      <strong className="winner-name">{playerMeta[winner].name}の勝利！</strong>
                       <div className="ranking-list" aria-label="ゴール数による順位">
                        {ranking.map((entry) => (
                          <div className="ranking-row" key={entry.player}>
                            <strong className="ranking-rank">{entry.rank}位</strong>
                            <span>{playerMeta[entry.player].name}</span>
                            <small>{entry.goals}個ゴール</small>
                          </div>
                        ))}
                      </div>
                       {expertVictory ? (
                         <div className="title-award-flow">
                           {expertTitleStep === 'prompt' && (
                             <>
                               <p className="title-award-question">ハキーム・ターブとして名を刻みますか？</p>
                               <div className="title-award-actions">
                                 <button
                                   className="primary-button title-action-button"
                                   onClick={() => {
                                     setExpertTitleStep('input');
                                     playSound('ui');
                                   }}
                                   data-testid="button-record-title"
                                 >
                                   刻む
                                 </button>
                                 <button
                                   className="quiet-button title-action-button"
                                   onClick={resetGame}
                                   data-testid="button-skip-title"
                                 >
                                   刻まない
                                 </button>
                               </div>
                             </>
                           )}
                           {expertTitleStep === 'input' && (
                             <form
                               className="title-entry-form"
                               onSubmit={(event) => {
                                 event.preventDefault();
                                 handleSaveTitle();
                               }}
                             >
                               <label htmlFor="title-holder-name">刻む名前</label>
                               <input
                                 id="title-holder-name"
                                 value={titleName}
                                 onChange={(event) => setTitleName(event.target.value)}
                                 maxLength={40}
                                 autoFocus
                                 placeholder="名前を入力"
                                 data-testid="input-title-holder-name"
                               />
                               {titleSaveError && <p className="title-save-error">{titleSaveError}</p>}
                               <button
                                 className="primary-button title-submit-button"
                                 type="submit"
                                 disabled={createTitleHolderMutation.isPending || !titleName.trim()}
                                 data-testid="button-submit-title"
                               >
                                 {createTitleHolderMutation.isPending ? '保存中…' : 'この名前で刻む'}
                               </button>
                             </form>
                           )}
                           {expertTitleStep === 'saved' && (
                             <div className="title-saved-message">
                               <strong>称号を刻みました。</strong>
                               <span>{titleName}</span>
                               <button
                                 className="primary-button replay-button"
                                 onClick={resetGame}
                                 data-testid="button-play-again"
                               >
                                 もう一度遊ぶ
                               </button>
                             </div>
                           )}
                         </div>
                       ) : (
                         <button
                           className="primary-button replay-button"
                           onClick={resetGame}
                           data-testid="button-play-again"
                         >
                           もう一度遊ぶ
                         </button>
                       )}
                    </div>
                  </div>
                )}
                 {winner && ranking && expertVictory && expertTitleStep === 'image' && (
                   <div
                     className="title-award-splash"
                     role="img"
                     aria-label="ハキーム・ターブの称号"
                   >
                     <img
                       src={titleAwardImage}
                       alt="ハキーム・ターブの称号"
                     />
                   </div>
                 )}
            </div>
            <div className="board-legend" data-testid="board-legend">
              {players.map((player) => (
                <span className="legend-item" key={player}>
                  <span className={`legend-piece tone-${playerMeta[player].color} shape-${playerMeta[player].shape}`} />
                  {playerMeta[player].name}
                </span>
              ))}
              <span className="legend-item">→ 外周は反時計回り / 内周は時計回り</span>
            </div>
          </section>

           <aside className="side-column right-column">
             <section className={`panel sticks-panel ${tabEffect ? 'tab-burst' : ''}`} aria-live="polite">
               {tabEffect && <div className="tab-burst-label">ターブ！ <span>＋8</span></div>}
               <div className="panel-label"><span>今回の出目</span><span>{lastRoll ? playerMeta[lastRoll.owner].shortName : '待機中'}</span></div>
                <h2 className="panel-heading">出目を確認</h2>
                <div className="roll-spotlight" aria-live="polite">
                  <span className="roll-spotlight-label">{lastRoll?.isTab ? 'ターブを含む合計' : '合計マス'}</span>
                  <strong>{lastRoll ? lastRoll.total : '—'}</strong>
                  <span className="roll-spotlight-unit">{lastRoll ? 'マス進めます' : '棒を振ると表示'}</span>
                </div>
                <div className="sticks-label">棒の向き</div>
               <div className="sticks" data-testid="display-sticks" aria-label={lastRoll ? (lastRoll.isTab ? `ターブ、合計${lastRoll.total}` : `出目は${lastRoll.value}`) : 'まだ棒を振っていません'}>
                 {sticks.map((isDark, index) => (
                   <span key={`stick-${index}`} className={`stick ${isDark ? 'dark' : ''}`} aria-label={isDark ? '表' : '裏'} />
                 ))}
               </div>
               <div className="stick-key"><span>表 = 1</span><span>全て裏 = ターブ（8）</span></div>
               <div className="roll-result" data-testid="display-roll">
                 {lastRoll ? (
                   <>
                     <strong>{lastRoll.isTab ? 'ターブ' : lastRoll.value}</strong>
                     <span>{playerMeta[lastRoll.owner].name}の出目</span>
                     {lastRoll.isTab && <small>8として加算 ・ 合計 {lastRoll.total}</small>}
                   </>
                 ) : 'まだ振っていません'}
               </div>
             </section>

            <section className="panel history-panel">
              <div className="panel-label"><span>対局履歴</span><span>{history.length}</span></div>
              <ol className="history-list" data-testid="list-move-history">
                {history.map((entry, index) => (
                  <li key={`${entry}-${index}`}>
                    <span className="history-index">{String(history.length - index).padStart(2, '0')}</span>
                    <span data-testid={`text-history-${index}`}>{entry}</span>
                  </li>
                ))}
              </ol>
            </section>

            {rulesOpen ? (
              <section className="panel rules-panel" data-testid="panel-rules">
                <div className="panel-label"><span>遊び方</span><CircleHelp size={13} /></div>
                <h2 className="panel-heading">ターブのルール</h2>
                <p className="rules-copy">
                  4人で遊び、あなた以外の3人はCPUです。各プレイヤーは4個の駒を自分のマディナから始めます。手番では4本の棒を振り、表の数だけ進みます。
                </p>
                <p className="rules-copy">
                  4本すべて裏ならターブです。ターブは8として扱い、もう一度振って出た数と合計してから進みます。ターブが続いた場合も同じです。
                </p>
                <p className="rules-copy">
                  外周は反時計回り、内周は時計回りです。出た目は複数の駒へ自由に分けられます。自分の駒が同じマスに入っても合体せず、それぞれ別の駒として進みます。
                </p>
                <p className="rules-copy">
                  相手と同じマスに入ると相手の駒をカットし、相手のマディナへ戻します。マディナは安全地帯で、カットされず、誰でも入れます。カットまたはゴールで連続手番です。
                </p>
                <p className="rules-note">万博のオマーンパビリオンで見た盤面とルール画像をもとにしたデジタル解釈版です。</p>
              </section>
            ) : (
              <button className="quiet-button rules-trigger" onClick={() => setRulesOpen(true)} data-testid="button-open-rules">ルールと遊び方を見る</button>
            )}
             <button
               className="quiet-button title-holders-trigger"
               onClick={openTitleHolders}
               data-testid="button-open-title-holders"
             >
               称号保持者を見る
             </button>
             {titleHoldersOpen && (
               <div className="title-holders-modal-backdrop" role="presentation" onClick={() => setTitleHoldersOpen(false)}>
                 <section
                   className="title-holders-modal"
                   role="dialog"
                   aria-modal="true"
                   aria-labelledby="title-holders-heading"
                   onClick={(event) => event.stopPropagation()}
                   data-testid="title-holders-modal"
                 >
                   <div className="panel-label">
                     <span>称号の記録</span>
                     <button
                       className="modal-close-button"
                       onClick={() => setTitleHoldersOpen(false)}
                       aria-label="称号保持者一覧を閉じる"
                     >
                       ×
                     </button>
                   </div>
                   <h2 className="panel-heading" id="title-holders-heading">ハキーム・ターブ</h2>
                   {titleHoldersQuery.isLoading ? (
                     <p className="title-holders-state">読み込み中…</p>
                   ) : titleHoldersQuery.isError ? (
                     <p className="title-holders-state title-save-error">読み込めませんでした。</p>
                   ) : titleHoldersQuery.data && titleHoldersQuery.data.length > 0 ? (
                     <ol className="title-holders-list">
                       {titleHoldersQuery.data.map((holder) => (
                         <li key={holder.id}>
                           <strong>{holder.name}</strong>
                           <time dateTime={holder.createdAt}>
                             {new Intl.DateTimeFormat('ja-JP', {
                               year: 'numeric',
                               month: 'long',
                               day: 'numeric',
                             }).format(new Date(holder.createdAt))}
                           </time>
                         </li>
                       ))}
                     </ol>
                   ) : (
                     <p className="title-holders-state">まだ称号保持者はいません。</p>
                   )}
                 </section>
               </div>
             )}
             <button className="quiet-button reset-button" onClick={resetGame} data-testid="button-reset-game">
               ゲームをリセット
             </button>
          </aside>
        </section>
        <footer className="footer-note"><span>4人で遊ぶターブ</span><span>オマーン ・ 大阪 ・ 2025</span></footer>
      </div>
    </main>
  );
}

export default App;