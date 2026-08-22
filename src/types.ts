/** Where a voice is being asked to speak. */
export type Runtime = 'browser' | 'container';

/**
 * Whether a voice works in a runtime, and if not, which of the two independent
 * obstacles stopped it. Neither has anything to do with the licence, which is a
 * third question again — see `Licence`.
 */
export type RuntimeStatus =
  /** Spoken, or reachable and of a quality tier that is known to speak. */
  | 'ok'
  /**
   * `low` or `x_low`. @diffusionstudio/vits-web phonemizes against one fixed
   * symbol table instead of the `phoneme_id_map` inside each model's own
   * `.onnx.json`, so inference dies with an index out of range. A browser limit
   * only — a container speaks these perfectly.
   */
  | 'quality'
  /**
   * Absent from vits-web's hardcoded `PATH_MAP`. Its `voices()` call advertises
   * the mirror's index — 124 entries against 119 in the map — so the library
   * offers voices it cannot then download.
   */
  | 'reach';

export type Quality = 'x_low' | 'low' | 'medium' | 'high';

/**
 * What the model's own MODEL_CARD says, and what follows from it.
 *
 * `ship` is the only field anything should branch on, and it is deliberately not
 * derived from `name` at read time: the judgement about what a given licence
 * permits is made once, here, by somebody who read the card — not re-made by
 * every consumer from a string.
 */
export interface Licence {
  /** As written on the MODEL_CARD. `'unclear'` where the card names none. */
  readonly name: string;
  /**
   * May this model be handed on — shipped, mirrored, baked into an image, or
   * offered from a page? CC0 and public domain qualify unconditionally, CC-BY
   * only where `attribution` is rendered, CC BY-NC-SA never, and a card that
   * names no licence is unclear, which is not a yes.
   */
  readonly ship: boolean;
  readonly url?: string;
  /**
   * The notice this voice's licence obliges a consumer to display wherever its
   * audio is used. Present exactly when one is owed. Rendering it is a condition
   * of `ship`, not a courtesy.
   */
  readonly attribution?: string;
  readonly note?: string;
}

/** One piper model, and every answer anybody has established about it. */
export interface Voice {
  /** The model stem, without a backend prefix: `de_DE-thorsten-medium`. */
  readonly id: string;
  readonly name: string;
  readonly lang: string;
  readonly locale: string;
  readonly gender: string;
  readonly quality: Quality;
  /** Size of the `.onnx`, in bytes, as served by both mirrors. */
  readonly bytes: number;
  /** What piper synthesises at. `low` and `x_low` are 16 kHz; medium and high 22.05 kHz. */
  readonly sampleRate: number;
  readonly speakers: number;
  readonly licence: Licence;
  readonly browser: RuntimeStatus;
  readonly container: RuntimeStatus;
  /** How the runtime answers were established: spike, vorlaut, container, rule. */
  readonly proof: string;
  readonly note?: string;
}

/** A voice id as products write it: `piper:de_DE-thorsten-medium`. */
export interface ParsedVoiceId {
  readonly backend: string;
  readonly model: string;
}
