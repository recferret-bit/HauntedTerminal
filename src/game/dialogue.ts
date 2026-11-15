import type { BubbleStyle, KernelEvent, SpeakerMood } from '../contracts/events.js';

export type DialogueEvent = Extract<KernelEvent, { type: 'OBSTACLE_DIALOGUE_RENDERED' }>;

export interface DialogueSpec {
  obstacleId: string;
  speaker: string;
  style: BubbleStyle;
  mood: SpeakerMood;
  text: string;
  /** Commands the bubble highlights. */
  tokens: readonly string[];
  /** Inode the bubble anchors on (a socket). */
  anchor: number;
  portrait?: string;
  /** Terminal line printed above the text. Default: `[ speaker // style ]` in magenta. */
  banner?: string;
}

/** A speech bubble on a socket: the one event a talking socket, a script `dialogue` step and a lab riddle all emit. */
export function dialogueEvent(d: DialogueSpec): DialogueEvent {
  return {
    type: 'OBSTACLE_DIALOGUE_RENDERED',
    payload: {
      obstacleId: d.obstacleId,
      speakerName: d.speaker,
      portraitSprite: d.portrait ?? 'socket_guardian',
      mood: d.mood,
      bubbleStyle: d.style,
      anchorInodeId: d.anchor,
      pages: [{ text: d.text, highlightedUnixTokens: [...d.tokens] }],
      ansiTerminalBanner: d.banner ?? `\x1b[35m[ ${d.speaker} // ${d.style} ]\x1b[0m\n`,
    },
  };
}
