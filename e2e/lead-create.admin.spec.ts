import { test, expect } from "@playwright/test";
import { hasAuthEnv } from "./helpers";

test.skip(!hasAuthEnv, "identifiants E2E absents (.env.test.local)");

test("création d'un lead avec catégorie PAC image Atlantic 990 €, puis filtrable", async ({ page }) => {
  const stamp = Date.now().toString().slice(-6);
  const nom = `E2E${stamp}`;

  await page.goto("/admin/leads/new");
  await expect(page.getByTestId("lead-create-form")).toBeVisible();

  const form = page.getByTestId("lead-create-form");

  // Sélecteurs stables via data-testid (résistants à tout restyle du formulaire).
  await form.getByTestId("lead-first-name").fill("Test");
  await form.getByTestId("lead-last-name").fill(nom);
  await form.getByTestId("lead-phone").fill(`06${stamp}0000`.slice(0, 10));

  // Catégorie : data-testid posé par Task 6
  await form.getByTestId("lead-category-select").selectOption("clim_1euro");

  // Télépro assigné : champ requis — sélection inconditionnelle de la première option réelle.
  await form.getByTestId("lead-assigned-to").selectOption({ index: 1 });

  await page.getByRole("button", { name: /Créer|Ajouter|Enregistrer/ }).click();

  // Attendre la redirection vers /admin/leads/<id> avant de continuer.
  // handleSubmit redirige via router.push(`/admin/leads/${data.id}`).
  await page.waitForURL(/\/admin\/leads\/(?!new)/, { timeout: 10000 });

  // Retour liste, filtrer par catégorie + recherche → le lead doit apparaître.
  await page.goto("/admin/leads?category=clim_1euro");
  await page.getByTestId("filter-search").fill(nom);
  await expect(page.getByText(nom)).toBeVisible({ timeout: 8000 });
});
