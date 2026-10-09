// Skill levels players pick at registration (used for level-balanced draws).
import type { SkillLevel } from '@/engine/types';

export interface SkillLevelInfo {
  value: SkillLevel;
  title: string;
  body: string;
  /** 1–4 signal bars shown on the card */
  bars: number;
}

export const SKILL_LEVELS: SkillLevelInfo[] = [
  { value: 'D', title: 'Beginner', body: 'New to the game or to competing', bars: 1 },
  { value: 'C', title: 'Intermediate', body: 'Plays regularly, holds long rallies', bars: 2 },
  { value: 'B', title: 'Competitive', body: 'League or club matches every week', bars: 3 },
  { value: 'A', title: 'Advanced', body: 'Tournament regular, strong all round', bars: 4 },
];

export const levelInfo = (l: SkillLevel): SkillLevelInfo => SKILL_LEVELS.find((s) => s.value === l)!;

/** "Intermediate (C)" */
export const levelLabel = (l: SkillLevel) => `${levelInfo(l).title} (${l})`;
