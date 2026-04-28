export type GermanVerbPrefixBehavior = "inseparable" | "separable" | "simple";

export type GermanVerbMetadata = {
  bareInfinitive: string;
  prefixBehavior: GermanVerbPrefixBehavior;
  separablePrefix: string;
};

export const GERMAN_SEPARABLE_PREFIXES = [
  "zurück",
  "zusammen",
  "vorbei",
  "weiter",
  "nieder",
  "empor",
  "herab",
  "heran",
  "hinab",
  "hinaus",
  "hinweg",
  "wieder",
  "ab",
  "an",
  "auf",
  "aus",
  "bei",
  "ein",
  "fest",
  "fort",
  "her",
  "hin",
  "los",
  "mit",
  "nach",
  "vor",
  "weg",
  "zu"
] as const;

export const GERMAN_INSEPARABLE_PREFIXES = ["be", "emp", "ent", "er", "ge", "miss", "ver", "zer"] as const;

const KNOWN_SEPARABLE_GERMAN_VERBS = new Set([
  "abholen",
  "ankommen",
  "aufmachen",
  "aufstehen",
  "ausgehen",
  "einkaufen",
  "mitkommen",
  "mitnehmen",
  "vorstellen",
  "weggehen",
  "zurückkommen",
  "zuhören"
]);

function findGermanSeparablePrefix(infinitive: string): string {
  return (
    [...GERMAN_SEPARABLE_PREFIXES]
      .sort((left, right) => right.length - left.length)
      .find((prefix) => {
        const bare = infinitive.slice(prefix.length);
        return infinitive.startsWith(prefix) && bare.length > 2 && /(?:en|n)$/.test(bare);
      }) ?? ""
  );
}

export function getGermanVerbMetadata(infinitive: string): GermanVerbMetadata {
  const separablePrefix = findGermanSeparablePrefix(infinitive);
  if (separablePrefix && KNOWN_SEPARABLE_GERMAN_VERBS.has(infinitive)) {
    return {
      bareInfinitive: infinitive.slice(separablePrefix.length),
      prefixBehavior: "separable",
      separablePrefix
    };
  }

  if (GERMAN_INSEPARABLE_PREFIXES.some((prefix) => infinitive.startsWith(prefix))) {
    return {
      bareInfinitive: infinitive,
      prefixBehavior: "inseparable",
      separablePrefix: ""
    };
  }

  return {
    bareInfinitive: infinitive,
    prefixBehavior: "simple",
    separablePrefix: ""
  };
}
