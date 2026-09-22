export type JuiceEvent =
  | { t: "click"; x: number; y: number; n: number; crit: boolean }
  | { t: "layer"; layer: number }
  | { t: "upgrade"; id?: string; tierUp?: boolean; name?: string }
  | { t: "gacha"; rarity: number; name: string; id: string; isNew: boolean }
  | { t: "orb" }
  | { t: "prestige" }
  | { t: "mission" };

type Fn = (e: JuiceEvent) => void;
const fns = new Set<Fn>();

export const juice = {
  on(fn: Fn) {
    fns.add(fn);
    return () => {
      fns.delete(fn);
    };
  },
  emit(e: JuiceEvent) {
    fns.forEach((f) => f(e));
  },
};
