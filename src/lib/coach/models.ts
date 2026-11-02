// The exported model weights (public/football/models.json, written by the library's coach/export.py): StandardScaler
// + logistic regression (pass, shot) or ridge (value). score = ((x - mean) / scale) . coef + intercept; probability =
// sigmoid(score) for link "logit", the score itself for "identity".
import type { AdviceParams, Coach } from "./advice";
import { PASS_FEATURES, SHOT_FEATURES, VALUE_FEATURES } from "./features";
import type { PitchControlParams } from "./pitchControl";

export interface LinearModel { features: string[]; link: "logit" | "identity"; mean: number[]; scale: number[]; coef: number[]; intercept: number }
export interface ModelsJson {
  trained_without: string; trained_on: string[];
  pass: LinearModel; value: LinearModel & { horizon_s?: number }; shot: LinearModel;
  pitch_control: PitchControlParams; advice: AdviceParams;
}

export function predictLinear(m: LinearModel, x: readonly number[]): number {
  let z = m.intercept;
  for (let i = 0; i < x.length; i++) z += ((x[i] - m.mean[i]) / m.scale[i]) * m.coef[i];
  return m.link === "logit" ? 1 / (1 + Math.exp(-z)) : z;
}

function check(m: LinearModel, names: readonly string[], what: string) {
  if (m.features.join() !== names.join()) throw new Error(`${what} features [${m.features}] differ from the port's [${names}]`);
}

export function coachFromModels(w: ModelsJson): Coach {
  check(w.pass, PASS_FEATURES, "pass");
  check(w.value, VALUE_FEATURES, "value");
  check(w.shot, SHOT_FEATURES, "shot");
  return {
    predict: { pass: (x) => predictLinear(w.pass, x), value: (x) => predictLinear(w.value, x), shot: (x) => predictLinear(w.shot, x) },
    pc: w.pitch_control,
    advice: w.advice,
  };
}
