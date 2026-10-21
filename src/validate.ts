// Regras de formato usadas tanto na leitura do conteúdo (content.ts) quanto
// nas respostas da API do GitHub (github.ts). Não importa nenhum outro módulo
// do projeto.

const repoNamePattern = /^[\w.-]+\/[\w.-]+$/;
const loginPattern = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

/**
 * Informa se name é um login válido do GitHub: até 39 letras, números e
 * hífens, sem hífen nas pontas nem dois seguidos.
 */
export function isGitHubLogin(name: string): boolean {
  return name.length <= 39 && loginPattern.test(name);
}

/**
 * Informa se name está no formato "dono/nome". "." e ".." são recusados para
 * o nome não escapar do caminho /repos/ da API.
 */
export function isRepoName(name: string): boolean {
  if (!repoNamePattern.test(name)) return false;
  const [owner = "", repo = ""] = name.split("/");
  return owner.replace(/^\.+|\.+$/g, "") !== "" && repo.replace(/^\.+|\.+$/g, "") !== "";
}

// Esquema e autoridade explícitos (http://host...). Recusa "https:host" e
// "https:///x", que o parser de URL do JavaScript aceitaria.
const absoluteHTTP = /^https?:\/\/[^/?#\s]/i;

/**
 * Tira os espaços das pontas de raw e devolve a URL se ela for absoluta http
 * ou https; senão, null. Protege os links da página contra javascript:,
 * data: e afins.
 */
export function httpURL(raw: string): string | null {
  const trimmed = raw.trim();
  if (!absoluteHTTP.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || u.hostname === "") return null;
  } catch {
    return null;
  }
  return trimmed;
}
