import { buildFrenchConjugation } from "../lib/lang-conjugation/french-conjugation";

function getForm(verb: string, tableId: string, label: string): string | undefined {
  const response = buildFrenchConjugation(verb);
  if (response.status !== "ok") {
    throw new Error(`Expected successful conjugation for "${verb}"`);
  }

  for (const section of response.result.sections) {
    const table = section.tables.find((entry: any) => entry.id === tableId);
    if (!table) {
      continue;
    }

    return table.rows.find((row: any) => row.label === label)?.form;
  }

  return undefined;
}

describe("French first-group accent shifts", () => {
  test("does not invent an accent shift for fermer-like verbs", () => {
    expect(getForm("fermer", "present", "je")).toBe("ferme");
    expect(getForm("fermer", "futureSimple", "je")).toBe("fermerai");
  });

  test("keeps nasal stems unchanged for depenser-like verbs", () => {
    expect(getForm("dépenser", "present", "je")).toBe("dépense");
    expect(getForm("dépenser", "futureSimple", "je")).toBe("dépenserai");
  });

  test("keeps nasal stems unchanged for inventer-like verbs while preserving elision", () => {
    expect(getForm("inventer", "present", "j'")).toBe("invente");
    expect(getForm("inventer", "futureSimple", "j'")).toBe("inventerai");
  });

  test("still applies the grave accent to peser-like verbs", () => {
    expect(getForm("peser", "present", "je")).toBe("pèse");
    expect(getForm("peser", "futureSimple", "je")).toBe("pèserai");
  });
});
