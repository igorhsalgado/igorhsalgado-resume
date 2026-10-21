import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadContent, starsEnabled, statusLabel, validateContent } from "../src/content.ts";

const fixtures = path.join(import.meta.dirname, "fixtures/content");

describe("loadContent", () => {
  it("lê o conteúdo válido", async () => {
    const c = await loadContent(path.join(fixtures, "valid"));
    expect(c.profile.name).toBe("Igor Hermann Salgado");
    expect(c.projects).toHaveLength(2);
    const [booking, market] = c.projects;
    expect(booking!.status).toBe("em-desenvolvimento");
    expect(statusLabel(booking!.status)).toBe("em desenvolvimento");
    expect(starsEnabled(booking!)).toBe(true); // sem showStars, as estrelas ficam ligadas
    expect(starsEnabled(market!)).toBe(false);
    expect(c.profile.stack.at(-1)!.secondary).toBe(true);
  });

  // O conteúdo publicado precisa passar na mesma validação.
  it("aceita data/", async () => {
    await expect(loadContent(path.join(import.meta.dirname, "../data"))).resolves.toBeTruthy();
  });

  it.each([
    ["missing", ["profile.json"]],
    ["malformed", ["projects.json", "JSON inválido"]],
    ["unknown-field", ["profile.json", 'campo desconhecido "headlin"']],
    [
      "invalid",
      [
        "projects[0].slug",
        "projects[0].repo",
        "projects[0].title: campo obrigatório",
        'projects[0].status: valor desconhecido "pronto"',
        "projects[1].meta[1]: campo obrigatório",
        'projects[2].slug: "dup" repetido',
      ],
    ],
  ])("recusa %s", async (dir, wants) => {
    const err = await loadContent(path.join(fixtures, dir)).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    for (const want of wants) expect((err as Error).message).toContain(want);
  });

  it("recusa tipo errado", async () => {
    const { mkdtemp, writeFile, copyFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const dir = await mkdtemp(path.join(tmpdir(), "conteudo-"));
    await copyFile(path.join(fixtures, "valid/profile.json"), path.join(dir, "profile.json"));
    await writeFile(path.join(dir, "projects.json"), JSON.stringify([{ slug: "x", tags: "Go" }]));
    await expect(loadContent(dir)).rejects.toThrow("projects[0].tags: esperava lista");
  });
});

describe("validateContent: URLs de contato", () => {
  it.each([
    ["https://www.linkedin.com/in/exemplo", true],
    ["http://exemplo.dev", true],
    [" https://www.linkedin.com/in/x", false],
    ["https://www.linkedin.com/in/x ", false],
    ["javascript:alert(1)", false],
    ["www.linkedin.com/in/x", false],
    ["", false],
  ])("%j válido: %s", async (raw, valid) => {
    const c = await loadContent(path.join(fixtures, "valid"));
    c.profile.contact.linkedin = raw;
    if (valid) expect(() => validateContent(c)).not.toThrow();
    else expect(() => validateContent(c)).toThrow("profile.contact.linkedin");
  });
});
