import { describe, expect, it } from "vitest";
import { isCeeDocComplete, parseCeeDocInput, parseCeeDocPatch, safeFileName } from "@/lib/doc-cee";

describe("doc-cee", () => {
  it("rouge tant qu'aucun document n'est déposé, vert ensuite", () => {
    expect(isCeeDocComplete({ files: [] })).toBe(false);
    expect(
      isCeeDocComplete({ files: [{ path: "a", name: "a.pdf", type: "application/pdf", size: 1, uploaded_at: "" }] })
    ).toBe(true);
  });

  it("valide une demande", () => {
    expect(parseCeeDocInput({ mandataire: "hellio", client_name: " Dupont ", document: "Facture" })).toEqual({
      value: { mandataire: "hellio", client_name: "Dupont", document: "Facture", request_comment: null },
    });
    expect("error" in parseCeeDocInput({ mandataire: "inconnu", client_name: "a", document: "b" })).toBe(true);
    expect("error" in parseCeeDocInput({ mandataire: "ace", client_name: "", document: "b" })).toBe(true);
  });

  it("n'accepte que les champs connus en modification", () => {
    expect(parseCeeDocPatch({ response_comment: " ok ", foo: "bar" })).toEqual({ value: { response_comment: "ok" } });
  });

  it("nettoie les noms de fichier", () => {
    expect(safeFileName("Avis d'impôt été.pdf")).toBe("Avis_d_impot_ete.pdf");
    expect(safeFileName("///")).toBe("_");
  });
});
