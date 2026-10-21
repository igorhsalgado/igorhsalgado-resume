import { describe, expect, it } from "vitest";
import { httpURL, isGitHubLogin, isRepoName } from "../src/validate.ts";

describe("isRepoName", () => {
  it.each([
    ["igorhsalgado/igorhsalgado-resume", true],
    ["ArthurNunesDev/Projeto-Integrador-Computacional", true],
    ["a.b/c_d.e", true],
    ["a/.github", true],
    ["", false],
    ["sem-barra", false],
    ["a/b/c", false],
    ["../etc", false],
    ["a/..", false],
    ["./b", false],
    ["a/b?x=1", false],
    ["a/b#x", false],
    ["a/b c", false],
    ["a%2fb/c", false],
    [" a/b", false],
    ["dono/nome/", false],
  ])("%j → %s", (name, want) => {
    expect(isRepoName(name)).toBe(want);
  });
});

describe("httpURL", () => {
  it.each([
    ["https://example.com/x", "https://example.com/x"],
    ["http://example.com", "http://example.com"],
    [" https://example.com ", "https://example.com"],
    ["\thttps://example.com\n", "https://example.com"],
    ["javascript:alert(1)", null],
    ["data:text/html,oi", null],
    ["ftp://example.com/file", null],
    ["/relativo", null],
    ["https://", null],
    ["https:example.com", null],
    ["", null],
  ])("%j → %j", (raw, want) => {
    expect(httpURL(raw)).toBe(want);
  });
});

describe("isGitHubLogin", () => {
  it.each([
    ["igorhsalgado", true],
    ["The-Smart-Booking", true],
    ["a", true],
    ["", false],
    ["-a", false],
    ["a-", false],
    ["a--b", false],
    ["a_b", false],
    ["a/b", false],
    ["../x", false],
    ["a.b", false],
    ["abcdefghijabcdefghijabcdefghij123456789", true],
    ["abcdefghijabcdefghijabcdefghij1234567890", false],
  ])("%j → %s", (name, want) => {
    expect(isGitHubLogin(name)).toBe(want);
  });
});
