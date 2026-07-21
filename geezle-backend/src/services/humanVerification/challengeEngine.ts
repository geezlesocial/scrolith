import { randomBytes, createHash } from 'crypto';
import type {
  ChallengeOption,
  GeneratedChallenge,
  HumanVerificationChallengeType,
  HumanVerificationDifficulty
} from './types';

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const shuffle = <T,>(items: T[]): T[] => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const optionId = () => randomBytes(4).toString('hex');

const toOptions = (values: Array<string | number>, correct: string | number): ChallengeOption[] => {
  const correctStr = String(correct);
  const distractors = Array.from(new Set(values.map(String))).filter((v) => v !== correctStr);
  // Always include the correct answer among exactly four options.
  while (distractors.length < 3) {
    const n = String(randInt(0, 99));
    if (n !== correctStr && !distractors.includes(n)) distractors.push(n);
  }
  const picked = shuffle([correctStr, ...distractors.slice(0, 3)]);
  return picked.map((value) => ({
    id: optionId(),
    label: value,
    value
  }));
};

const resolveDifficulty = (
  difficulty: HumanVerificationDifficulty,
  progressiveLevel = 0
): Exclude<HumanVerificationDifficulty, 'automatic'> => {
  if (difficulty !== 'automatic') return difficulty;
  if (progressiveLevel >= 3) return 'hard';
  if (progressiveLevel >= 1) return 'medium';
  return pick(['easy', 'medium'] as const);
};

const difficultyBand = (d: Exclude<HumanVerificationDifficulty, 'automatic'>) => {
  switch (d) {
    case 'easy':
      return { max: 12, mulMax: 5 };
    case 'medium':
      return { max: 40, mulMax: 9 };
    case 'hard':
      return { max: 90, mulMax: 12 };
    case 'extreme':
      return { max: 200, mulMax: 15 };
    default:
      return { max: 20, mulMax: 7 };
  }
};

export function hashAnswer(value: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${String(value).trim().toLowerCase()}`).digest('hex');
}

export function generatePublicToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

function genArithmetic(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const band = difficultyBand(diff);
  const ops = diff === 'easy' ? (['+', '-'] as const) : (['+', '-', '×'] as const);
  const op = pick([...ops]);
  let a = randInt(1, band.max);
  let b = randInt(1, op === '×' ? band.mulMax : band.max);
  if (op === '-' && b > a) [a, b] = [b, a];
  const correct =
    op === '+' ? a + b : op === '-' ? a - b : a * b;
  const display = `${a} ${op} ${b}`;
  const distractors = [
    correct + 1,
    correct - 1,
    correct + randInt(2, 5),
    correct - randInt(2, 4),
    a + b + 2,
    Math.abs(a - b)
  ];
  return {
    challengeType: 'arithmetic',
    difficulty: diff,
    prompt: {
      title: 'Solve',
      instruction: 'Select the correct result.',
      display,
      kind: 'arithmetic'
    },
    options: toOptions(distractors, correct),
    correctValue: String(correct)
  };
}

function genSequence(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const step = diff === 'easy' ? pick([2, 3, 5]) : randInt(2, 9);
  const start = randInt(1, 20);
  const terms = [start, start + step, start + step * 2];
  const correct = start + step * 3;
  const display = `${terms.join('  ')}  ?`;
  return {
    challengeType: 'sequence',
    difficulty: diff,
    prompt: {
      title: 'Number sequence',
      instruction: 'What comes next?',
      display,
      kind: 'sequence'
    },
    options: toOptions([correct + step, correct - step, correct + 1, correct * 2, start], correct),
    correctValue: String(correct)
  };
}

function genShapeCount(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const shapes = [
    { char: '⭐', name: 'stars' },
    { char: '●', name: 'circles' },
    { char: '■', name: 'squares' },
    { char: '▲', name: 'triangles' }
  ];
  const shape = pick(shapes);
  const count = randInt(diff === 'easy' ? 2 : 3, diff === 'extreme' ? 12 : 8);
  const visual = Array.from({ length: count }, () => shape.char);
  return {
    challengeType: 'shape_count',
    difficulty: diff,
    prompt: {
      title: 'Count',
      instruction: `How many ${shape.name}?`,
      visual,
      display: visual.join(''),
      kind: 'shape_count'
    },
    options: toOptions([count + 1, count - 1, count + 2, Math.max(1, count - 2)], count),
    correctValue: String(count)
  };
}

function genIconCount(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const icons = [
    { char: '🚗', name: 'cars' },
    { char: '🌳', name: 'trees' },
    { char: '📚', name: 'books' },
    { char: '📱', name: 'phones' },
    { char: '🌸', name: 'flowers' },
    { char: '🐶', name: 'animals' }
  ];
  const icon = pick(icons);
  const count = randInt(2, diff === 'easy' ? 5 : 9);
  const visual = Array.from({ length: count }, () => icon.char);
  return {
    challengeType: 'icon_count',
    difficulty: diff,
    prompt: {
      title: 'Icon count',
      instruction: `How many ${icon.name}?`,
      visual,
      display: visual.join(' '),
      kind: 'icon_count'
    },
    options: toOptions([count + 1, count - 1, count + 2, Math.max(1, count - 2)], count),
    correctValue: String(count)
  };
}

function genLargest(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const maxN = difficultyBand(diff).max;
  const nums = shuffle([
    randInt(1, maxN),
    randInt(1, maxN),
    randInt(1, maxN),
    randInt(1, maxN)
  ]);
  // ensure uniqueness
  const unique: number[] = [];
  for (const n of nums) {
    let v = n;
    while (unique.includes(v)) v += 1;
    unique.push(v);
  }
  const correct = Math.max(...unique);
  return {
    challengeType: 'largest_number',
    difficulty: diff,
    prompt: {
      title: 'Largest number',
      instruction: 'Choose the largest number.',
      display: unique.join('   '),
      kind: 'largest_number'
    },
    options: toOptions(unique, correct),
    correctValue: String(correct)
  };
}

function genSmallest(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const maxN = difficultyBand(diff).max;
  const unique: number[] = [];
  while (unique.length < 4) {
    const n = randInt(1, maxN);
    if (!unique.includes(n)) unique.push(n);
  }
  const correct = Math.min(...unique);
  return {
    challengeType: 'smallest_number',
    difficulty: diff,
    prompt: {
      title: 'Smallest number',
      instruction: 'Choose the smallest number.',
      display: unique.join('   '),
      kind: 'smallest_number'
    },
    options: toOptions(unique, correct),
    correctValue: String(correct)
  };
}

function genOddEven(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const wantOdd = Math.random() > 0.5;
  const pool: number[] = [];
  while (pool.length < 4) {
    const n = randInt(1, difficultyBand(diff).max);
    if (!pool.includes(n)) pool.push(n);
  }
  // ensure at least one of each
  if (!pool.some((n) => n % 2 === 1)) pool[0] = pool[0] + 1;
  if (!pool.some((n) => n % 2 === 0)) pool[1] = pool[1] + 1;
  const correct = pick(pool.filter((n) => (wantOdd ? n % 2 === 1 : n % 2 === 0)));
  return {
    challengeType: 'odd_even',
    difficulty: diff,
    prompt: {
      title: wantOdd ? 'Odd number' : 'Even number',
      instruction: wantOdd ? 'Select an odd number.' : 'Select an even number.',
      display: pool.join('   '),
      kind: 'odd_even'
    },
    options: toOptions(pool, correct),
    correctValue: String(correct)
  };
}

function genColor(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const colors = [
    { value: 'blue', label: 'Blue', swatch: '#2563eb' },
    { value: 'green', label: 'Green', swatch: '#16a34a' },
    { value: 'red', label: 'Red', swatch: '#dc2626' },
    { value: 'yellow', label: 'Yellow', swatch: '#eab308' },
    { value: 'purple', label: 'Purple', swatch: '#7c3aed' },
    { value: 'orange', label: 'Orange', swatch: '#ea580c' }
  ];
  const selected = shuffle(colors).slice(0, 4);
  const correct = pick(selected);
  return {
    challengeType: 'color',
    difficulty: diff,
    prompt: {
      title: 'Color recognition',
      instruction: `Click ${correct.label}.`,
      kind: 'color',
      visual: selected.map((c) => c.swatch)
    },
    options: selected.map((c) => ({
      id: optionId(),
      label: c.label,
      value: c.value
    })),
    correctValue: correct.value
  };
}

function genEmoji(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const faces = [
    { value: 'smile', label: '😊', name: 'smiling face' },
    { value: 'laugh', label: '😂', name: 'laughing face' },
    { value: 'cool', label: '😎', name: 'cool face' },
    { value: 'cry', label: '😭', name: 'crying face' },
    { value: 'wink', label: '😉', name: 'winking face' },
    { value: 'think', label: '🤔', name: 'thinking face' }
  ];
  const selected = shuffle(faces).slice(0, 4);
  const correct = pick(selected);
  return {
    challengeType: 'emoji',
    difficulty: diff,
    prompt: {
      title: 'Emoji recognition',
      instruction: `Click the ${correct.name}.`,
      visual: selected.map((f) => f.label),
      kind: 'emoji'
    },
    options: selected.map((f) => ({
      id: optionId(),
      label: f.label,
      value: f.value
    })),
    correctValue: correct.value
  };
}

function genPattern(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const patterns = [
    { display: 'A B A B ?', correct: 'A', options: ['A', 'B', 'C', 'D'] },
    { display: '1 2 1 2 ?', correct: '1', options: ['1', '2', '3', '4'] },
    { display: '◆ ○ ◆ ○ ?', correct: '◆', options: ['◆', '○', '■', '▲'] },
    { display: '🔴 🔵 🔴 🔵 ?', correct: '🔴', options: ['🔴', '🔵', '🟢', '🟡'] }
  ];
  const p = pick(patterns);
  return {
    challengeType: 'pattern',
    difficulty: diff,
    prompt: {
      title: 'Pattern',
      instruction: 'What completes the pattern?',
      display: p.display,
      kind: 'pattern'
    },
    options: toOptions(p.options, p.correct),
    correctValue: p.correct
  };
}

function genLogic(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const items = [
    { q: 'If all roses are flowers, and this is a rose, is it a flower?', correct: 'Yes', options: ['Yes', 'No', 'Maybe', 'Unknown'] },
    { q: '2 is less than 5. Is 5 greater than 2?', correct: 'Yes', options: ['Yes', 'No', 'Equal', 'Unknown'] },
    { q: 'A square has how many sides?', correct: '4', options: ['3', '4', '5', '6'] },
    { q: 'Which day comes after Monday?', correct: 'Tuesday', options: ['Sunday', 'Tuesday', 'Friday', 'Saturday'] }
  ];
  const item = pick(items);
  return {
    challengeType: 'logic',
    difficulty: diff,
    prompt: {
      title: 'Logic',
      instruction: item.q,
      kind: 'logic'
    },
    options: toOptions(item.options, item.correct),
    correctValue: item.correct
  };
}

function genTime(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const items = [
    { q: 'When does the sun rise?', correct: 'Morning', options: ['Morning', 'Night', 'Midnight', 'Never'] },
    { q: 'When is it typically dark outside?', correct: 'Night', options: ['Morning', 'Noon', 'Night', 'Afternoon'] },
    { q: 'Which time of day is sunset?', correct: 'Evening', options: ['Morning', 'Noon', 'Evening', 'Midnight'] },
    { q: 'Breakfast is usually eaten in the…', correct: 'Morning', options: ['Morning', 'Night', 'Midnight', 'Never'] }
  ];
  const item = pick(items);
  return {
    challengeType: 'time',
    difficulty: diff,
    prompt: {
      title: 'Time of day',
      instruction: item.q,
      kind: 'time'
    },
    options: toOptions(item.options, item.correct),
    correctValue: item.correct
  };
}

function genObject(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const sets = [
    {
      q: 'Click the apple.',
      correct: 'apple',
      options: [
        { value: 'apple', label: '🍎' },
        { value: 'car', label: '🚗' },
        { value: 'dog', label: '🐶' },
        { value: 'chair', label: '🪑' }
      ]
    },
    {
      q: 'Click the car.',
      correct: 'car',
      options: [
        { value: 'apple', label: '🍎' },
        { value: 'car', label: '🚗' },
        { value: 'dog', label: '🐶' },
        { value: 'chair', label: '🪑' }
      ]
    },
    {
      q: 'Click the dog.',
      correct: 'dog',
      options: [
        { value: 'apple', label: '🍎' },
        { value: 'car', label: '🚗' },
        { value: 'dog', label: '🐶' },
        { value: 'chair', label: '🪑' }
      ]
    }
  ];
  const set = pick(sets);
  const options = shuffle(set.options).map((o) => ({
    id: optionId(),
    label: o.label,
    value: o.value
  }));
  return {
    challengeType: 'object',
    difficulty: diff,
    prompt: {
      title: 'Object recognition',
      instruction: set.q,
      kind: 'object',
      visual: options.map((o) => o.label)
    },
    options,
    correctValue: set.correct
  };
}

function genWord(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const pairs = [
    { word: 'HELLO', correct: 'HELLO', options: ['HELLO', 'WORLD', 'HOUSE', 'APPLE'] },
    { word: 'SCROLITH', correct: 'SCROLITH', options: ['SCROLITH', 'SCROLL', 'SOCIAL', 'SECURE'] },
    { word: 'VERIFY', correct: 'VERIFY', options: ['VERIFY', 'VISION', 'VALUE', 'VOICE'] }
  ];
  const p = pick(pairs);
  return {
    challengeType: 'word',
    difficulty: diff,
    prompt: {
      title: 'Word matching',
      instruction: `Select the word: ${p.word}`,
      display: p.word,
      kind: 'word'
    },
    options: toOptions(p.options, p.correct),
    correctValue: p.correct
  };
}

function genLetter(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ'.split('');
  const correct = pick(letters);
  const distractors = shuffle(letters.filter((l) => l !== correct)).slice(0, 3);
  return {
    challengeType: 'letter',
    difficulty: diff,
    prompt: {
      title: 'Letter recognition',
      instruction: `Click the letter ${correct}`,
      display: correct,
      kind: 'letter'
    },
    options: toOptions([...distractors, correct], correct),
    correctValue: correct
  };
}

function genCommonSense(diff: Exclude<HumanVerificationDifficulty, 'automatic'>): GeneratedChallenge {
  const items = [
    {
      q: 'Which one is a fruit?',
      correct: 'Apple',
      options: ['Apple', 'Car', 'Chair', 'Phone']
    },
    {
      q: 'Which one can you drink?',
      correct: 'Water',
      options: ['Water', 'Rock', 'Cloud', 'Shoe']
    },
    {
      q: 'Which animal can fly?',
      correct: 'Bird',
      options: ['Bird', 'Fish', 'Cat', 'Cow']
    },
    {
      q: 'Which is used to write?',
      correct: 'Pen',
      options: ['Pen', 'Shoe', 'Plate', 'Window']
    }
  ];
  const item = pick(items);
  return {
    challengeType: 'common_sense',
    difficulty: diff,
    prompt: {
      title: 'Common sense',
      instruction: item.q,
      kind: 'common_sense'
    },
    options: toOptions(item.options, item.correct),
    correctValue: item.correct
  };
}

const GENERATORS: Record<
  HumanVerificationChallengeType,
  (d: Exclude<HumanVerificationDifficulty, 'automatic'>) => GeneratedChallenge
> = {
  arithmetic: genArithmetic,
  sequence: genSequence,
  shape_count: genShapeCount,
  icon_count: genIconCount,
  largest_number: genLargest,
  smallest_number: genSmallest,
  odd_even: genOddEven,
  color: genColor,
  emoji: genEmoji,
  pattern: genPattern,
  logic: genLogic,
  time: genTime,
  object: genObject,
  word: genWord,
  letter: genLetter,
  common_sense: genCommonSense
};

export function generateChallenge(params: {
  enabledTypes: HumanVerificationChallengeType[];
  difficulty: HumanVerificationDifficulty;
  progressiveLevel?: number;
}): GeneratedChallenge {
  const enabled =
    params.enabledTypes.length > 0
      ? params.enabledTypes
      : (['arithmetic', 'common_sense'] as HumanVerificationChallengeType[]);
  const type = pick(enabled);
  const diff = resolveDifficulty(params.difficulty, params.progressiveLevel || 0);
  return GENERATORS[type](diff);
}

export function parseUserAgentBrowser(ua?: string | null): string {
  const s = String(ua || '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('edg/')) return 'Edge';
  if (s.includes('chrome/')) return 'Chrome';
  if (s.includes('firefox/')) return 'Firefox';
  if (s.includes('safari/') && !s.includes('chrome')) return 'Safari';
  if (s.includes('opera') || s.includes('opr/')) return 'Opera';
  return 'Other';
}
