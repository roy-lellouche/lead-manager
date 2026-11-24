import { describe, expect, it } from "vitest";
import { ceeDocStatus, isCeeDocComplete, parseCeeDocInput, parseCeeDocPatch, safeFileName } from "@/lib/doc-cee";

describe("doc-cee", () => {
  it("rouge sans document, orange avec document, vert une fois marqué complet", () => {
    const file = { path: "a", name: "a.pdf", type: "application/pdf", size: 1, uploaded_at: "" };
    expect(ceeDocStatus({ files: [], completed_at: null })).toBe("incomplet");
    expect(ceeDocStatus({ files: [file], completed_at: null })).toBe("depose");
    expect(ceeDocStatus({ files: [file], completed_at: "2026-11-24T10:00:00Z" })).toBe("complet");
    expect(ceeDocStatus({ files: [], completed_at: "2026-11-24T10:00:00Z" })).toBe("complet");
    expect(isCeeDocComplete({ files: [file], completed_at: null })).toBe(false);
  });

  it("valide une demande", () => {
    expect(parseCeeDocInput({ mandataire: "hellio", client_name: " Dupont ", document: "Facture" })).toEqual({
      value: { mandataire: "hellio", client_name: "Dupont", document: "Facture", request_comment: null, assigned_to: null },
    });
    expect("error" in parseCeeDocInput({ mandataire: "inconnu", client_name: "a", document: "b" })).toBe(true);
    expect("error" in parseCeeDocInput({ mandataire: "ace", client_name: "", document: "b" })).toBe(true);
  });

  it("n'accepte que les champs connus en modification", () => {
    expect(parseCeeDocPatch({ response_comment: " ok ", foo: "bar" })).toEqual({ value: { response_comment: "ok" } });
  });

  it("accepte l'assignation et le commentaire télépro en modification", () => {
    expect(parseCeeDocPatch({ assigned_to: "", telepro_comment: "client rappelé" })).toEqual({
      value: { assigned_to: null, telepro_comment: "client rappelé" },
    });
  });

  it("nettoie les noms de fichier", () => {
    expect(safeFileName("Avis d'impôt été.pdf")).toBe("Avis_d_impot_ete.pdf");
    expect(safeFileName("///")).toBe("_");
  });
});
